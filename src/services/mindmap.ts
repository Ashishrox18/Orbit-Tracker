import "server-only";

import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import {
  mindMapEdges,
  mindMaps,
  mindMapNodes,
  type MindMap,
  type MindMapEdge,
  type MindMapNode,
  type User,
} from "@/db/schema";
import { seedNodeSummary, suggestLinks } from "@/lib/ai/learn";
import { MAP_GRID_X, MAP_GRID_Y } from "@/lib/mindmap-grid";
import { shiftISO, todayISO } from "@/lib/time";
import { enqueue } from "./learn";

/**
 * Mind maps.
 *
 * Each map is an independent web — its own nodes, notes and layout. The
 * universal map is created on first use and never deleted; subject maps sit
 * alongside it. A concept in two maps is genuinely two nodes, which is the
 * trade the simpler model buys.
 */

export const UNIVERSAL_NAME = "Universal";

/**
 * Resolve the universal map, creating it if needed and adopting any node that
 * predates maps existing. Without the adoption step those nodes would be
 * invisible on every canvas.
 */
export async function ensureUniversalMap(userId: string): Promise<MindMap> {
  const existing = await db
    .select()
    .from(mindMaps)
    .where(and(eq(mindMaps.userId, userId), eq(mindMaps.kind, "universal")))
    .limit(1);

  let universal = existing[0];

  if (!universal) {
    const created = await db
      .insert(mindMaps)
      .values({ userId, name: UNIVERSAL_NAME, kind: "universal" })
      .onConflictDoUpdate({
        target: [mindMaps.userId, mindMaps.name],
        set: { kind: "universal" },
      })
      .returning();
    universal = created[0];
    if (!universal) throw new Error("Could not create the universal map.");
  }

  await db
    .update(mindMapNodes)
    .set({ mapId: universal.id })
    .where(and(eq(mindMapNodes.userId, userId), isNull(mindMapNodes.mapId)));

  return universal;
}

export async function listMaps(userId: string): Promise<MindMap[]> {
  await ensureUniversalMap(userId);
  const rows = await db
    .select()
    .from(mindMaps)
    .where(eq(mindMaps.userId, userId))
    .orderBy(asc(mindMaps.createdAt));
  // Universal always leads, whatever order they were created in.
  return rows.sort((a, b) => (a.kind === "universal" ? -1 : b.kind === "universal" ? 1 : 0));
}

export interface MindMapActivity {
  nodesAdded: number;
  edgesAdded: number;
}

/** Across every map, not just the active one — the daily nudge cares whether
 * the web grew at all today, not which map it grew in. */
export async function mindMapActivityToday(userId: string, today: string): Promise<MindMapActivity> {
  const start = new Date(`${today}T00:00:00Z`);
  const end = new Date(`${shiftISO(today, 1)}T00:00:00Z`);

  const [nodes, edges] = await Promise.all([
    db
      .select({ id: mindMapNodes.id })
      .from(mindMapNodes)
      .where(and(eq(mindMapNodes.userId, userId), gte(mindMapNodes.createdAt, start), lt(mindMapNodes.createdAt, end))),
    db
      .select({ id: mindMapEdges.id })
      .from(mindMapEdges)
      .where(and(eq(mindMapEdges.userId, userId), gte(mindMapEdges.createdAt, start), lt(mindMapEdges.createdAt, end))),
  ]);

  return { nodesAdded: nodes.length, edgesAdded: edges.length };
}

export async function createMap(user: User, name: string): Promise<MindMap> {
  const inserted = await db
    .insert(mindMaps)
    .values({ userId: user.id, name, kind: "subject" })
    .onConflictDoUpdate({
      target: [mindMaps.userId, mindMaps.name],
      set: { name },
    })
    .returning();

  const map = inserted[0];
  if (!map) throw new Error("Could not create the map.");
  return map;
}

export async function renameMap(user: User, id: string, name: string): Promise<MindMap | null> {
  const updated = await db
    .update(mindMaps)
    .set({ name })
    .where(and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id)))
    .returning();
  return updated[0] ?? null;
}

