import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardTitle } from "@/components/ui";
import { getLocalUser } from "@/db";
import { monthGrid, monthName, shiftMonth, WEEKDAY_LABELS } from "@/lib/calendar";
import { todayISO } from "@/lib/time";
import { evidenceDates } from "@/services/evidence";
import { recentRollups } from "@/services/history";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const today = todayISO();
  const params = await searchParams;
  const year = Number(params.y) || Number(today.slice(0, 4));
  const month = Number(params.m) || Number(today.slice(5, 7));

  const [rollups, evDates] = await Promise.all([
    recentRollups(user.id, today, 800),
    evidenceDates(user.id),
  ]);

  const byDate = new Map(rollups.map((r) => [r.date, r]));
  const withEvidence = new Set(evDates);
  const grid = monthGrid(year, month);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const monthRows = rollups.filter((r) => r.date.startsWith(`${year}-${String(month).padStart(2, "0")}`));
  const completed = monthRows.reduce((n, r) => n + r.completedCount, 0);
  const planned = monthRows.reduce((n, r) => n + r.plannedCount, 0);
  const perfectDays = monthRows.filter((r) => r.threeWins).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {monthName(month)} {year}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {completed} of {planned} tasks completed · {perfectDays} three-win{" "}
            {perfectDays === 1 ? "day" : "days"}
          </p>
        </div>
        <nav aria-label="Change month" className="flex gap-2">
          <Link
            href={`/calendar?y=${prev.year}&m=${prev.month}`}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm hover:border-accent"
          >
            ← {monthName(prev.month)}
          </Link>
          <Link
            href="/calendar"
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm hover:border-accent"
          >
            Today
          </Link>
          <Link
            href={`/calendar?y=${next.year}&m=${next.month}`}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm hover:border-accent"
          >
            {monthName(next.month)} →
          </Link>
        </nav>
      </header>

      <Card>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-1 text-center text-xs font-medium text-ink-faint">
              {label}
            </div>
          ))}

          {grid.flat().map((cell) => {
            const row = byDate.get(cell.date);
            const rate =
              row && row.plannedCount > 0 ? row.completedCount / row.plannedCount : null;
            const isToday = cell.date === today;
            const proof = withEvidence.has(cell.date);

            return (
              <Link
                key={cell.date}
                href={`/calendar/${cell.date}`}
                className={`flex min-h-20 flex-col rounded-lg border p-1.5 transition-colors hover:border-accent ${
                  cell.inMonth ? "border-line bg-surface" : "border-transparent bg-canvas"
                } ${isToday ? "ring-2 ring-accent" : ""}`}
              >
                <span
                  className={`text-xs ${
                    cell.inMonth ? (isToday ? "font-bold text-accent" : "text-ink-soft") : "text-ink-faint/50"
                  }`}
                >
                  {cell.day}
                </span>

                {cell.inMonth && row ? (
                  <div className="mt-auto flex flex-col gap-1">
                    {/* Completion bar carries the ratio; the text carries the numbers,
                        so the information never depends on colour alone. */}
                    <span className="text-[11px] font-medium tabular-nums">
                      {row.completedCount}/{row.plannedCount}
                    </span>
                    {rate !== null ? (
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(rate * 100)}%` }}
                        />
                      </span>
                    ) : null}
                    <span className="flex gap-1">
                      {row.threeWins ? (
                        <span className="rounded bg-physical-soft px-1 text-[9px] font-semibold text-physical">
                          3 wins
                        </span>
                      ) : null}
                      {proof ? (
                        <span className="rounded bg-accent-soft px-1 text-[9px] font-semibold text-accent">
                          proof
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : null}

                <span className="sr-only">
                  {cell.date}
                  {row
                    ? `: ${row.completedCount} of ${row.plannedCount} tasks completed${
                        row.threeWins ? ", all three wins" : ""
                      }${proof ? ", evidence attached" : ""}`
                    : ": no plan"}
                </span>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Reading this</CardTitle>
        <p className="text-sm text-ink-soft">
          The bar is the share of that day&apos;s plan you finished, and the numbers beside it are
          the raw counts — a full bar on a two-task day is not the same as a full bar on ten.
          &ldquo;3 wins&rdquo; means physical, mental and emotional all landed.
          &ldquo;proof&rdquo; means you attached something verifiable. Click any day to see exactly
          what was on it.
        </p>
      </Card>
    </div>
  );
}
