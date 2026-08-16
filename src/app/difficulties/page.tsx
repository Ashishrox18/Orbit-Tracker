import { redirect } from "next/navigation";

import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { getLocalUser } from "@/db";
import { DifficultyList } from "@/features/difficulties/difficulty-list";
import { QuickCapture } from "@/features/today/today-client";
import { stageFor } from "@/lib/difficulty";
import { todayISO } from "@/lib/time";
import { difficultyDashboard } from "@/services/difficulties";

export const dynamic = "force-dynamic";

export default async function DifficultiesPage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const { ranked, all, stats } = await difficultyDashboard(user.id, todayISO());
  const resolved = all.filter((d) => d.status === "resolved");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My difficulties</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Unresolved topics become tomorrow&apos;s mental win. Each failed attempt changes the
          kind of practice, not just the date.
        </p>
      </header>

      <Card>
        <CardTitle>Capture a difficulty</CardTitle>
        <QuickCapture />
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open" value={stats.open} />
        <Stat label="In progress" value={stats.inProgress} />
        <Stat label="Resolved" value={stats.resolved} />
        <Stat
          label="Avg. days to resolve"
          value={stats.averageResolutionDays ?? "—"}
        />
      </div>

      {stats.mostRepeatedTopic ? (
        <Card>
          <CardTitle>Most repeated</CardTitle>
          <p className="text-sm text-ink-soft">
            <span className="font-medium text-ink">{stats.mostRepeatedTopic}</span> has come up
            more than once. A topic that keeps returning is usually a missing prerequisite rather
            than a hard topic.
          </p>
        </Card>
      ) : null}

      <Card>
        <CardTitle hint={ranked.length > 0 ? "highest priority first" : undefined}>
          Active
        </CardTitle>
        {ranked.length === 0 ? (
          <EmptyState title="Nothing is currently marked difficult.">
            Capture something above and it will shape your next plan.
          </EmptyState>
        ) : (
          <DifficultyList
            items={ranked.map((d) => ({
              id: d.id,
              topic: d.topic,
              subject: d.subject,
              difficulty: d.difficulty,
              status: d.status,
              attempts: d.attempts,
              likelyGap: d.likelyGap,
              recommendedAction: d.recommendedAction,
              stageLabel: stageFor(d.interventionStage).label,
              timeSpentMinutes: d.timeSpentMinutes,
              tags: d.tags,
            }))}
          />
        )}
      </Card>

      {resolved.length > 0 ? (
        <Card>
          <CardTitle hint={`${resolved.length}`}>Resolved</CardTitle>
          <ul className="flex flex-col gap-2">
            {resolved.slice(0, 12).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink-soft">{d.topic}</span>
                <Badge tone="physical">resolved</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{label}</p>
    </div>
  );
}