/** Refuses to delete the universal map — it is the one that never resets. */
export async function deleteMap(user: User, id: string): Promise<"ok" | "not-found" | "universal"> {
  const rows = await db
    .select()
    .from(mindMaps)
    .where(and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id)))
    .limit(1);

  const map = rows[0];
  if (!map) return "not-found";
  if (map.kind === "universal") return "universal";

  await db.delete(mindMaps).where(eq(mindMaps.id, id));
  return "ok";
}

export interface MapContents {
  map: MindMap;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export async function mapContents(userId: string, mapId?: string): Promise<MapContents> {
  const universal = await ensureUniversalMap(userId);
  let map = universal;

  if (mapId && mapId !== universal.id) {
    const rows = await db
      .select()
      .from(mindMaps)
      .where(and(eq(mindMaps.id, mapId), eq(mindMaps.userId, userId)))
      .limit(1);
    map = rows[0] ?? universal;
  }

  const nodes = await db
    .select()
    .from(mindMapNodes)
    .where(and(eq(mindMapNodes.userId, userId), eq(mindMapNodes.mapId, map.id)))
    .orderBy(asc(mindMapNodes.createdAt));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const allEdges = await db
    .select()
    .from(mindMapEdges)
    .where(eq(mindMapEdges.userId, userId));

  // Edges are global rows; only those wholly inside this map belong on it.
  const edges = allEdges.filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId));

  return { map, nodes, edges };
}

/**
 * Place a new node on the next open grid cell, filling row by row. Every
 * node lands on the same lattice the client snaps drags to, so a freshly
 * created card is never the one thing that's out of alignment.
 */
const GRID_COLUMNS = 6;

function nextPosition(count: number): { x: number; y: number } {
  const col = count % GRID_COLUMNS;
  const row = Math.floor(count / GRID_COLUMNS);
  return { x: col * MAP_GRID_X, y: row * MAP_GRID_Y };
}

export async function createNode(
  user: User,
  input: {
    mapId?: string;
    title: string;
    domain: string;
    notes?: string;
    autoSummary: boolean;
  },
): Promise<{ node: MindMapNode; aiUsed: boolean }> {
  const { map, nodes } = await mapContents(user.id, input.mapId);

  let summary: string | null = null;
  let domain = input.domain;
  let aiUsed = false;

  if (input.autoSummary) {
    const { data, source } = await seedNodeSummary(input.title);
    summary = data.summary;
    // Only let the model choose the domain when the user left the default.
    if (input.domain === "abstract") domain = data.domain;
    aiUsed = source !== "fallback";
  }

  const { x, y } = nextPosition(nodes.length);

  const inserted = await db
    .insert(mindMapNodes)
    .values({
      userId: user.id,
      mapId: map.id,
      title: input.title,
      domain,
      summary,
      notes: input.notes ?? null,
      x,
      y,
    })
    .onConflictDoUpdate({
      target: [mindMapNodes.mapId, mindMapNodes.title],
      set: { domain, notes: input.notes ?? null, updatedAt: new Date() },
    })
    .returning();

  const node = inserted[0];
  if (!node) throw new Error("Could not create the node.");
  return { node, aiUsed };
}

export async function updateNode(
  user: User,
  input: {
    id: string;
    title?: string;
    domain?: string;
    notes?: string;
    summary?: string;
    resourceUrl?: string;
    x?: number;
    y?: number;
  },
): Promise<MindMapNode | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["title", "domain", "notes", "summary", "x", "y"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  if (input.resourceUrl !== undefined) patch.resourceUrl = input.resourceUrl || null;

  const updated = await db
    .update(mindMapNodes)
    .set(patch)
    .where(and(eq(mindMapNodes.id, input.id), eq(mindMapNodes.userId, user.id)))
    .returning();
  return updated[0] ?? null;
}

/** Dragging fires often, so position saves skip the updatedAt bump. */
export async function moveNode(
  user: User,
  id: string,
  x: number,
  y: number,
): Promise<boolean> {
  const updated = await db
    .update(mindMapNodes)
    .set({ x, y })
    .where(and(eq(mindMapNodes.id, id), eq(mindMapNodes.userId, user.id)))
    .returning({ id: mindMapNodes.id });
  return updated.length > 0;
}

export async function deleteNode(user: User, id: string): Promise<boolean> {
  const deleted = await db
    .delete(mindMapNodes)
    .where(and(eq(mindMapNodes.id, id), eq(mindMapNodes.userId, user.id)))
    .returning();
  return deleted.length > 0;
}

