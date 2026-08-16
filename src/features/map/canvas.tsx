"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { del, patch, post } from "@/lib/client-api";
import { MIND_DOMAINS } from "@/lib/contracts";
import { snapToGrid } from "@/lib/mindmap-grid";

/**
 * The mind map canvas.
 *
 * Cards are absolutely positioned in world coordinates and wires are drawn in
 * one SVG layer beneath them, so the two never fight over stacking. Positions
 * are persisted on drop — a map you arranged once should look the same
 * tomorrow, because the spatial layout is most of what makes it memorable.
 */

export interface MapSummary {
  id: string;
  name: string;
  kind: string;
}

export interface CanvasNode {
  id: string;
  title: string;
  domain: string;
  summary: string | null;
  notes: string | null;
  resourceUrl: string | null;
  x: number;
  y: number;
}

export interface CanvasEdge {
  id: string;
  fromId: string;
  toId: string;
  relationship: string;
  suggested: boolean;
}

const CARD_W = 176;
const CARD_H = 76;

const DOMAIN_COLOUR: Record<string, string> = {
  cosmology: "#6d28d9",
  history: "#b45309",
  science: "#1d4ed8",
  mathematics: "#0f766e",
  technology: "#0369a1",
  politics: "#9f1239",
  economics: "#166534",
  philosophy: "#7c2d12",
  psychology: "#a21caf",
  emotion: "#be123c",
  art: "#c2410c",
  abstract: "#475569",
};

const colourFor = (domain: string) => DOMAIN_COLOUR[domain] ?? DOMAIN_COLOUR.abstract!;

/** Bezier between two card centres, bowed horizontally so wires don't overlap. */
function wirePath(a: CanvasNode, b: CanvasNode): string {
  const x1 = a.x + CARD_W / 2;
  const y1 = a.y + CARD_H / 2;
  const x2 = b.x + CARD_W / 2;
  const y2 = b.y + CARD_H / 2;
  const bow = Math.max(40, Math.abs(x2 - x1) * 0.4);
  return `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 - bow} ${y2}, ${x2} ${y2}`;
}

