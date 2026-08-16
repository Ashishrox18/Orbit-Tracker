import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getLocalUser } from "@/db";
import { MapCanvas } from "@/features/map/canvas";
import { todayISO } from "@/lib/time";
import { listMaps, mapContents, orphanNodes } from "@/services/mindmap";

export const dynamic = "force-dynamic";

const LAST_MAP_COOKIE = "orbit_last_map";

/**
 * The map gets the whole screen. It is the one view that grows without bound,
 * so it breaks out of the page container the other routes share — a knowledge
 * web read through a 900px column is unusable past a few dozen nodes.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const { id } = await searchParams;
  // No id in the URL means "whatever map I was last looking at", not always
  // Universal — the cookie is set client-side whenever the active map changes.
  const lastMapId = id ? undefined : (await cookies()).get(LAST_MAP_COOKIE)?.value;
  const [maps, contents] = await Promise.all([
    listMaps(user.id),
    mapContents(user.id, id ?? lastMapId),
  ]);

  const orphans = orphanNodes(contents.nodes, contents.edges);
  const confirmed = contents.edges.filter((e) => !e.suggested).length;

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] flex-col lg:h-dvh">
      <h1 className="sr-only">Mind map</h1>
      <MapCanvas
        maps={maps.map((m) => ({ id: m.id, name: m.name, kind: m.kind }))}
        activeMap={{ id: contents.map.id, name: contents.map.name, kind: contents.map.kind }}
        nodes={contents.nodes.map((n) => ({
          id: n.id,
          title: n.title,
          domain: n.domain,
          summary: n.summary,
          notes: n.notes,
          resourceUrl: n.resourceUrl,
          x: n.x,
          y: n.y,
        }))}
        edges={contents.edges.map((e) => ({
          id: e.id,
          fromId: e.fromId,
          toId: e.toId,
          relationship: e.relationship,
          suggested: e.suggested,
        }))}
        date={todayISO()}
        stats={{ nodes: contents.nodes.length, links: confirmed, orphans: orphans.length }}
      />
    </div>
  );
}
