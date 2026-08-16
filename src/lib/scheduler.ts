/**
 * The scheduling engine. Deterministic: same inputs, same timetable.
 *
 * Two rules drive the design and both come from the brief:
 *   1. Mandatory habits are placed before anything optional and are never
 *      dropped to make room.
 *   2. The day is not filled minute to minute. Breaks and a tail buffer are
 *      first-class, because a schedule that cannot be met teaches the user to
 *      ignore the schedule.
 */

import type { ScheduledBlock } from "./contracts";
import { addMinutes, spanMinutes, toClock, toMinutes } from "./time";

export interface SchedulableTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  priority: number;
  isMandatory: boolean;
  winType: string | null;
}

export interface FixedCommitment {
  title: string;
  startAt: string;
  durationMinutes: number;
}

export interface ScheduleRequest {
  wakeTime: string;
  sleepTime: string;
  availableMinutes: number;
  energyLevel: number;
  loadFactor: number;
  tasks: SchedulableTask[];
  commitments: FixedCommitment[];
}

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  unscheduled: SchedulableTask[];
  scheduledMinutes: number;
  capacityMinutes: number;
}

interface Interval {
  start: number;
  end: number;
}

const SETUP_MINUTES = 20;
const SHORT_BREAK = 10;
const LONG_BREAK = 15;
/** Continuous work after which a break is inserted. Lower when energy is low. */
function workStretch(energyLevel: number): number {
  if (energyLevel <= 2) return 35;
  if (energyLevel === 3) return 50;
  return 60;
}

/** The window between waking and sleeping, minus anything already committed. */
export function freeIntervals(
  wakeTime: string,
  sleepTime: string,
  commitments: FixedCommitment[],
): Interval[] {
  const dayStart = toMinutes(wakeTime);
  const dayLength = spanMinutes(wakeTime, sleepTime);
  if (Number.isNaN(dayStart) || dayLength <= 0) return [];

  // Work in minutes-since-wake so a day crossing midnight stays monotonic.
  const busy = commitments
    .map((c) => {
      const offset = (toMinutes(c.startAt) - dayStart + 1440) % 1440;
      return { start: offset, end: offset + c.durationMinutes };
    })
    .filter((b) => b.start < dayLength)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const slot of busy) {
    const last = merged[merged.length - 1];
    if (last && slot.start <= last.end) {
      last.end = Math.max(last.end, slot.end);
    } else {
      merged.push({ ...slot });
    }
  }

  const free: Interval[] = [];
  let cursor = 0;
  for (const slot of merged) {
    if (slot.start > cursor) free.push({ start: cursor, end: Math.min(slot.start, dayLength) });
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < dayLength) free.push({ start: cursor, end: dayLength });

  return free.filter((i) => i.end - i.start >= 15);
}

/**
 * Mandatory first, then priority, then the three wins ahead of filler. Stable
 * within a tier so the order the user typed is preserved.
 */
export function orderTasks(tasks: SchedulableTask[]): SchedulableTask[] {
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      if (a.task.isMandatory !== b.task.isMandatory) return a.task.isMandatory ? -1 : 1;
      if (a.task.priority !== b.task.priority) return a.task.priority - b.task.priority;
      const aWin = a.task.winType ? 0 : 1;
      const bWin = b.task.winType ? 0 : 1;
      if (aWin !== bWin) return aWin - bWin;
      return a.index - b.index;
    })
    .map(({ task }) => task);
}

export function buildSchedule(request: ScheduleRequest): ScheduleResult {
  const { wakeTime, sleepTime, energyLevel, loadFactor, tasks, commitments } = request;
  const dayStart = toMinutes(wakeTime);

  // Capacity is the smaller of what the user said they have and what their
  // recent behaviour says they'll actually finish.
  const capacityMinutes = Math.max(
    30,
    Math.floor(Math.min(request.availableMinutes, request.availableMinutes * loadFactor)),
  );

  const intervals = freeIntervals(wakeTime, sleepTime, commitments);
  const blocks: ScheduledBlock[] = [];
  const unscheduled: SchedulableTask[] = [];
  const ordered = orderTasks(tasks);

  if (intervals.length === 0) {
    return { blocks, unscheduled: ordered, scheduledMinutes: 0, capacityMinutes };
  }

  const commitmentBlocks: ScheduledBlock[] = commitments.map((c) => ({
    startAt: c.startAt,
    endAt: addMinutes(c.startAt, c.durationMinutes),
    title: c.title,
    kind: "task" as const,
    taskId: null,
    winType: null,
    isMandatory: true,
  }));

  let intervalIndex = 0;
  let cursor = intervals[0]?.start ?? 0;
  let scheduledMinutes = 0;
  let sinceBreak = 0;
  let placedSetup = false;

  const emit = (
    lengthMinutes: number,
    title: string,
    kind: ScheduledBlock["kind"],
    task: SchedulableTask | null,
  ) => {
    blocks.push({
      startAt: toClock(dayStart + cursor),
      endAt: toClock(dayStart + cursor + lengthMinutes),
      title,
      kind,
      taskId: task?.id ?? null,
      winType: (task?.winType as ScheduledBlock["winType"]) ?? null,
      isMandatory: task?.isMandatory ?? false,
    });
    cursor += lengthMinutes;
    if (kind === "task") {
      scheduledMinutes += lengthMinutes;
      sinceBreak += lengthMinutes;
    } else {
      sinceBreak = 0;
    }
  };

  /** Advance to an interval with at least `needed` minutes free. */
  const findRoom = (needed: number): boolean => {
    while (intervalIndex < intervals.length) {
      const interval = intervals[intervalIndex];
      if (!interval) return false;
      if (cursor < interval.start) cursor = interval.start;
      if (interval.end - cursor >= needed) return true;
      intervalIndex += 1;
      const next = intervals[intervalIndex];
      if (!next) return false;
      cursor = next.start;
      sinceBreak = 0; // a gap in the day is itself a break
    }
    return false;
  };

  if (findRoom(SETUP_MINUTES)) {
    emit(SETUP_MINUTES, "Morning setup — review the plan", "buffer", null);
    placedSetup = true;
  }

  const stretch = workStretch(energyLevel);

  for (const task of ordered) {
    const length = Math.max(5, task.estimatedMinutes);

    // Optional work stops at capacity; mandatory habits ignore it by design.
    if (!task.isMandatory && scheduledMinutes + length > capacityMinutes) {
      unscheduled.push(task);
      continue;
    }

    if (sinceBreak >= stretch && findRoom(SHORT_BREAK)) {
      emit(sinceBreak >= stretch * 2 ? LONG_BREAK : SHORT_BREAK, "Break", "break", null);
    }

    if (!findRoom(length)) {
      unscheduled.push(task);
      continue;
    }

    emit(length, task.title, "task", task);
  }

  const all = [...blocks, ...commitmentBlocks].sort(
    (a, b) => toMinutes(a.startAt) - toMinutes(b.startAt),
  );

  return {
    blocks: placedSetup || all.length > 0 ? all : [],
    unscheduled,
    scheduledMinutes,
    capacityMinutes,
  };
}

/** The next thing the user should actually do, given the current clock time. */
export function nextBlock(blocks: ScheduledBlock[], nowClock: string): ScheduledBlock | null {
  const now = toMinutes(nowClock);
  if (Number.isNaN(now)) return null;

  const current = blocks.find(
    (b) => b.kind === "task" && toMinutes(b.startAt) <= now && toMinutes(b.endAt) > now,
  );
  if (current) return current;

  return blocks.find((b) => b.kind === "task" && toMinutes(b.startAt) > now) ?? null;
}
