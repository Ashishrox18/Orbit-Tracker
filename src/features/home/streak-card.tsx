import { Badge, Card } from "@/components/ui";
import type { DailyRollup } from "@/lib/behavior";

/**
 * The one thing worth seeing before anything else: the run you've built, and
 * whether today is still open to extend it. Colour carries the momentum —
 * everything else on the page is calmer than this card on purpose.
 */
export function StreakCard({
  streak,
  longest,
  atRisk,
  todayDone,
  rollups,
}: {
  streak: number;
  longest: number;
  atRisk: boolean;
  todayDone: boolean;
  rollups: DailyRollup[];
}) {
  return (
    <Card className="bg-[linear-gradient(135deg,var(--color-streak-soft)_0%,var(--color-surface)_65%)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-streak uppercase">
            {streak > 0 ? "Current streak" : "Start a streak"}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums text-streak">{streak}</span>
            <span className="text-sm text-ink-soft">
              {streak === 1 ? "day" : "days"} of all three wins
            </span>
          </p>
          {atRisk ? (
            <p className="mt-2 text-sm font-medium text-streak">
              Keep it alive — finish today&apos;s three wins.
            </p>
          ) : todayDone && streak > 0 ? (
            <p className="mt-2 text-sm text-ink-soft">All three wins landed today.</p>
          ) : null}
        </div>
        {longest > 0 ? (
          <Badge tone="streak">
            {streak >= longest ? "Personal best" : `Best run ${longest} days`}
          </Badge>
        ) : null}
      </div>

      <ul
        className="mt-4 flex flex-wrap gap-1"
        aria-label={`Three-win history for the last ${rollups.length} days`}
      >
        {rollups.map((r) => (
          <li
            key={r.date}
            title={r.date}
            className={`h-2.5 w-2.5 rounded-sm ${
              r.threeWins
                ? "bg-streak"
                : r.completedCount > 0
                  ? "border border-streak/40 bg-streak-soft"
                  : "border border-line bg-canvas"
            }`}
          >
            <span className="sr-only">
              {r.date}:{" "}
              {r.threeWins
                ? "all three wins"
                : r.completedCount > 0
                  ? `${r.completedCount} completed`
                  : "no activity"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-faint">Last {rollups.length} days</p>
    </Card>
  );
}
