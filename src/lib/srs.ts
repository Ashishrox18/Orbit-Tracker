/**
 * SM-2 spaced repetition, shared by every kind of material.
 *
 * One queue for vocabulary, concepts and resolved difficulties. Three separate
 * schedulers would give the user three competing answers to "what should I
 * review"; one gives them a single honest one.
 *
 * Pure and deterministic — no AI, no clock reads. `today` is always passed in.
 */

import { shiftISO } from "./time";

export const GRADES = ["again", "hard", "good", "easy"] as const;
export type Grade = (typeof GRADES)[number];

/** SM-2 quality values. Below 3 is a lapse and resets the repetition count. */
const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 365;

export interface ScheduleState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
}

export interface ScheduleResult extends ScheduleState {
  due: string;
}

export const NEW_ITEM: ScheduleState = {
  repetitions: 0,
  intervalDays: 0,
  easeFactor: 2.5,
  lapses: 0,
};

/**
 * Advance an item after a review.
 *
 * A lapse keeps the ease penalty but restarts the interval at one day: the
 * item is not forgotten forever, it just has to earn its spacing back.
 */
export function schedule(state: ScheduleState, grade: Grade, today: string): ScheduleResult {
  const q = QUALITY[grade];

  // Standard SM-2 ease adjustment, floored so a run of failures can't drive an
  // item into permanent daily repetition.
  const ease = Math.max(
    MIN_EASE,
    Number((state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(4)),
  );

  if (q < 3) {
    return {
      repetitions: 0,
      intervalDays: 1,
      easeFactor: ease,
      lapses: state.lapses + 1,
      due: shiftISO(today, 1),
    };
  }

  const repetitions = state.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(state.intervalDays * ease);

  // "Hard" should never expand the interval as much as "good".
  if (grade === "hard") intervalDays = Math.max(1, Math.round(intervalDays * 0.6));

  intervalDays = Math.min(Math.max(1, intervalDays), MAX_INTERVAL_DAYS);

  return {
    repetitions,
    intervalDays,
    easeFactor: ease,
    lapses: state.lapses,
    due: shiftISO(today, intervalDays),
  };
}

export interface DueItem {
  id: string;
  kind: string;
  due: string;
  lapses: number;
  intervalDays: number;
}

/**
 * What to review now. Overdue first, then the items most often forgotten —
 * a lapsed word is worth more attention than one seen once.
 */
export function selectDue<T extends DueItem>(items: T[], today: string, limit = 20): T[] {
  return items
    .filter((i) => i.due <= today)
    .sort((a, b) => {
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (b.lapses !== a.lapses) return b.lapses - a.lapses;
      return a.intervalDays - b.intervalDays;
    })
    .slice(0, limit);
}

export interface QueueStats {
  due: number;
  learning: number;
  mature: number;
  total: number;
}

/** Mature = 21+ day interval, the conventional line for "in long-term memory". */
export function queueStats(items: DueItem[], today: string): QueueStats {
  let due = 0;
  let learning = 0;
  let mature = 0;

  for (const item of items) {
    if (item.due <= today) due += 1;
    if (item.intervalDays >= 21) mature += 1;
    else learning += 1;
  }

  return { due, learning, mature, total: items.length };
}

/** Retention across reviewed items — lapses per repetition, inverted. */
export function retentionRate(
  items: { repetitions: number; lapses: number }[],
): number | null {
  const seen = items.filter((i) => i.repetitions + i.lapses > 0);
  if (seen.length < 5) return null; // too thin to state as a number

  const attempts = seen.reduce((n, i) => n + i.repetitions + i.lapses, 0);
  const lapses = seen.reduce((n, i) => n + i.lapses, 0);
  return attempts === 0 ? null : (attempts - lapses) / attempts;
}
