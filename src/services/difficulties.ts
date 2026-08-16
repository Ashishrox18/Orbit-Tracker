import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { difficulties, type Difficulty, type User } from "@/db/schema";
import { classifyDifficulty } from "@/lib/ai/tasks";
import type { DifficultyCaptureInput, DifficultyUpdateInput } from "@/lib/contracts";
import { difficultyStats, nextStage, rankDifficulties } from "@/lib/difficulty";

export async function listDifficulties(userId: string): Promise<Difficulty[]> {
  return db
    .select()
    .from(difficulties)
    .where(eq(difficulties.userId, userId))
    .orderBy(desc(difficulties.createdAt));
}

export async function openDifficulties(userId: string, today: string): Promise<Difficulty[]> {
  const all = await listDifficulties(userId);
  return rankDifficulties(all, today);
}

export async function difficultyDashboard(userId: string, today: string) {
  const all = await listDifficulties(userId);
  return {
    all,
    ranked: rankDifficulties(all, today),
    stats: difficultyStats(all),
  };
}

/**
 * Capture flow. The AI classification is a nicety — if Groq is unreachable the
 * local heuristic classifier fills the same fields and the row is still
 * written, because losing a captured struggle is the worst possible failure
 * mode for this feature.
 */
export async function captureDifficulty(
  user: User,
  today: string,
  input: DifficultyCaptureInput,
): Promise<{ difficulty: Difficulty; aiUsed: boolean }> {
  const { data, source } = await classifyDifficulty(
    user.id,
    today,
    input.rawInput,
    input.difficulty,
    input.subjectHint,
  );

  const inserted = await db
    .insert(difficulties)
    .values({
      userId: user.id,
      rawInput: input.rawInput,
      topic: data.topic,
      subject: data.subject,
      // The learner's own rating wins — they know whether they're stuck.
      difficulty: input.difficulty,
      problemType: data.problemType,
      tags: input.tags,
      likelyGap: data.likelyGap,
      recommendedAction: data.recommendedAction,
      estimatedMinutes: data.estimatedMinutes,
      classifiedByAi: source !== "fallback",
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Could not save the difficulty.");
  return { difficulty: row, aiUsed: source !== "fallback" };
}

/**
 * Progress a difficulty.
 *
 * `stillStruggling` is the important branch: it advances the intervention
 * stage so the next plan schedules a *different kind* of work rather than the
 * same task again. That escalation is what turns the list into a learning loop.
 */
export async function updateDifficulty(
  user: User,
  input: DifficultyUpdateInput,
): Promise<Difficulty | null> {
  const rows = await db
    .select()
    .from(difficulties)
    .where(and(eq(difficulties.id, input.id), eq(difficulties.userId, user.id)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return null;

  const struggling = input.stillStruggling === true;
  const status = input.status ?? (struggling ? "in_progress" : existing.status);

  const updated = await db
    .update(difficulties)
    .set({
      status,
      attempts: struggling ? existing.attempts + 1 : existing.attempts,
      interventionStage: struggling
        ? nextStage(existing.interventionStage)
        : existing.interventionStage,
      timeSpentMinutes: existing.timeSpentMinutes + (input.timeSpentMinutes ?? 0),
      reflection: input.reflection ?? existing.reflection,
      resolution: input.resolution ?? existing.resolution,
      tags: input.tags ?? existing.tags,
      resolvedAt: status === "resolved" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(difficulties.id, input.id))
    .returning();

  return updated[0] ?? null;
}
