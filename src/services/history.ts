import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { behaviorMetrics, tasks } from "@/db/schema";
import {
  buildInsights,
  loadFactor,
  rollupDay,
  type DailyRollup,
  type Insight,
} from "@/lib/behavior";
import { shiftISO } from "@/lib/time";

/**
 * Behavioural history. Reads the stored daily rollups rather than recomputing
 * from raw tasks on every request — the rollup is written once when a day's
 * tasks change, which keeps the Progress page to a single indexed query.
 */

const HISTORY_DAYS = 30;

export async function recentRollups(
  userId: string,
  today: string,
  days = HISTORY_DAYS,
): Promise<DailyRollup[]> {
  const since = shiftISO(today, -days);
  const rows = await db
    .select()
    .from(behaviorMetrics)
    .where(and(eq(behaviorMetrics.userId, userId), gte(behaviorMetrics.date, since)))
    .orderBy(behaviorMetrics.date);

  return rows.map((r) => ({
    date: r.date,
    plannedCount: r.plannedCount,
    completedCount: r.completedCount,
    skippedCount: r.skippedCount,
    plannedMinutes: r.plannedMinutes,
    actualMinutes: r.actualMinutes,
    morningPlanned: r.morningPlanned,
    morningCompleted: r.morningCompleted,
    eveningPlanned: r.eveningPlanned,
    eveningCompleted: r.eveningCompleted,
    threeWins: r.threeWins,
  }));
}

/** Recompute and persist one day's rollup. Called after any task mutation. */
export async function refreshRollup(
  userId: string,
  planId: string,
  date: string,
): Promise<DailyRollup> {
  const rows = await db.select().from(tasks).where(eq(tasks.planId, planId));
  const rollup = rollupDay(date, rows);

  await db
    .insert(behaviorMetrics)
    .values({ userId, ...rollup })
    .onConflictDoUpdate({
      target: [behaviorMetrics.userId, behaviorMetrics.date],
      set: {
        plannedCount: rollup.plannedCount,
        completedCount: rollup.completedCount,
        skippedCount: rollup.skippedCount,
        plannedMinutes: rollup.plannedMinutes,
        actualMinutes: rollup.actualMinutes,
        morningPlanned: rollup.morningPlanned,
        morningCompleted: rollup.morningCompleted,
        eveningPlanned: rollup.eveningPlanned,
        eveningCompleted: rollup.eveningCompleted,
        threeWins: rollup.threeWins,
      },
    });

  return rollup;
}

export interface BehaviourSummary {
  rollups: DailyRollup[];
  insights: Insight[];
  loadFactor: number;
  hasEnoughData: boolean;
}

export async function behaviourSummary(
  userId: string,
  today: string,
): Promise<BehaviourSummary> {
  // Exclude today: a day in progress would drag every rate down until evening.
  const rollups = (await recentRollups(userId, today)).filter((r) => r.date !== today);
  const insights = buildInsights(rollups);
  return {
    rollups,
    insights,
    loadFactor: loadFactor(rollups),
    hasEnoughData: insights.some((i) => i.reliable),
  };
}

/** Days since an emotional win last completed, or null if it never has. */
export async function daysSinceEmotionalWin(
  userId: string,
  today: string,
): Promise<number | null> {
  const rows = await db
    .select({ completedAt: tasks.completedAt })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.winType, "emotional"),
        eq(tasks.status, "completed"),
      ),
    )
    .orderBy(desc(tasks.completedAt))
    .limit(1);

  const last = rows[0]?.completedAt;
  if (!last) return null;

  const lastISO = last.toISOString().slice(0, 10);
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastISO}T00:00:00Z`)) / 86_400_000,
  );
  return Math.max(0, diff);
}
