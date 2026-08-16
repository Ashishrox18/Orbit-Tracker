/**
 * Behavioural analysis. Entirely deterministic — the product claim is that the
 * assistant learns how the user *actually* behaves, so none of these numbers
 * may come from a language model.
 *
 * The governing rule: never state an insight the data doesn't support. Below
 * MIN_DAYS_FOR_INSIGHT days of history every reader gets `null` and the UI
 * says it is still learning.
 */

import { MIDDAY_MINUTES, MIN_DAYS_FOR_INSIGHT } from "./constants";
import { toMinutes } from "./time";

export interface TaskLike {
  status: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  startAt: string | null;
  winType: string | null;
  category: string;
}

export interface DailyRollup {
  date: string;
  plannedCount: number;
  completedCount: number;
  skippedCount: number;
  plannedMinutes: number;
  actualMinutes: number;
  morningPlanned: number;
  morningCompleted: number;
  eveningPlanned: number;
  eveningCompleted: number;
  threeWins: boolean;
}

/** Collapse one day's tasks into the row stored in `behavior_metrics`. */
export function rollupDay(date: string, tasks: TaskLike[]): DailyRollup {
  const rollup: DailyRollup = {
    date,
    plannedCount: tasks.length,
    completedCount: 0,
    skippedCount: 0,
    plannedMinutes: 0,
    actualMinutes: 0,
    morningPlanned: 0,
    morningCompleted: 0,
    eveningPlanned: 0,
    eveningCompleted: 0,
    threeWins: false,
  };

  const winsDone = new Set<string>();

  for (const task of tasks) {
    const done = task.status === "completed";
    rollup.plannedMinutes += task.estimatedMinutes;
    if (done) {
      rollup.completedCount += 1;
      rollup.actualMinutes += task.actualMinutes ?? task.estimatedMinutes;
      if (task.winType) winsDone.add(task.winType);
    }
    if (task.status === "skipped") rollup.skippedCount += 1;

    // Unscheduled tasks belong to neither window rather than defaulting to one.
    if (task.startAt) {
      const start = toMinutes(task.startAt);
      if (!Number.isNaN(start)) {
        if (start < MIDDAY_MINUTES) {
          rollup.morningPlanned += 1;
          if (done) rollup.morningCompleted += 1;
        } else {
          rollup.eveningPlanned += 1;
          if (done) rollup.eveningCompleted += 1;
        }
      }
    }
  }

  rollup.threeWins = winsDone.size === 3;
  return rollup;
}

export function completionRate(rollups: DailyRollup[]): number | null {
  const planned = rollups.reduce((n, r) => n + r.plannedCount, 0);
  if (planned === 0) return null;
  const done = rollups.reduce((n, r) => n + r.completedCount, 0);
  return done / planned;
}

/**
 * Estimated minutes divided by actual. Below 1 means the user consistently
 * underestimates; the scheduler uses the reciprocal to pad future blocks.
 */
export function planningAccuracy(rollups: DailyRollup[]): number | null {
  const withActuals = rollups.filter((r) => r.actualMinutes > 0 && r.completedCount > 0);
  if (withActuals.length < MIN_DAYS_FOR_INSIGHT) return null;
  const planned = withActuals.reduce((n, r) => n + r.plannedMinutes, 0);
  const actual = withActuals.reduce((n, r) => n + r.actualMinutes, 0);
  if (actual === 0) return null;
  return planned / actual;
}

/**
 * How much of a "full" day's load to schedule tomorrow, from recent completion.
 *
 * Clamped to 0.6–1.0: never spiral a bad week into a two-task day, and never
 * plan more than the stated available time just because yesterday went well.
 */
export function loadFactor(rollups: DailyRollup[]): number {
  const recent = rollups.slice(-7);
  const rate = completionRate(recent);
  if (rate === null || recent.length < 2) return 1;
  return Math.min(1, Math.max(0.6, Number((0.55 + rate * 0.5).toFixed(2))));
}

export interface WindowComparison {
  morningRate: number;
  eveningRate: number;
  strongerWindow: "morning" | "evening";
  gapPoints: number;
}

export function windowComparison(rollups: DailyRollup[]): WindowComparison | null {
  if (rollups.length < MIN_DAYS_FOR_INSIGHT) return null;
  const mp = rollups.reduce((n, r) => n + r.morningPlanned, 0);
  const ep = rollups.reduce((n, r) => n + r.eveningPlanned, 0);
  if (mp < 3 || ep < 3) return null;

  const morningRate = rollups.reduce((n, r) => n + r.morningCompleted, 0) / mp;
  const eveningRate = rollups.reduce((n, r) => n + r.eveningCompleted, 0) / ep;
  return {
    morningRate,
    eveningRate,
    strongerWindow: morningRate >= eveningRate ? "morning" : "evening",
    gapPoints: Math.round(Math.abs(morningRate - eveningRate) * 100),
  };
}

