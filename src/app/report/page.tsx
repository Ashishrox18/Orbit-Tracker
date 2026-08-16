import { redirect } from "next/navigation";

import { Badge, Button, Input, Stat } from "@/components/ui";
import { getLocalUser } from "@/db";
import { resolveRange, type RangePreset } from "@/lib/reportRanges";
import { formatLongDate, todayISO } from "@/lib/time";
import { buildGrowthReport } from "@/services/reportData";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthLabel = (iso: string) =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;

const PRESET_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "6months", label: "6 Months" },
  { value: "year", label: "Year" },
];

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const params = await searchParams;
  const range = resolveRange(params, todayISO());
  const report = await buildGrowthReport(user, range);

  const { summary, streaks: streakSet, painPoints: problems } = report;

  // Full breakdown lives in the exports; on-screen just surfaces the leader.
  const topTaskTag = [...report.tasksByTag].sort((a, b) => b.planned - a.planned)[0] ?? null;
  const topDifficultyTag = [...report.difficulties.byTag].sort((a, b) => b.count - a.count)[0] ?? null;

  // Evidence reads better grouped by month than as one long list.
  const byMonth = new Map<string, typeof report.evidence.items>();
  for (const item of report.evidence.items) {
    const key = item.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), item]);
  }

  const activeDates = new Set(
    report.buckets.filter((b) => b.tasksCompleted > 0).flatMap((b) => [b.start, b.end]),
  );

  const downloadQuery = `from=${range.from}&to=${range.to}`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 report flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Growth report</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {user.name} · {range.label} · {formatLongDate(range.from)} to {formatLongDate(range.to)}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <a
            href={`/api/report?${downloadQuery}`}
            className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium hover:border-accent"
          >
            JSON
          </a>
          <a
            href={`/api/reports/excel?${downloadQuery}`}
            className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium hover:border-accent"
          >
            Excel
          </a>
          <a
            href={`/api/reports/pdf?${downloadQuery}`}
            className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium hover:border-accent"
          >
            PDF
          </a>
        </div>
      </header>

      <div className="no-print flex flex-wrap items-center gap-2">
        {PRESET_OPTIONS.map((opt) => {
          const active = params.preset === opt.value;
          return (
            <a
              key={opt.value}
              href={`/report?preset=${opt.value}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent-soft text-accent"
                  : "border border-line-strong bg-surface text-ink hover:border-accent"
              }`}
            >
              {opt.label}
            </a>
          );
        })}
        <form method="get" className="flex items-center gap-2">
          <div className="w-36">
            <Input type="date" name="from" defaultValue={range.from} aria-label="Custom range start" />
          </div>
          <span className="text-xs text-ink-faint">to</span>
          <div className="w-36">
            <Input type="date" name="to" defaultValue={range.to} aria-label="Custom range end" />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Custom range
          </Button>
        </form>
      </div>

      <section aria-labelledby="figures">
        <h2 id="figures" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Figures
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Days tracked" value={String(summary.daysTracked)} />
          <Stat label="Days with work done" value={String(summary.activeDays)} />
          <Stat
            label="Completion rate"
            value={summary.completionRate === null ? "—" : `${Math.round(summary.completionRate * 100)}%`}
            hint={`${summary.completedTasks} of ${summary.plannedTasks} tasks`}
          />
          <Stat
            label="Verifiable evidence"
            value={String(summary.verifiableCount)}
            hint={`of ${summary.evidenceCount} entries`}
          />
        </div>
      </section>

      <section aria-labelledby="streaks">
        <h2 id="streaks" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Streaks
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Activity"
            value={`${streakSet.activity.current} days`}
            hint={`longest ${streakSet.activity.longest} · any completed task`}
          />
          <Stat
            label="Three wins"
            value={`${streakSet.threeWins.current} days`}
            hint={`longest ${streakSet.threeWins.longest} · all three pillars`}
          />
          <Stat
            label="Evidence"
            value={`${streakSet.evidence.current} days`}
            hint={`longest ${streakSet.evidence.longest} · a verifiable link`}
          />
        </div>
      </section>

      <section aria-labelledby="growth">
        <h2 id="growth" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Growth
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Vocabulary learned"
            value={String(report.vocabulary.addedInRange)}
            hint={`${report.vocabulary.totalAllTime} all-time`}
          />
          <Stat
            label="Mind map growth"
            value={`${report.mindMap.nodesAdded} nodes`}
            hint={`${report.mindMap.edgesAdded} links · ${report.mindMap.orphanCount} unconnected`}
          />
          <Stat
            label="Difficulties resolved"
            value={String(report.difficulties.resolved)}
            hint={`${report.difficulties.open} open · ${report.difficulties.inProgress} in progress`}
          />
          <Stat
            label="Review retention"
            value={report.srs.retention === null ? "—" : `${Math.round(report.srs.retention * 100)}%`}
            hint={`${report.srs.queue.mature} mature · ${report.srs.queue.due} due now`}
          />
          {topTaskTag ? (
            <Stat
              label="Top task tag"
              value={topTaskTag.tag}
              hint={`${topTaskTag.planned} planned · ${topTaskTag.completed} completed`}
            />
          ) : null}
          {topDifficultyTag ? (
            <Stat
              label="Top difficulty tag"
              value={topDifficultyTag.tag}
              hint={`${topDifficultyTag.count} captured · ${topDifficultyTag.resolved} resolved`}
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Full tag and category breakdowns are in the Excel and PDF exports.
        </p>
      </section>

      <section aria-labelledby="calendar">
        <h2 id="calendar" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Day by day
        </h2>
        <ul className="flex flex-wrap gap-1" aria-label="Consistency calendar">
          {report.buckets.map((b) => {
            const worked = b.tasksCompleted > 0;
            const proof = b.evidenceCount > 0;
            return (
              <li
                key={b.start}
                title={`${b.label}: ${b.tasksCompleted}/${b.tasksPlanned} done${proof ? ", evidence attached" : ""}`}
                className={`h-4 w-4 rounded-sm border ${
                  proof
                    ? "border-accent bg-accent"
                    : worked
                      ? "border-accent/40 bg-accent-soft"
                      : "border-line bg-canvas"
                }`}
              >
                <span className="sr-only">
                  {b.label}: {b.tasksCompleted} of {b.tasksPlanned} completed
                  {proof ? ", evidence attached" : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-ink-faint">
          Solid = evidence attached · pale = work done, nothing recorded · empty = no activity.
          {activeDates.size === 0 ? "" : " Each cell is one period of this range."}
        </p>
      </section>

      <section aria-labelledby="pain">
        <h2 id="pain" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Where it leaks
        </h2>
        <ul className="flex flex-col gap-3">
          {problems.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-sm font-medium">{p.finding}</p>
              {p.action ? <p className="mt-1 text-sm text-ink-soft">{p.action}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="detail">
        <h2 id="detail" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Daily detail
        </h2>
        {report.dailyDetail.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No task or vocabulary activity recorded in this range.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {report.dailyDetail.map((day) => (
              <div key={day.date} className="rounded-lg border border-line bg-surface p-4">
                <h3 className="mb-2 text-sm font-semibold">{formatLongDate(day.date)}</h3>
                {day.tasks.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {day.tasks.map((t, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            t.status === "completed" ? "" : "text-ink-faint"
                          }`}
                        >
                          {t.title}
                        </span>
                        <span className="shrink-0 text-xs text-ink-faint">{t.category}</span>
                        <Badge tone={t.status === "completed" ? "physical" : "neutral"}>{t.status}</Badge>
                        {t.proofUrl ? (
                          <a
                            href={t.proofUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 text-xs font-medium text-accent underline"
                          >
                            proof ↗
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {day.vocab.length > 0 ? (
                  <p className="mt-2 text-xs break-words text-ink-faint">
                    Words learned: {day.vocab.join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="evidence">
        <h2 id="evidence" className="mb-3 text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Evidence
        </h2>
        {report.evidence.items.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Nothing recorded in this range. Attach a link on Today and it appears here.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {[...byMonth.entries()].map(([month, items]) => (
              <div key={month}>
                <h3 className="mb-2 text-sm font-semibold">{monthLabel(`${month}-01`)}</h3>
                <ul className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <li key={`${item.date}-${i}`} className="flex gap-3 text-sm">
                      <time className="w-20 shrink-0 tabular-nums text-ink-faint">{item.date}</time>
                      <span className="min-w-0 flex-1">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="font-medium text-accent underline"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <span className="font-medium">{item.title}</span>
                        )}
                        {item.metricValue !== null ? (
                          <span className="text-ink-soft">
                            {" "}
                            — {item.metricValue}
                            {item.metricUnit ? ` ${item.metricUnit}` : ""}{" "}
                            <span className="text-ink-faint">(self-reported)</span>
                          </span>
                        ) : null}
                        {item.note ? (
                          <span className="block text-xs text-ink-faint">{item.note}</span>
                        ) : null}
                        {item.url ? (
                          <span className="print-only block text-[10px] break-all text-ink-faint">
                            {item.url}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{item.category}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-line pt-4 text-xs text-ink-faint">
        Generated {formatLongDate(todayISO())}. Completion figures are computed from recorded task
        outcomes. Entries marked self-reported are not independently verifiable; links are.
      </footer>
    </div>
  );
}
