import { redirect } from "next/navigation";

import { Card, CardTitle, EmptyState } from "@/components/ui";
import { getLocalUser } from "@/db";
import {
  completionRate,
  consistencyScore,
  longestThreeWinStreak,
  planningAccuracy,
  threeWinStreak,
  windowComparison,
} from "@/lib/behavior";
import { MIN_DAYS_FOR_INSIGHT } from "@/lib/constants";
import { todayISO } from "@/lib/time";
import { behaviourSummary } from "@/services/history";
import { learningStreak } from "@/services/learning";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function ProgressPage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const today = todayISO();
  const [behaviour, learn] = await Promise.all([
    behaviourSummary(user.id, today),
    learningStreak(user.id, today),
  ]);

  const { rollups, insights } = behaviour;
  const last14 = rollups.slice(-14);
  const windows = windowComparison(rollups);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Measured, not estimated. Anything Orbit can&apos;t support with data says so.
        </p>
      </header>

      {rollups.length === 0 ? (
        <Card>
          <EmptyState title="No completed days yet.">
            Finish a day and the numbers start here. Insights unlock after{" "}
            {MIN_DAYS_FOR_INSIGHT} days.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Completion rate" value={pct(completionRate(rollups))} />
            <Metric
              label="Planning accuracy"
              value={pct(planningAccuracy(rollups))}
              hint="Estimated ÷ actual"
            />
            <Metric label="Three-win streak" value={`${threeWinStreak(rollups)} days`} />
            <Metric label="Learning streak" value={`${learn} days`} />
            <Metric label="Consistency" value={pct(consistencyScore(rollups))} hint="Days with any win" />
            <Metric label="Best three-win run" value={`${longestThreeWinStreak(rollups)} days`} />
            <Metric
              label="Morning completion"
              value={windows ? pct(windows.morningRate) : "—"}
            />
            <Metric
              label="Evening completion"
              value={windows ? pct(windows.eveningRate) : "—"}
            />
          </div>

          <Card>
            <CardTitle hint="last 14 days">Daily completion</CardTitle>
            <ul className="flex items-end gap-1" aria-label="Daily completion for the last 14 days">
              {last14.map((r) => {
                const rate = r.plannedCount === 0 ? 0 : r.completedCount / r.plannedCount;
                const height = Math.max(4, Math.round(rate * 100));
                return (
                  <li key={r.date} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-accent"
                      style={{ height: `${height}px` }}
                      title={`${r.date}: ${r.completedCount}/${r.plannedCount}`}
                    />
                    <span className="text-[10px] text-ink-faint">{r.date.slice(8)}</span>
                    <span className="sr-only">
                      {r.date}: {r.completedCount} of {r.plannedCount} completed
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardTitle>What this means</CardTitle>
            <ul className="flex flex-col gap-2">
              {insights.map((insight) => (
                <li key={insight.id} className="text-sm text-ink-soft">
                  {insight.text}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{label}</p>
      {hint ? <p className="text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
