import "server-only";

import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  evidence,
  memorySessions,
  trainingLinks,
  type Evidence,
  type TrainingLink,
  type User,
} from "@/db/schema";

/** Evidence and the external training links, both plain CRUD over Postgres. */

export async function listEvidence(
  userId: string,
  from?: string,
  to?: string,
): Promise<Evidence[]> {
  const filters = [eq(evidence.userId, userId)];
  if (from) filters.push(gte(evidence.date, from));
  if (to) filters.push(lte(evidence.date, to));

  return db
    .select()
    .from(evidence)
    .where(and(...filters))
    .orderBy(desc(evidence.date), desc(evidence.createdAt));
}

export async function evidenceDates(userId: string): Promise<string[]> {
  const rows = await db
    .select({ date: evidence.date })
    .from(evidence)
    .where(eq(evidence.userId, userId));
  return [...new Set(rows.map((r) => r.date))];
}

export async function addEvidence(
  user: User,
  input: {
    date: string;
    kind: string;
    title: string;
    url?: string;
    note?: string;
    metricValue?: number;
    metricUnit?: string;
    category: string;
    taskId?: string;
  },
): Promise<Evidence> {
  const inserted = await db
    .insert(evidence)
    .values({
      userId: user.id,
      date: input.date,
      kind: input.kind,
      title: input.title,
      url: input.url ?? null,
      note: input.note ?? null,
      metricValue: input.metricValue ?? null,
      metricUnit: input.metricUnit ?? null,
      category: input.category,
      taskId: input.taskId ?? null,
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Could not save the evidence.");
  return row;
}

export async function deleteEvidence(user: User, id: string): Promise<boolean> {
  const deleted = await db
    .delete(evidence)
    .where(and(eq(evidence.id, id), eq(evidence.userId, user.id)))
    .returning();
  return deleted.length > 0;
}

/* ------------------------------------------------------------ training links */

/**
 * Suggested starting points, created empty on first visit so there are slots
 * to fill rather than a blank page. URLs are deliberately null — the app does
 * not endorse or hotlink anything, it holds whatever you paste.
 */
const SEEDS: { name: string; trains: string; sortOrder: number }[] = [
  { name: "Sequence memory", trains: "Visuospatial working memory", sortOrder: 0 },
  { name: "Reaction time", trains: "Reaction speed under pressure", sortOrder: 1 },
  { name: "Dual N-back", trains: "Working memory under load", sortOrder: 2 },
  { name: "Change detection", trains: "Situational awareness", sortOrder: 3 },
  { name: "Task switching", trains: "Cognitive flexibility", sortOrder: 4 },
];

export async function listTrainingLinks(userId: string): Promise<TrainingLink[]> {
  const existing = await db
    .select()
    .from(trainingLinks)
    .where(eq(trainingLinks.userId, userId))
    .orderBy(asc(trainingLinks.sortOrder), asc(trainingLinks.name));

  if (existing.length > 0) return existing;

  await db
    .insert(trainingLinks)
    .values(SEEDS.map((s) => ({ userId, ...s })))
    .onConflictDoNothing({ target: [trainingLinks.userId, trainingLinks.name] });

  return db
    .select()
    .from(trainingLinks)
    .where(eq(trainingLinks.userId, userId))
    .orderBy(asc(trainingLinks.sortOrder), asc(trainingLinks.name));
}

export async function upsertTrainingLink(
  user: User,
  input: {
    id?: string;
    name: string;
    url?: string | null;
    trains?: string;
    notes?: string;
    sortOrder: number;
  },
): Promise<TrainingLink> {
  if (input.id) {
    const updated = await db
      .update(trainingLinks)
      .set({
        name: input.name,
        url: input.url ?? null,
        trains: input.trains ?? null,
        notes: input.notes ?? null,
        sortOrder: input.sortOrder,
      })
      .where(and(eq(trainingLinks.id, input.id), eq(trainingLinks.userId, user.id)))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("That training link no longer exists.");
    return row;
  }

  const inserted = await db
    .insert(trainingLinks)
    .values({
      userId: user.id,
      name: input.name,
      url: input.url ?? null,
      trains: input.trains ?? null,
      notes: input.notes ?? null,
      sortOrder: input.sortOrder,
    })
    .onConflictDoUpdate({
      target: [trainingLinks.userId, trainingLinks.name],
      set: { url: input.url ?? null, trains: input.trains ?? null },
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Could not save the training link.");
  return row;
}

export async function deleteTrainingLink(user: User, id: string): Promise<boolean> {
  const deleted = await db
    .delete(trainingLinks)
    .where(and(eq(trainingLinks.id, id), eq(trainingLinks.userId, user.id)))
    .returning();
  return deleted.length > 0;
}

/**
 * Record a session against an external link. Reuses `memory_sessions` with the
 * link id in `drill` — the shape is identical, and a second near-duplicate
 * table would earn nothing.
 */
export async function recordTrainingSession(
  user: User,
  day: string,
  input: { linkId: string; score: number; level: number; durationSeconds: number },
) {
  const inserted = await db
    .insert(memorySessions)
    .values({
      userId: user.id,
      drill: input.linkId,
      level: input.level,
      score: input.score,
      maxScore: 0, // an external game has no ceiling we can know
      durationSeconds: input.durationSeconds,
      playedOn: day,
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Could not record the session.");
  return row;
}

export interface TrainingStat {
  sessions: number;
  best: number;
  last: number | null;
  lastPlayedOn: string | null;
}

export async function trainingHistory(userId: string): Promise<Record<string, TrainingStat>> {
  const rows = await db
    .select()
    .from(memorySessions)
    .where(eq(memorySessions.userId, userId))
    .orderBy(desc(memorySessions.playedOn))
    .limit(300);

  const byLink: Record<string, TrainingStat> = {};
  for (const row of rows) {
    const entry = byLink[row.drill] ?? {
      sessions: 0,
      best: 0,
      last: null,
      lastPlayedOn: null,
    };
    entry.sessions += 1;
    entry.best = Math.max(entry.best, row.score);
    // Rows arrive newest-first, so the first one seen is the latest.
    if (entry.last === null) {
      entry.last = row.score;
      entry.lastPlayedOn = row.playedOn;
    }
    byLink[row.drill] = entry;
  }
  return byLink;
}
