import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { dailyReviews, tasks, type DailyReview, type User } from "@/db/schema";
import { generateEveningInsight } from "@/lib/ai/tasks";
import type { AssistantContext } from "@/lib/ai/context";
import type { ReviewInput } from "@/lib/contracts";
import { getPlan } from "./plans";
import { behaviourSummary, refreshRollup } from "./history";

export async function getReview(userId: string, date: string): Promise<DailyReview | null> {
  const rows = await db
    .select()
    .from(dailyReviews)
    .where(and(eq(dailyReviews.userId, userId), eq(dailyReviews.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * End-of-day review. Task statuses are already recorded through the day, so
 * this only captures the reflective answers and then produces the insight that
 * feeds tomorrow's load factor.
 */
export async function submitReview(
  user: User,
  input: ReviewInput,
): Promise<{ review: DailyReview; aiUsed: boolean }> {
  const plan = await getPlan(user.id, input.date);
  if (!plan) throw new Error("There is no plan for that day to review.");

  const rows = await db.select().from(tasks).where(eq(tasks.planId, plan.id));
  const rollup = await refreshRollup(user.id, plan.id, input.date);

  const stats = {
    planned: rollup.plannedCount,
    completed: rollup.completedCount,
    skipped: rollup.skippedCount,
  };

  const behaviour = await behaviourSummary(user.id, input.date);

  const ctx: AssistantContext = {
    name: user.name,
    date: input.date,
    mode: plan.mode === "exam" ? "exam" : "normal",
    energyLevel: plan.energyLevel,
    availableMinutes: plan.availableMinutes,
    wins: rows
      .filter((t) => t.winType)
      .map((t) => ({ winType: t.winType ?? "", title: t.title, status: t.status })),
    pendingTaskTitles: rows.filter((t) => t.status === "pending").map((t) => t.title),
    openDifficulties: [],
    insights: behaviour.insights,
  };

  const { data, source } = await generateEveningInsight(user.id, input.date, ctx, stats);

  const insightText = [data.headline, ...data.observations, data.tomorrowAdjustment].join("\n");

  const saved = await db
    .insert(dailyReviews)
    .values({
      userId: user.id,
      date: input.date,
      energyGivers: input.energyGivers ?? null,
      energyDrains: input.energyDrains ?? null,
      learned: input.learned ?? null,
      tomorrowChange: input.tomorrowChange ?? null,
      threeWinsComplete: rollup.threeWins,
      aiInsight: insightText,
    })
    .onConflictDoUpdate({
      target: [dailyReviews.userId, dailyReviews.date],
      set: {
        energyGivers: input.energyGivers ?? null,
        energyDrains: input.energyDrains ?? null,
        learned: input.learned ?? null,
        tomorrowChange: input.tomorrowChange ?? null,
        threeWinsComplete: rollup.threeWins,
        aiInsight: insightText,
      },
    })
    .returning();

  const review = saved[0];
  if (!review) throw new Error("Could not save the review.");
  return { review, aiUsed: source !== "fallback" };
}
