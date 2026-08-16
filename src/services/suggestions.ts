import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { taskSuggestions, type TaskSuggestion, type User } from "@/db/schema";
import { requestStructured } from "@/lib/ai/client";
import { BASE_RULES } from "@/lib/ai/context";
import { TASK_CATEGORIES } from "@/lib/constants";
import { addTask } from "./plans";

/**
 * Task suggestion with preference learning.
 *
 * You type a rough intent — "add Eureka" — and Orbit proposes the concrete
 * tasks that intent implies. What you accept and what you ignore is recorded,
 * and recent history is fed back into the prompt, so proposals move toward the
 * way you actually phrase and size your own work.
 */

const suggestionBatch = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(120),
        category: z.enum(TASK_CATEGORIES),
        estimatedMinutes: z.number().int().min(5).max(240),
        rationale: z.string().trim().max(200),
      }),
    )
    .min(1)
    .max(8),
});

/** Recent decisions, newest first — the raw material for the prompt. */
async function preferenceHistory(userId: string) {
  const rows = await db
    .select()
    .from(taskSuggestions)
    .where(eq(taskSuggestions.userId, userId))
    .orderBy(desc(taskSuggestions.createdAt))
    .limit(80);

  return {
    accepted: rows.filter((r) => r.accepted === true).slice(0, 20),
    rejected: rows.filter((r) => r.accepted === false).slice(0, 20),
  };
}

export interface SuggestionContext {
  goals: string[];
  subjects: string[];
  examMode: boolean;
  /** What is already on today's plan, so proposals don't duplicate it. */
  existingTitles: string[];
}

export async function suggestTasks(
  user: User,
  intent: string,
  ctx: SuggestionContext,
): Promise<{ suggestions: TaskSuggestion[]; aiUsed: boolean }> {
  const history = await preferenceHistory(user.id);

  // Deterministic fallback: a single task that is exactly what they typed.
  // Better to add the one obvious thing than to invent five without a model.
  const fallback = {
    tasks: [
      {
        title: intent.slice(0, 120),
        category: "other" as const,
        estimatedMinutes: 30,
        rationale: "Added as typed — AI was unavailable to expand it.",
      },
    ],
  };

  const averageMinutes =
    history.accepted.length > 0
      ? Math.round(
          history.accepted.reduce((n, r) => n + r.estimatedMinutes, 0) / history.accepted.length,
        )
      : null;

  const { data, source } = await requestStructured({
    system: `${BASE_RULES} You break a rough intention into the concrete tasks it implies. Reply with JSON in exactly this shape:
{"tasks":[{"title":"...","category":"mental","estimatedMinutes":45,"rationale":"one short clause"}]}
category must be one of: ${TASK_CATEGORIES.join(", ")}.
Rules: propose 4-6 tasks. Each title must be a specific action someone could start immediately — never a topic or a goal. Order them the way the work would actually be done. Do not repeat anything already on the plan.`,
    user:
      `Intent: "${intent}"\n` +
      `Their goals: ${ctx.goals.join("; ") || "not stated"}\n` +
      `Their subjects: ${ctx.subjects.join("; ") || "not stated"}\n` +
      `Mode: ${ctx.examMode ? "exam preparation" : "normal"}\n` +
      `Already on today's plan: ${ctx.existingTitles.join("; ") || "nothing"}\n` +
      (history.accepted.length
        ? `\nTasks they ACCEPTED before (match this phrasing and granularity):\n` +
          history.accepted.map((r) => `- ${r.title} (${r.estimatedMinutes}m)`).join("\n")
        : "") +
      (history.rejected.length
        ? `\nTasks they REJECTED before (avoid this style):\n` +
          history.rejected.map((r) => `- ${r.title}`).join("\n")
        : "") +
      (averageMinutes ? `\nThey typically accept tasks around ${averageMinutes} minutes.` : "") +
      `\n\nReturn only JSON.`,
    schema: suggestionBatch,
    fallback,
    maxTokens: 1_200,
  });

  const inserted = await db
    .insert(taskSuggestions)
    .values(
      data.tasks.map((t) => ({
        userId: user.id,
        intent,
        title: t.title,
        category: t.category,
        estimatedMinutes: t.estimatedMinutes,
        rationale: t.rationale,
      })),
    )
    .returning();

  return { suggestions: inserted, aiUsed: source !== "fallback" };
}

/**
 * Apply a batch. Chosen suggestions become real tasks; the rest of that batch
 * are marked rejected — silence is the signal, and without recording it the
 * system could never learn what you don't want.
 */
export async function applySuggestions(
  user: User,
  date: string,
  batchIds: string[],
  chosenIds: string[],
): Promise<{ added: number }> {
  if (batchIds.length === 0) return { added: 0 };

  const rows = await db
    .select()
    .from(taskSuggestions)
    .where(and(eq(taskSuggestions.userId, user.id), inArray(taskSuggestions.id, batchIds)));

  const chosen = new Set(chosenIds);
  let added = 0;

  for (const row of rows) {
    if (!chosen.has(row.id)) continue;
    await addTask(user, date, {
      title: row.title,
      category: row.category,
      estimatedMinutes: row.estimatedMinutes,
      priority: 3,
      tags: [],
    });
    added += 1;
  }

  await db
    .update(taskSuggestions)
    .set({ accepted: true })
    .where(
      and(
        eq(taskSuggestions.userId, user.id),
        inArray(taskSuggestions.id, chosenIds.length ? chosenIds : ["00000000-0000-0000-0000-000000000000"]),
      ),
    );

  const notChosen = rows.filter((r) => !chosen.has(r.id)).map((r) => r.id);
  if (notChosen.length > 0) {
    await db
      .update(taskSuggestions)
      .set({ accepted: false })
      .where(and(eq(taskSuggestions.userId, user.id), inArray(taskSuggestions.id, notChosen)));
  }

  return { added };
}

/** How much history the learning actually has, for honest UI copy. */
export async function preferenceStrength(userId: string) {
  const rows = await db
    .select({ accepted: taskSuggestions.accepted })
    .from(taskSuggestions)
    .where(eq(taskSuggestions.userId, userId));

  const decided = rows.filter((r) => r.accepted !== null);
  return {
    decided: decided.length,
    accepted: decided.filter((r) => r.accepted === true).length,
  };
}