export function MapCanvas({
  maps,
  activeMap,
  nodes: initialNodes,
  edges: initialEdges,
  date,
  stats,
}: {
  maps: MapSummary[];
  activeMap: MapSummary;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  date: string;
  stats: { nodes: number; links: number; orphans: number };
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const edges = initialEdges;

  // Edits refresh server data in place rather than reloading the page, so the
  // local copy has to be re-synced whenever fresh props arrive. Done during
  // render (not an effect) per React's "adjusting state on prop change" rule.
  const [syncedNodes, setSyncedNodes] = useState(initialNodes);
  if (initialNodes !== syncedNodes) {
    setSyncedNodes(initialNodes);
    setNodes(initialNodes);
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const router = useRouter();

  // A map switch (or a brand-new map) changes the URL via router.push, but
  // this component keeps rendering the OLD activeMap prop until the new
  // page's server data streams in. If "Add a concept" stayed live during
  // that window it would silently post to the map you're leaving, not the
  // one you just asked for — so every add-to-this-map control is disabled
  // until activeMap.id actually catches up to what was requested.
  const [pendingMapId, setPendingMapId] = useState<string | null>(null);
  if (pendingMapId !== null && pendingMapId === activeMap.id) {
    setPendingMapId(null);
  }
  const switchMap = (mapId: string) => {
    setPendingMapId(mapId);
    router.push(`/map?id=${mapId}`);
  };

  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panning = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Remember which map this tab is on, so returning to /map with no ?id
  // reopens it instead of always falling back to Universal.
  useEffect(() => {
    document.cookie = `orbit_last_map=${activeMap.id}; path=/; max-age=31536000; samesite=lax`;
  }, [activeMap.id]);

  const centeredMap = useRef<string | null>(null);

  // Centre the view once per map — on first load and whenever the active map
  // changes, but not on every in-map edit (that would fight the user's pan).
  useEffect(() => {
    if (centeredMap.current === activeMap.id) return;
    centeredMap.current = activeMap.id;
    if (initialNodes.length === 0) return;
    const meanX = initialNodes.reduce((n, node) => n + node.x, 0) / initialNodes.length;
    const meanY = initialNodes.reduce((n, node) => n + node.y, 0) / initialNodes.length;
    const box = viewport.current?.getBoundingClientRect();
    setPan({
      x: (box ? box.width / 2 : 400) - meanX - CARD_W / 2,
      y: (box ? box.height / 2 : 300) - meanY - CARD_H / 2,
    });
  }, [activeMap.id, initialNodes]);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (drag.current) {
        const box = viewport.current?.getBoundingClientRect();
        if (!box) return;
        const worldX = (event.clientX - box.left - pan.x) / zoom - drag.current.offsetX;
        const worldY = (event.clientY - box.top - pan.y) / zoom - drag.current.offsetY;
        const id = drag.current.id;
        setNodes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, x: worldX, y: worldY } : n)),
        );
      } else if (panning.current) {
        setPan({
          x: panning.current.panX + (event.clientX - panning.current.startX),
          y: panning.current.panY + (event.clientY - panning.current.startY),
        });
      }
    },
    [pan.x, pan.y, zoom],
  );

  const onPointerUp = useCallback(() => {
    const dragged = drag.current;
    drag.current = null;
    panning.current = null;
    setGrabbing(false);
    if (!dragged) return;

    // Drop always snaps to the grid — dragging is free-form while held, but
    // the resting position is never allowed to be the one thing misaligned.
    setNodes((prev) => {
      const node = prev.find((n) => n.id === dragged.id);
      if (!node) return prev;
      const snapped = snapToGrid(node.x, node.y);
      void post("/api/map/move", { id: node.id, x: snapped.x, y: snapped.y });
      return prev.map((n) => (n.id === node.id ? { ...n, x: snapped.x, y: snapped.y } : n));
    });
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // Wheel-zoom, centred on the cursor rather than the viewport middle — the
  // thing you're pointing at should stay under the pointer as it scales.
  // Registered manually (not via onWheel) because React attaches wheel
  // listeners as passive, which silently ignores preventDefault().
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = el.getBoundingClientRect();
      const cursorX = event.clientX - box.left;
      const cursorY = event.clientY - box.top;
      const worldX = (cursorX - pan.x) / zoom;
      const worldY = (cursorY - pan.y) / zoom;
      const delta = event.deltaY > 0 ? -0.12 : 0.12;
      const nextZoom = Math.min(2, Math.max(0.2, Number((zoom + delta).toFixed(2))));
      setZoom(nextZoom);
      setPan({ x: cursorX - worldX * nextZoom, y: cursorY - worldY * nextZoom });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoom, pan]);

  const fitToScreen = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box || nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + CARD_W));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + CARD_H));
    const padding = 80;
    const nextZoom = Math.min(
      2,
      Math.max(0.2, Math.min((box.width - padding) / (maxX - minX), (box.height - padding) / (maxY - minY))),
    );
    setZoom(nextZoom);
    setPan({
      x: box.width / 2 - ((minX + maxX) / 2) * nextZoom,
      y: box.height / 2 - ((minY + maxY) / 2) * nextZoom,
    });
  }, [nodes]);

  const startDrag = (event: React.PointerEvent, node: CanvasNode) => {
    event.stopPropagation();
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = {
      id: node.id,
      offsetX: (event.clientX - box.left - pan.x) / zoom - node.x,
      offsetY: (event.clientY - box.top - pan.y) / zoom - node.y,
    };
  };

  const startPan = (event: React.PointerEvent) => {
    panning.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    setGrabbing(true);
    setSelected(null);
  };

  const clickNode = (node: CanvasNode) => {
    if (linkFrom && linkFrom !== node.id) {
      setBusy("linking");
      void post("/api/map/links", {
        action: "create",
        fromId: linkFrom,
        toId: node.id,
        relationship: "relates to",
      }).then(() => {
        setLinkFrom(null);
        setBusy(null);
        router.refresh();
      });
      return;
    }
    setSelected(node.id);
    setPanelOpen(true);
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const active = selected ? byId.get(selected) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <MapBar
          maps={maps}
          activeMap={activeMap}
          switching={pendingMapId !== null}
          onSwitchMap={switchMap}
          date={date}
          linking={linkFrom !== null}
          onCancelLink={() => setLinkFrom(null)}
          zoom={zoom}
          onZoom={setZoom}
          onFit={fitToScreen}
          stats={stats}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((v) => !v)}
        />

        <div
          ref={viewport}
          onPointerDown={startPan}
          className="relative min-h-0 flex-1 overflow-hidden border-t border-line bg-surface"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-line) 1px, transparent 1px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            cursor: grabbing ? "grabbing" : "grab",
          }}
        >
          {nodes.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-faint">
              Nothing on this map yet. Add a concept to start the web.
            </p>
          ) : null}

          <div
            className="absolute origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {/* Wires sit under the cards in their own layer. */}
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
              aria-hidden="true"
            >
              {edges.map((edge) => {
                const from = byId.get(edge.fromId);
                const to = byId.get(edge.toId);
                if (!from || !to) return null;
                return (
                  <g key={edge.id}>
                    <path
                      d={wirePath(from, to)}
                      fill="none"
                      stroke={edge.suggested ? "var(--color-ink-faint)" : "var(--color-map)"}
                      strokeWidth={edge.suggested ? 1.5 : 2}
                      strokeDasharray={edge.suggested ? "6 5" : undefined}
                      opacity={selected && selected !== from.id && selected !== to.id ? 0.25 : 0.85}
                    />
                    <text
                      x={(from.x + to.x) / 2 + CARD_W / 2}
                      y={(from.y + to.y) / 2 + CARD_H / 2 - 6}
                      textAnchor="middle"
                      className="fill-ink-faint"
                      style={{ fontSize: 10 }}
                    >
                      {edge.relationship}
                    </text>
                  </g>
                );
              })}
            </svg>

            {nodes.map((node) => {
              const isSelected = selected === node.id;
              const isLinkSource = linkFrom === node.id;
              return (
                <button
                  key={node.id}
                  onPointerDown={(e) => startDrag(e, node)}
                  onClick={(e) => {
                    e.stopPropagation();
                    clickNode(node);
                  }}
                  aria-label={`${node.title}, ${node.domain}`}
                  className={`absolute cursor-grab rounded-xl border-2 bg-surface p-3 text-left shadow-sm transition-shadow active:cursor-grabbing ${
                    isSelected ? "shadow-lg" : "hover:shadow-md"
                  }`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: CARD_W,
                    minHeight: CARD_H,
                    borderColor: isLinkSource
                      ? "var(--color-accent)"
                      : isSelected
                        ? colourFor(node.domain)
                        : "var(--color-line)",
                  }}
                >
                  <span
                    className="block h-1 w-8 rounded-full"
                    style={{ background: colourFor(node.domain) }}
                  />
                  <span className="mt-2 block text-sm leading-snug font-semibold">
                    {node.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
                    {node.domain}
                    {node.resourceUrl ? (
                      <span aria-hidden="true" title="Has a reference link">
                        ↗
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {panelOpen ? (
        <SidePanel
          key={active?.id ?? "none"}
          node={active ?? null}
          edges={edges}
          nodes={nodes}
          busy={busy}
          onStartLink={() => setLinkFrom(active?.id ?? null)}
          onClose={() => {
            setSelected(null);
            setPanelOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- toolbar */

function MapBar({
  maps,
  activeMap,
  switching,
  onSwitchMap,
  date,
  linking,
  onCancelLink,
  zoom,
  onZoom,
  onFit,
  stats,
  panelOpen,
  onTogglePanel,
}: {
  maps: MapSummary[];
  activeMap: MapSummary;
  switching: boolean;
  onSwitchMap: (mapId: string) => void;
  date: string;
  linking: boolean;
  onCancelLink: () => void;
  zoom: number;
  onZoom: (z: number) => void;
  onFit: () => void;
  stats: { nodes: number; links: number; orphans: number };
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("abstract");
  const [newMap, setNewMap] = useState("");
  const [adding, setAdding] = useState(false);
  const [creatingMap, setCreatingMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // True from the instant "Add map" is clicked (not just once the switch is
  // confirmed) — closes the gap where the new map's id doesn't exist yet but
  // the old one is still live, which would otherwise let a fast "Add" land on
  // the map you're about to leave.
  const mapScopedLocked = switching || creatingMap;

  const addNode = async () => {
    if (!title.trim() || mapScopedLocked) return;
    setAdding(true);
    setError(null);
    const res = await post("/api/map/nodes", {
      mapId: activeMap.id,
      title: title.trim(),
      domain,
      autoSummary: true,
    });
    setAdding(false);
    if (!res.ok) setError(res.error);
    else {
      setTitle("");
      router.refresh();
    }
  };

  const addMap = async () => {
    if (!newMap.trim() || creatingMap) return;
    setCreatingMap(true);
    setError(null);
    const res = await post<{ map: { id: string } }>("/api/map/maps", { name: newMap.trim() });
    if (res.ok) {
      setNewMap("");
      setCreatingMap(false);
      onSwitchMap(res.data.map.id);
    } else {
      setError(res.error);
      setCreatingMap(false);
    }
  };

  const propose = async () => {
    if (mapScopedLocked) return;
    setAdding(true);
    const res = await post("/api/map/links", { action: "propose", date, mapId: activeMap.id });
    setAdding(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  };

  return (
    <div className="flex flex-none flex-col gap-2 bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Active map"
          value={activeMap.id}
          onChange={(e) => onSwitchMap(e.target.value)}
          disabled={mapScopedLocked}
          className="w-48"
        >
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.kind === "universal" ? " (never resets)" : ""}
            </option>
          ))}
        </Select>

        <Input
          aria-label="New map name"
          placeholder="New map…"
          value={newMap}
          onChange={(e) => setNewMap(e.target.value)}
          disabled={creatingMap}
          className="w-36"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={addMap}
          disabled={!newMap.trim() || mapScopedLocked}
        >
          {creatingMap ? "Creating…" : "Add map"}
        </Button>

        <span className="hidden text-xs text-ink-faint lg:inline">
          {stats.nodes} cards · {stats.links} links
          {stats.orphans > 0 ? ` · ${stats.orphans} unconnected` : ""}
        </span>

        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onZoom(Math.max(0.4, zoom - 0.15))}>
            −
          </Button>
          <span className="w-12 text-center text-xs text-ink-faint">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="sm" variant="ghost" onClick={() => onZoom(Math.min(2, zoom + 0.15))}>
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onZoom(1)}>
            Reset
          </Button>
          <Button size="sm" variant="ghost" onClick={onFit}>
            Fit
          </Button>
          <Button size="sm" variant="secondary" onClick={onTogglePanel} aria-pressed={panelOpen}>
            {panelOpen ? "Hide panel" : "Show panel"}
          </Button>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Field label="Add a concept" htmlFor="node-title">
            <Input
              id="node-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNode()}
              placeholder="Entropy"
              disabled={mapScopedLocked}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Domain" htmlFor="node-domain">
            <Select
              id="node-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={mapScopedLocked}
            >
              {MIND_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button onClick={addNode} disabled={adding || mapScopedLocked || !title.trim()}>
          {adding ? "Working…" : "Add"}
        </Button>
        <Button variant="secondary" onClick={propose} disabled={adding || mapScopedLocked}>
          Suggest links
        </Button>
      </div>

      <div aria-live="polite">
        {mapScopedLocked ? <p className="text-xs text-ink-faint">Switching map…</p> : null}
        {linking ? (
          <p className="text-xs text-accent">
            Click another card to link it.{" "}
            <button onClick={onCancelLink} className="underline">
              Cancel
            </button>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- side panel */

function SidePanel({
  node,
  edges,
  nodes,
  busy,
  onStartLink,
  onClose,
}: {
  node: CanvasNode | null;
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  busy: string | null;
  onStartLink: () => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [resourceUrl, setResourceUrl] = useState(node?.resourceUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const router = useRouter();

  if (!node) {
    return (
      <aside className="w-full shrink-0 rounded-xl border border-line bg-surface p-4 lg:w-80">
        <p className="text-sm font-medium">Nothing selected</p>
        <p className="mt-2 text-sm text-ink-soft">
          Click a card to read and edit what you wrote. Drag it to move it — it snaps to the grid
          on drop, so the map stays aligned.
        </p>
      </aside>
    );
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = edges.filter((e) => e.fromId === node.id || e.toId === node.id);

  const save = async () => {
    setSaving(true);
    setUrlError(null);
    const res = await patch("/api/map/nodes", { id: node.id, notes, resourceUrl: resourceUrl.trim() });
    setSaving(false);
    setSaved(res.ok);
    if (res.ok) router.refresh();
    else setUrlError(res.error);
  };

  const remove = async () => {
    const res = await del("/api/map/nodes", { id: node.id });
    if (res.ok) {
      onClose();
      router.refresh();
    }
  };

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 lg:w-80">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{node.title}</h2>
          <Badge>{node.domain}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close panel">
          Close
        </Button>
      </div>

      {node.summary ? (
        <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink-soft">
          {node.summary}
        </p>
      ) : null}

      <div>
        <Field label="Your notes" htmlFor="node-notes" hint="This is the part that's yours.">
          <Textarea
            id="node-notes"
            rows={8}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
        <div className="mt-3">
          <Field
            label="Reference link"
            htmlFor="node-resource-url"
            hint="An article, video, or doc for this topic."
          >
            <Input
              id="node-resource-url"
              type="url"
              placeholder="https://…"
              value={resourceUrl}
              onChange={(e) => {
                setResourceUrl(e.target.value);
                setSaved(false);
              }}
            />
          </Field>
          {node.resourceUrl ? (
            <a
              href={node.resourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-block text-xs text-accent underline"
            >
              Open link ↗
            </a>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <span aria-live="polite" className="text-xs text-physical">
            {saved ? "Saved" : ""}
          </span>
          {urlError ? (
            <span role="alert" className="text-xs text-danger">
              {urlError}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
          Links ({links.length})
        </h3>
        {links.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">
            Not connected to anything yet. An unconnected node is a fact; a connected one is
            knowledge.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {links.map((edge) => {
              const other = byId.get(edge.fromId === node.id ? edge.toId : edge.fromId);
              return (
                <li key={edge.id} className="flex items-center gap-2 text-sm">
                  <span className="text-ink-faint">{edge.relationship}</span>
                  <span className="truncate font-medium">{other?.title ?? "—"}</span>
                  {edge.suggested ? <Badge tone="accent">suggested</Badge> : null}
                  <button
                    onClick={async () => {
                      await del("/api/map/links", { id: edge.id });
                      router.refresh();
                    }}
                    aria-label="Remove link"
                    className="ml-auto text-xs text-danger underline"
                  >
                    remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button size="sm" variant="secondary" onClick={onStartLink} className="mt-3" disabled={busy !== null}>
          Link to another card
        </Button>
      </div>

      <Button size="sm" variant="danger" onClick={remove} className="mt-auto">
        Delete this card
      </Button>
    </aside>
  );
}
