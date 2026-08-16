import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { dailyPlans, difficulties, habits, tasks, type Task, type User } from "@/db/schema";
import type { StartDayInput, ScheduledBlock } from "@/lib/contracts";
import { buildDayPlan, type PlanResult } from "@/lib/planner";
import { buildSchedule, nextBlock, type FixedCommitment } from "@/lib/scheduler";
import { shiftISO, toClock } from "@/lib/time";
import type { WinType } from "@/lib/constants";
import { behaviourSummary, daysSinceEmotionalWin, refreshRollup } from "./history";

/**
 * Day plans. Creating a plan is idempotent per (user, date) — the unique index
 * enforces it — so a double-submitted "Start my day" cannot produce two
 * timetables.
 */

export interface DayView {
  plan: {
    id: string;
    date: string;
    mode: "normal" | "exam";
    energyLevel: number;
    availableMinutes: number;
    mainGoal: string | null;
    variationTheme: string | null;
    aiSummary: string | null;
  } | null;
  tasks: Task[];
  wins: { winType: WinType; task: Task | null }[];
  blocks: ScheduledBlock[];
  next: ScheduledBlock | null;
  completion: { completed: number; planned: number; percent: number };
}

const EMPTY_COMPLETION = { completed: 0, planned: 0, percent: 0 };

