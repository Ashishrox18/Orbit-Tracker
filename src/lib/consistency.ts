/**
 * Streaks, and the pain-point analysis behind the exported report.
 *
 * Pure and deterministic. The report is meant to be shown to someone else, so
 * nothing here may be generated, estimated or softened — every claim traces to
 * a specific computation over dated rows.
 */

import type { DailyRollup } from "./behavior";
import { MIN_DAYS_FOR_INSIGHT } from "./constants";
import { shiftISO } from "./time";

export interface Streak {
  current: number;
  longest: number;
  /** The last date that counted, so the UI can say "since Tuesday". */
  lastQualifyingDate: string | null;
}

const EMPTY: Streak = { current: 0, longest: 0, lastQualifyingDate: null };

/**
 * Count back from today over a set of qualifying dates.
 *
 * Today not qualifying does not break a streak — the day isn't over. The run
 * is measured from yesterday in that case, which is why a morning check-in
 * doesn't show yesterday's work as already lost.
 */
export function streakFrom(qualifying: Iterable<string>, today: string): Streak {
  const days = new Set(qualifying);
  if (days.size === 0) return EMPTY;

  let cursor = days.has(today) ? today : shiftISO(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = shiftISO(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && shiftISO(previous, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  return { current, longest, lastQualifyingDate: sorted[sorted.length - 1] ?? null };
}

export interface StreakSet {
  activity: Streak;
  threeWins: Streak;
  evidence: Streak;
}

/**
 * Three streaks, because one number hides too much. Activity keeps you showing
 * up, three-wins is the internal bar, and evidence is the only one that means
 * anything to a reader who wasn't there.
 */
export function streaks(
  rollups: DailyRollup[],
  evidenceDates: string[],
  today: string,
): StreakSet {
  return {
    activity: streakFrom(
      rollups.filter((r) => r.completedCount > 0).map((r) => r.date),
      today,
    ),
    threeWins: streakFrom(rollups.filter((r) => r.threeWins).map((r) => r.date), today),
    evidence: streakFrom(evidenceDates, today),
  };
}

export interface PainPoint {
  id: string;
  /** What the data says, stated plainly. */
  finding: string;
  /** What to do about it. Omitted when the data doesn't imply an action. */
  action: string | null;
  severity: "high" | "medium" | "low";
}

export interface PainInput {
  rollups: DailyRollup[];
  /** Unresolved difficulties that have already been attempted more than once. */
  recurringDifficulties: { topic: string; attempts: number }[];
  /** Categories and outcomes, for the skip-rate analysis. */
  taskOutcomes: { category: string; status: string }[];
  /** Dates that carry at least one piece of evidence. */
  evidenceDates: string[];
  today: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? "" : (DAY_NAMES[new Date(t).getUTCDay()] ?? "");
}

/**
 * Where the system is actually leaking. Only findings the data supports —
 * below the minimum history this returns a single honest notice instead.
 */
export function painPoints(input: PainInput): PainPoint[] {
  const { rollups, recurringDifficulties, taskOutcomes, evidenceDates } = input;

  if (rollups.length < MIN_DAYS_FOR_INSIGHT) {
    return [
      {
        id: "insufficient",
        finding: `Only ${rollups.length} days recorded. Patterns need at least ${MIN_DAYS_FOR_INSIGHT}.`,
        action: null,
        severity: "low",
      },
    ];
  }

  const out: PainPoint[] = [];

  // 1. Which category you quietly drop.
  const byCategory = new Map<string, { skipped: number; total: number }>();
  for (const t of taskOutcomes) {
    const entry = byCategory.get(t.category) ?? { skipped: 0, total: 0 };
    entry.total += 1;
    if (t.status === "skipped") entry.skipped += 1;
    byCategory.set(t.category, entry);
  }
  let worst: { category: string; rate: number; total: number } | null = null;
  for (const [category, { skipped, total }] of byCategory) {
    if (total < 4) continue; // too thin to call a pattern
    const rate = skipped / total;
    if (rate >= 0.3 && (worst === null || rate > worst.rate)) worst = { category, rate, total };
  }
  if (worst) {
    out.push({
      id: "skipped-category",
      finding: `You skip ${Math.round(worst.rate * 100)}% of ${worst.category} tasks (${worst.total} scheduled).`,
      action: `Either schedule ${worst.category} earlier in the day, or stop scheduling it and admit it isn't a priority.`,
      severity: worst.rate >= 0.5 ? "high" : "medium",
    });
  }

  // 2. Topics that keep coming back are the real gaps.
  const stubborn = recurringDifficulties.filter((d) => d.attempts >= 2);
  if (stubborn.length > 0) {
    const worstTopic = [...stubborn].sort((a, b) => b.attempts - a.attempts)[0]!;
    out.push({
      id: "recurring-difficulty",
      finding: `"${worstTopic.topic}" has survived ${worstTopic.attempts} attempts${
        stubborn.length > 1 ? `, and ${stubborn.length - 1} other topic(s) are also repeating` : ""
      }.`,
      action: "A topic that resists repetition is usually a missing prerequisite, not a hard topic. Go one level down.",
      severity: worstTopic.attempts >= 4 ? "high" : "medium",
    });
  }

  // 3. When the streak breaks, does it break on the same day each week?
  const active = new Set(rollups.filter((r) => r.completedCount > 0).map((r) => r.date));
  const breaks: string[] = [];
  for (const r of rollups) {
    if (!active.has(r.date) && active.has(shiftISO(r.date, -1))) breaks.push(r.date);
  }
  if (breaks.length >= 3) {
    const counts = new Map<string, number>();
    for (const day of breaks) {
      const name = weekdayOf(day);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= Math.max(2, Math.ceil(breaks.length * 0.4))) {
      out.push({
        id: "break-weekday",
        finding: `${top[1]} of your ${breaks.length} missed days fell on a ${top[0]}.`,
        action: `Plan a deliberately lighter ${top[0]} instead of a normal one you won't finish.`,
        severity: "medium",
      });
    }
  }

  // 4. Days worked with nothing to show. This is the gap that hurts the report.
  const withEvidence = new Set(evidenceDates);
  const activeDays = rollups.filter((r) => r.completedCount > 0);
  const undocumented = activeDays.filter((r) => !withEvidence.has(r.date)).length;
  if (activeDays.length >= MIN_DAYS_FOR_INSIGHT && undocumented / activeDays.length > 0.5) {
    out.push({
      id: "evidence-gap",
      finding: `${undocumented} of ${activeDays.length} working days have no evidence attached.`,
      action: "Attach one link on the days you do real work — an undocumented day is invisible in the report.",
      severity: "high",
    });
  }

  // 5. Overplanning shows up as a persistent gap between planned and done.
  const planned = rollups.reduce((n, r) => n + r.plannedCount, 0);
  const completed = rollups.reduce((n, r) => n + r.completedCount, 0);
  if (planned > 0 && completed / planned < 0.6) {
    out.push({
      id: "overplanning",
      finding: `You finish ${Math.round((completed / planned) * 100)}% of what you plan across ${rollups.length} days.`,
      action: "The load factor is already shrinking your days. Cut one optional task at planning time as well.",
      severity: "high",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "none",
      finding: "No consistent weak points in the recorded data.",
      action: null,
      severity: "low",
    });
  }

  return out.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

export interface ReportSummary {
  from: string;
  to: string;
  daysTracked: number;
  activeDays: number;
  plannedTasks: number;
  completedTasks: number;
  completionRate: number | null;
  evidenceCount: number;
  verifiableCount: number;
}

/**
 * Headline figures. `verifiableCount` is separated on purpose: a reader should
 * be able to tell at a glance how much of this they can check themselves.
 */
export function reportSummary(
  rollups: DailyRollup[],
  evidenceItems: { date: string; kind: string }[],
  from: string,
  to: string,
): ReportSummary {
  const planned = rollups.reduce((n, r) => n + r.plannedCount, 0);
  const completed = rollups.reduce((n, r) => n + r.completedCount, 0);

  return {
    from,
    to,
    daysTracked: rollups.length,
    activeDays: rollups.filter((r) => r.completedCount > 0).length,
    plannedTasks: planned,
    completedTasks: completed,
    completionRate: planned === 0 ? null : completed / planned,
    evidenceCount: evidenceItems.length,
    verifiableCount: evidenceItems.filter((e) => e.kind === "link" || e.kind === "file").length,
  };
}