/**
 * Turn a confirmed link into a recall question.
 *
 * This is the mechanism behind "map it once and it stays": a diagram you look
 * at decays, but a relationship you have to retrieve does not. Only confirmed
 * links schedule — an unaccepted AI suggestion is not yet the user's belief.
 */
async function scheduleLinkRecall(
  userId: string,
  fromId: string,
  toId: string,
  relationship: string,
  edgeId: string,
): Promise<void> {
  const rows = await db
    .select({ id: mindMapNodes.id, title: mindMapNodes.title })
    .from(mindMapNodes)
    .where(inArray(mindMapNodes.id, [fromId, toId]));

  const from = rows.find((r) => r.id === fromId);
  const to = rows.find((r) => r.id === toId);
  if (!from || !to) return;

  await enqueue(
    userId,
    "link",
    edgeId,
    `How are "${from.title}" and "${to.title}" connected?`,
    `${from.title} ${relationship} ${to.title}.`,
    todayISO(),
  );
}

export async function linkNodes(
  user: User,
  fromId: string,
  toId: string,
  relationship: string,
  suggested = false,
): Promise<MindMapEdge | null> {
  if (fromId === toId) return null; // a node linked to itself carries no information

  const inserted = await db
    .insert(mindMapEdges)
    .values({ userId: user.id, fromId, toId, relationship, suggested })
    .onConflictDoUpdate({
      target: [mindMapEdges.userId, mindMapEdges.fromId, mindMapEdges.toId],
      set: { relationship, suggested },
    })
    .returning();

  const edge = inserted[0] ?? null;
  if (edge && !suggested) {
    await scheduleLinkRecall(user.id, fromId, toId, relationship, edge.id);
  }
  return edge;
}

export async function unlinkNodes(user: User, id: string): Promise<boolean> {
  const deleted = await db
    .delete(mindMapEdges)
    .where(and(eq(mindMapEdges.id, id), eq(mindMapEdges.userId, user.id)))
    .returning();
  return deleted.length > 0;
}

export async function acceptLink(user: User, id: string): Promise<boolean> {
  const updated = await db
    .update(mindMapEdges)
    .set({ suggested: false })
    .where(and(eq(mindMapEdges.id, id), eq(mindMapEdges.userId, user.id)))
    .returning();

  // Accepting is the moment it becomes the user's own belief, so that is when
  // it earns a place in the review queue.
  const edge = updated[0];
  if (edge) {
    await scheduleLinkRecall(user.id, edge.fromId, edge.toId, edge.relationship, edge.id);
  }
  return updated.length > 0;
}

/**
 * Ask for link suggestions within one map and store them flagged. The user
 * accepts or discards — an AI-authored graph would not be their own map.
 */
export async function proposeLinks(user: User, day: string, mapId?: string) {
  const { nodes, edges } = await mapContents(user.id, mapId);
  const { data, source } = await suggestLinks(
    user.id,
    day,
    nodes.map((n) => ({ title: n.title, domain: n.domain })),
  );

  const byTitle = new Map(nodes.map((n) => [n.title.toLowerCase(), n]));
  const existing = new Set(edges.map((e) => `${e.fromId}:${e.toId}`));
  let added = 0;

  for (const link of data.links) {
    const from = byTitle.get(link.from.toLowerCase());
    const to = byTitle.get(link.to.toLowerCase());
    // Silently drop hallucinated titles rather than creating phantom nodes.
    if (!from || !to || from.id === to.id) continue;
    if (existing.has(`${from.id}:${to.id}`)) continue;
    await linkNodes(user, from.id, to.id, link.relationship, true);
    added += 1;
  }

  return { added, aiUsed: source !== "fallback" };
}

/**
 * Nodes with no confirmed link. These are the highest-value thing to work on:
 * an unconnected node is a fact, a connected one is knowledge.
 */
export function orphanNodes(nodes: MindMapNode[], edges: MindMapEdge[]): MindMapNode[] {
  const linked = new Set<string>();
  for (const edge of edges) {
    if (edge.suggested) continue;
    linked.add(edge.fromId);
    linked.add(edge.toId);
  }
  return nodes.filter((n) => !linked.has(n.id));
}