export async function getPlan(userId: string, date: string) {
  const rows = await db
    .select()
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDayView(user: User, date: string, nowClock: string): Promise<DayView> {
  const plan = await getPlan(user.id, date);
  if (!plan) {
    return {
      plan: null,
      tasks: [],
      wins: [],
      blocks: [],
      next: null,
      completion: EMPTY_COMPLETION,
    };
  }

  const rows = await db.select().from(tasks).where(eq(tasks.planId, plan.id));

  const blocks: ScheduledBlock[] = rows
    .filter((t): t is Task & { startAt: string; endAt: string } =>
      Boolean(t.startAt && t.endAt),
    )
    .map((t) => ({
      startAt: t.startAt,
      endAt: t.endAt,
      title: t.title,
      kind: "task" as const,
      taskId: t.id,
      winType: (t.winType as WinType | null) ?? null,
      isMandatory: t.isMandatory,
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const completed = rows.filter((t) => t.status === "completed").length;

  const wins = (["physical", "mental", "emotional"] as const).map((winType) => ({
    winType,
    task: rows.find((t) => t.winType === winType) ?? null,
  }));

  return {
    plan: {
      id: plan.id,
      date: plan.date,
      mode: plan.mode === "exam" ? "exam" : "normal",
      energyLevel: plan.energyLevel,
      availableMinutes: plan.availableMinutes,
      mainGoal: plan.mainGoal,
      variationTheme: plan.variationTheme,
      aiSummary: plan.aiSummary,
    },
    tasks: rows.sort((a, b) => (a.startAt ?? "99:99").localeCompare(b.startAt ?? "99:99")),
    wins,
    blocks,
    next: nextBlock(blocks, nowClock),
    completion: {
      completed,
      planned: rows.length,
      percent: rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100),
    },
  };
}

export interface BacklogItem {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  status: string;
  tags: string[];
}

/**
 * Yesterday's self-added tasks that never got marked done. Habit, win, and
 * difficulty-repair tasks are excluded — the planner regenerates those fresh
 * every day on its own, so carrying them forward would just duplicate them.
 */
export async function yesterdayBacklog(userId: string, today: string): Promise<BacklogItem[]> {
  const yesterday = shiftISO(today, -1);
  const plan = await getPlan(userId, yesterday);
  if (!plan) return [];

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      category: tasks.category,
      estimatedMinutes: tasks.estimatedMinutes,
      status: tasks.status,
      tags: tasks.tags,
    })
    .from(tasks)
    .where(and(eq(tasks.planId, plan.id), eq(tasks.source, "user"), ne(tasks.status, "completed")));
}

export interface StartDayResult {
  planId: string;
  plan: PlanResult;
  unscheduledCount: number;
  loadFactor: number;
}

/**
 * The morning flow. Order matters: behaviour is read first so the load factor
 * can shrink the day before anything is scheduled, which is what makes the
 * system adapt rather than just record.
 */
export async function startDay(user: User, input: StartDayInput): Promise<StartDayResult> {
  const existing = await getPlan(user.id, input.date);
  if (existing) {
    await db.delete(tasks).where(eq(tasks.planId, existing.id));
  }

  const [habitRows, difficultyRows, behaviour, emotionalGap] = await Promise.all([
    db
      .select()
      .from(habits)
      .where(and(eq(habits.userId, user.id), eq(habits.active, true))),
    db
      .select()
      .from(difficulties)
      .where(eq(difficulties.userId, user.id)),
    behaviourSummary(user.id, input.date),
    daysSinceEmotionalWin(user.id, input.date),
  ]);

  const planResult = buildDayPlan({
    input,
    exerciseMinutes: user.exerciseMinutes,
    learningMinutes: user.learningMinutes,
    subjects: user.subjects,
    examSubjects: user.examSubjects,
    socialFrequencyDays: user.socialFrequencyDays,
    habits: habitRows.map((h) => ({
      id: h.id,
      title: h.title,
      category: h.category,
      durationMinutes: h.durationMinutes,
    })),
    difficulties: difficultyRows.filter((d) => d.status !== "resolved"),
    daysSinceEmotionalWin: emotionalGap,
  });

  const commitments: FixedCommitment[] = input.fixedCommitments.map((c) => ({
    title: c.title,
    startAt: c.startAt,
    durationMinutes: c.durationMinutes,
  }));

  // Schedule against synthetic ids, then map times back onto the real rows.
  const schedule = buildSchedule({
    wakeTime: user.wakeTime,
    sleepTime: user.sleepTime,
    availableMinutes: input.availableMinutes,
    energyLevel: input.energyLevel,
    loadFactor: behaviour.loadFactor,
    commitments,
    tasks: planResult.tasks.map((t, i) => ({
      id: String(i),
      title: t.title,
      estimatedMinutes: t.estimatedMinutes,
      priority: t.priority,
      isMandatory: t.isMandatory,
      winType: t.winType,
    })),
  });

  const timesByIndex = new Map<string, { startAt: string; endAt: string }>();
  for (const block of schedule.blocks) {
    if (block.taskId !== null) {
      timesByIndex.set(block.taskId, { startAt: block.startAt, endAt: block.endAt });
    }
  }

  const planRow = existing
    ? (
        await db
          .update(dailyPlans)
          .set({
            mode: input.examMode ? "exam" : "normal",
            energyLevel: input.energyLevel,
            availableMinutes: input.availableMinutes,
            mainGoal: input.mainGoal ?? null,
            variationTheme: planResult.theme,
            plannedLoadMinutes: schedule.scheduledMinutes,
            loadFactor: behaviour.loadFactor,
          })
          .where(eq(dailyPlans.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(dailyPlans)
          .values({
            userId: user.id,
            date: input.date,
            mode: input.examMode ? "exam" : "normal",
            energyLevel: input.energyLevel,
            availableMinutes: input.availableMinutes,
            mainGoal: input.mainGoal ?? null,
            variationTheme: planResult.theme,
            plannedLoadMinutes: schedule.scheduledMinutes,
            loadFactor: behaviour.loadFactor,
          })
          .returning()
      )[0];

  if (!planRow) throw new Error("Could not create the day plan.");

  await db.insert(tasks).values(
    planResult.tasks.map((t, i) => {
      const times = timesByIndex.get(String(i));
      return {
        planId: planRow.id,
        userId: user.id,
        title: t.title,
        detail: t.detail,
        category: t.category,
        winType: t.winType,
        isMandatory: t.isMandatory,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        startAt: times?.startAt ?? null,
        endAt: times?.endAt ?? null,
        source: t.source,
        difficultyId: t.difficultyId,
      };
    }),
  );

  await refreshRollup(user.id, planRow.id, input.date);

  return {
    planId: planRow.id,
    plan: planResult,
    unscheduledCount: schedule.unscheduled.length,
    loadFactor: behaviour.loadFactor,
  };
}

export async function setPlanSummary(planId: string, summary: string): Promise<void> {
  await db.update(dailyPlans).set({ aiSummary: summary }).where(eq(dailyPlans.id, planId));
}

/** Append an ad-hoc task to today, scheduled after the last existing block. */
export async function addTask(
  user: User,
  date: string,
  input: { title: string; category: string; estimatedMinutes: number; priority: number; tags: string[] },
): Promise<Task> {
  const plan = await getPlan(user.id, date);
  if (!plan) throw new Error("Start your day before adding tasks.");

  const rows = await db.select().from(tasks).where(eq(tasks.planId, plan.id));
  const lastEnd = rows.reduce((latest, t) => (t.endAt && t.endAt > latest ? t.endAt : latest), "");

  const startAt = lastEnd || null;
  const endAt = startAt
    ? toClock(
        Number(startAt.slice(0, 2)) * 60 + Number(startAt.slice(3)) + input.estimatedMinutes,
      )
    : null;

  const inserted = await db
    .insert(tasks)
    .values({
      planId: plan.id,
      userId: user.id,
      title: input.title,
      category: input.category,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
      priority: input.priority,
      source: "user",
      startAt,
      endAt,
    })
    .returning();

  const task = inserted[0];
  if (!task) throw new Error("Could not add the task.");

  await refreshRollup(user.id, plan.id, date);
  return task;
}

export async function updateTaskStatus(
  user: User,
  taskId: string,
  status: string,
  actualMinutes: number | null | undefined,
): Promise<Task | null> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return null;

  const updated = await db
    .update(tasks)
    .set({
      status,
      actualMinutes: actualMinutes ?? existing.actualMinutes,
      completedAt: status === "completed" ? new Date() : null,
    })
    .where(eq(tasks.id, taskId))
    .returning();

  const task = updated[0] ?? null;
  if (task) {
    const plan = await db
      .select({ date: dailyPlans.date })
      .from(dailyPlans)
      .where(eq(dailyPlans.id, task.planId))
      .limit(1);
    const date = plan[0]?.date;
    if (date) await refreshRollup(user.id, task.planId, date);
  }
  return task;
}

/** Edit a task in place. Times are recomputed when only a duration changes. */
export async function editTask(
  user: User,
  input: {
    id: string;
    title?: string;
    category?: string;
    estimatedMinutes?: number;
    startAt?: string | null;
    endAt?: string | null;
    tags?: string[];
  },
): Promise<Task | null> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.id), eq(tasks.userId, user.id)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return null;

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.category !== undefined) patch.category = input.category;
  if (input.startAt !== undefined) patch.startAt = input.startAt;
  if (input.endAt !== undefined) patch.endAt = input.endAt;
  if (input.tags !== undefined) patch.tags = input.tags;

  if (input.estimatedMinutes !== undefined) {
    patch.estimatedMinutes = input.estimatedMinutes;
    // Keep the block coherent: a longer task pushes its own end time out,
    // rather than silently overlapping whatever follows it.
    const start = (input.startAt ?? existing.startAt) as string | null;
    if (start && input.endAt === undefined) {
      const mins = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
      patch.endAt = toClock(mins + input.estimatedMinutes);
    }
  }

  const updated = await db.update(tasks).set(patch).where(eq(tasks.id, input.id)).returning();
  const task = updated[0] ?? null;

  if (task) {
    const plan = await db
      .select({ date: dailyPlans.date })
      .from(dailyPlans)
      .where(eq(dailyPlans.id, task.planId))
      .limit(1);
    const date = plan[0]?.date;
    if (date) await refreshRollup(user.id, task.planId, date);
  }
  return task;
}

export async function deleteTask(user: User, id: string): Promise<boolean> {
  const rows = await db
    .select({ planId: tasks.planId })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .limit(1);

  const planId = rows[0]?.planId;
  if (!planId) return false;

  await db.delete(tasks).where(eq(tasks.id, id));

  const plan = await db
    .select({ date: dailyPlans.date })
    .from(dailyPlans)
    .where(eq(dailyPlans.id, planId))
    .limit(1);
  const date = plan[0]?.date;
  if (date) await refreshRollup(user.id, planId, date);

  return true;
}