/** Consecutive days ending at the most recent, where all three wins landed. */
export function threeWinStreak(rollups: DailyRollup[]): number {
  let streak = 0;
  for (let i = rollups.length - 1; i >= 0; i -= 1) {
    if (!rollups[i]?.threeWins) break;
    streak += 1;
  }
  return streak;
}

/**
 * The streak as it stands right now, not as of yesterday. Today counts the
 * moment its three wins land — you don't have to wait for tomorrow's rollup
 * to see the number move.
 */
export function currentThreeWinStreak(rollups: DailyRollup[], today: string): number {
  const priorDays = rollups.filter((r) => r.date !== today);
  const historic = threeWinStreak(priorDays);
  const todayRow = rollups.find((r) => r.date === today);
  return todayRow?.threeWins ? historic + 1 : historic;
}

export function longestThreeWinStreak(rollups: DailyRollup[]): number {
  let best = 0;
  let run = 0;
  for (const r of rollups) {
    run = r.threeWins ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** Fraction of days with any completed task — resilience, not perfection. */
export function consistencyScore(rollups: DailyRollup[]): number | null {
  if (rollups.length === 0) return null;
  const active = rollups.filter((r) => r.completedCount > 0).length;
  return active / rollups.length;
}

export function mostSkippedCategory(
  tasksByCategory: { category: string; status: string }[],
): string | null {
  const counts = new Map<string, { skipped: number; total: number }>();
  for (const t of tasksByCategory) {
    const entry = counts.get(t.category) ?? { skipped: 0, total: 0 };
    entry.total += 1;
    if (t.status === "skipped") entry.skipped += 1;
    counts.set(t.category, entry);
  }

  let worst: { category: string; rate: number } | null = null;
  for (const [category, { skipped, total }] of counts) {
    if (total < 3) continue; // too thin to be a pattern
    const rate = skipped / total;
    if (rate > 0 && (worst === null || rate > worst.rate)) worst = { category, rate };
  }
  return worst?.category ?? null;
}

export interface Insight {
  id: string;
  text: string;
  /** True when the claim rests on enough data to be worth acting on. */
  reliable: boolean;
}

/**
 * Human-readable insights, each traceable to a specific computation above.
 * Returns the "still learning" notice rather than inventing something when
 * history is too thin — that honesty is the feature.
 */
export function buildInsights(rollups: DailyRollup[]): Insight[] {
  const out: Insight[] = [];

  if (rollups.length < MIN_DAYS_FOR_INSIGHT) {
    const remaining = MIN_DAYS_FOR_INSIGHT - rollups.length;
    out.push({
      id: "insufficient-data",
      text: `Still learning your pattern — ${remaining} more ${
        remaining === 1 ? "day" : "days"
      } of data will make these insights reliable.`,
      reliable: false,
    });
    return out;
  }

  const rate = completionRate(rollups);
  if (rate !== null) {
    out.push({
      id: "completion-rate",
      text: `You complete ${Math.round(rate * 100)}% of what you plan.`,
      reliable: true,
    });
  }

  const windows = windowComparison(rollups);
  if (windows && windows.gapPoints >= 10) {
    const strong = windows.strongerWindow;
    const strongRate = Math.round(
      (strong === "morning" ? windows.morningRate : windows.eveningRate) * 100,
    );
    const weakRate = Math.round(
      (strong === "morning" ? windows.eveningRate : windows.morningRate) * 100,
    );
    out.push({
      id: "window-gap",
      text: `You finish ${strongRate}% of tasks scheduled in the ${strong}, but only ${weakRate}% in the ${
        strong === "morning" ? "evening" : "morning"
      }. High-priority work is being moved to your ${strong}.`,
      reliable: true,
    });
  }

  const accuracy = planningAccuracy(rollups);
  if (accuracy !== null && Math.abs(accuracy - 1) > 0.15) {
    const under = accuracy < 1;
    out.push({
      id: "planning-accuracy",
      text: under
        ? `Tasks take about ${Math.round((1 / accuracy - 1) * 100)}% longer than you estimate. Future blocks are padded to match.`
        : `You finish about ${Math.round((accuracy - 1) * 100)}% faster than you estimate. There is room for more.`,
      reliable: true,
    });
  }

  const streak = threeWinStreak(rollups);
  const best = longestThreeWinStreak(rollups);
  if (streak >= 2) {
    out.push({
      id: "streak",
      text: `${streak} days running with all three wins.`,
      reliable: true,
    });
  } else if (best >= 3) {
    out.push({
      id: "streak-restart",
      text: `Your longest three-win run was ${best} days. One small win restarts it.`,
      reliable: true,
    });
  }

  return out;
}
