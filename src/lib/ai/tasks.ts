import "server-only";

import {
  difficultyClassification,
  eveningInsight,
  learningTopic,
  type DifficultyClassification,
  type EveningInsight,
  type LearningTopic,
} from "../contracts";
import { classifyLocally } from "../difficulty";
import { cached } from "./cache";
import { requestStructured, requestText } from "./client";
import { BASE_RULES, renderContext, type AssistantContext } from "./context";

/**
 * The places this product spends an AI call. Dates, scheduling, streaks,
 * percentages, and prioritisation — including building the day's plan — are
 * deterministic TypeScript with no AI involved at all, so the free tier is
 * spent only on genuine reasoning elsewhere.
 *
 * Every function here returns a usable value even with no API key.
 */

/* ----------------------------------------------------- 1. difficulty capture */

export async function classifyDifficulty(
  userId: string,
  day: string,
  rawInput: string,
  difficulty: string,
  subjectHint?: string,
): Promise<{ data: DifficultyClassification; source: "ai" | "fallback" | "cache" }> {
  const local = classifyLocally(rawInput, difficulty, subjectHint);
  const fallback: DifficultyClassification = {
    topic: local.topic,
    subject: local.subject,
    difficulty: difficulty as DifficultyClassification["difficulty"],
    problemType: local.problemType as DifficultyClassification["problemType"],
    likelyGap: local.likelyGap,
    recommendedAction: local.recommendedAction,
    estimatedMinutes: local.estimatedMinutes,
  };

  return cached(
    userId,
    "difficulty",
    day,
    { rawInput, difficulty, subjectHint },
    difficultyClassification,
    () =>
      requestStructured({
        system: `${BASE_RULES} Classify a study difficulty into structured JSON. Keys: topic, subject, difficulty (easy|moderate|difficult|stuck), problemType (conceptual|procedural|application|recall|unknown), likelyGap, recommendedAction, estimatedMinutes (integer 5-180). Keep the user's own difficulty rating unless it is clearly wrong.`,
        user: `The learner wrote: "${rawInput}"\nThey rated it: ${difficulty}${
          subjectHint ? `\nSubject hint: ${subjectHint}` : ""
        }\n\nReturn only JSON.`,
        schema: difficultyClassification,
        fallback,
        maxTokens: 400,
      }),
  );
}

/* ------------------------------------------------ 2. morning learning topic */

export async function generateLearningTopic(
  userId: string,
  day: string,
  subjects: string[],
  requestedTopic: string | null,
  mode: "normal" | "exam",
): Promise<{ data: LearningTopic; source: "ai" | "fallback" | "cache" }> {
  const seed = requestedTopic?.trim() || subjects[0] || "Compound interest";

  const fallback: LearningTopic = {
    topic: seed,
    explanation:
      `A short concept to sit with today: ${seed}. Write down, in two sentences, what you already ` +
      `believe about it and where that belief came from. Naming the source of an assumption is ` +
      `often what exposes the gap.`,
    connections: [
      { domain: "Your subject", insight: `Where does ${seed} already appear in what you study?` },
      { domain: "Daily life", insight: `Name one decision this week that ${seed} would have improved.` },
    ],
    applicationPrompt: `Where could you use ${seed} before the end of today?`,
  };

  return cached(
    userId,
    "learning",
    day,
    { seed, mode },
    learningTopic,
    () =>
      requestStructured({
        system: `${BASE_RULES} Produce a 3-7 minute morning learning card as JSON. Keys: topic, explanation (120-200 words, concrete, no filler), connections (2-5 items, each {domain, insight}, each from a DIFFERENT field such as mathematics, history, psychology, economics, biology, ethics), applicationPrompt (one question asking where they could apply it today).`,
        user:
          `Learner subjects: ${subjects.join(", ") || "general"}\n` +
          `Mode: ${mode}\n` +
          `Topic to teach: ${seed}\n\n` +
          `The value is the cross-domain connections — make them genuinely different fields, not restatements. Return only JSON.`,
        schema: learningTopic,
        fallback,
        maxTokens: 900,
      }),
  );
}

/* ------------------------------------------------------ 3. evening insight */

export async function generateEveningInsight(
  userId: string,
  day: string,
  ctx: AssistantContext,
  stats: { planned: number; completed: number; skipped: number },
): Promise<{ data: EveningInsight; source: "ai" | "fallback" | "cache" }> {
  const rate = stats.planned > 0 ? Math.round((stats.completed / stats.planned) * 100) : 0;

  const fallback: EveningInsight = {
    headline: `${stats.completed} of ${stats.planned} planned tasks completed (${rate}%).`,
    observations: ctx.insights.filter((i) => i.reliable).slice(0, 3).map((i) => i.text).length
      ? ctx.insights.filter((i) => i.reliable).slice(0, 3).map((i) => i.text)
      : ["Not enough history yet to draw a pattern from today."],
    tomorrowAdjustment:
      stats.skipped > 0
        ? "Tomorrow's plan is sized down slightly to match what you actually finish."
        : "Tomorrow keeps the same shape.",
  };

  return cached(
    userId,
    "evening",
    day,
    stats,
    eveningInsight,
    () =>
      requestStructured({
        system: `${BASE_RULES} Write an end-of-day reflection as JSON. Keys: headline (one factual sentence about today), observations (1-4 short strings), tomorrowAdjustment (one sentence). Use ONLY numbers present in the context. Do not praise or scold.`,
        user: `${renderContext(ctx)}\n\nToday: ${stats.completed}/${stats.planned} completed, ${stats.skipped} skipped.\n\nReturn only JSON.`,
        schema: eveningInsight,
        fallback,
        maxTokens: 500,
      }),
  );
}

/* -------------------------------------------- 4. behaviour-grounded nudge */

/**
 * Deliberately not cached per day: it is cheap, occasional, and reads better
 * when it reflects the moment. Falls back to the strongest measured insight,
 * which is what makes it a fact rather than a slogan.
 */
export async function motivationalReflection(ctx: AssistantContext): Promise<string> {
  const grounded = ctx.insights.find((i) => i.reliable);
  const fallback = grounded?.text ?? "Still learning your pattern — keep logging.";
  if (!grounded) return fallback;

  const result = await requestText(
    `${BASE_RULES} Restate one measured fact about the user's behaviour as a single encouraging sentence. Do not add any number that is not in the input. No exclamation marks.`,
    grounded.text,
    fallback,
    120,
  );
  return result.data;
}
