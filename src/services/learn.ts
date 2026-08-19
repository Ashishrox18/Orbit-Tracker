import "server-only";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  difficulties,
  learningSessions,
  memorySessions,
  mindMapNodes,
  reviewQueue,
  vocabulary,
  weeklyReviews,
  type MemorySession,
  type ReviewItem,
  type User,
  type Vocabulary,
} from "@/db/schema";
import {
  consolidateWeek,
  generateRichConcept,
  generateVocabulary,
  judgeFeynman,
  judgeSentence,
} from "@/lib/ai/learn";
import { NEW_ITEM, queueStats, retentionRate, schedule, selectDue, type Grade } from "@/lib/srs";
import { shiftISO } from "@/lib/time";

/* ------------------------------------------------------------ review queue */

/** Enrol material in the shared queue. Idempotent — re-adding is a no-op. */
export async function enqueue(
  userId: string,
  kind: string,
  sourceId: string,
  prompt: string,
  answer: string,
  today: string,
): Promise<void> {
  await db
    .insert(reviewQueue)
    .values({ userId, kind, sourceId, prompt, answer, due: today, ...NEW_ITEM })
    .onConflictDoNothing({ target: [reviewQueue.userId, reviewQueue.kind, reviewQueue.sourceId] });
}

export async function dueReviews(userId: string, today: string, limit = 20) {
  const rows = await db
    .select()
    .from(reviewQueue)
    .where(and(eq(reviewQueue.userId, userId), lte(reviewQueue.due, today)));
  return selectDue(rows, today, limit);
}

export async function reviewSummary(userId: string, today: string) {
  const rows = await db.select().from(reviewQueue).where(eq(reviewQueue.userId, userId));
  return {
    stats: queueStats(rows, today),
    retention: retentionRate(rows),
  };
}

export async function gradeReview(
  userId: string,
  id: string,
  grade: Grade,
  today: string,
): Promise<ReviewItem | null> {
  const rows = await db
    .select()
    .from(reviewQueue)
    .where(and(eq(reviewQueue.id, id), eq(reviewQueue.userId, userId)))
    .limit(1);

  const item = rows[0];
  if (!item) return null;

  const next = schedule(
    {
      repetitions: item.repetitions,
      intervalDays: item.intervalDays,
      easeFactor: item.easeFactor,
      lapses: item.lapses,
    },
    grade,
    today,
  );

  const updated = await db
    .update(reviewQueue)
    .set({ ...next, lastReviewedAt: new Date() })
    .where(eq(reviewQueue.id, id))
    .returning();

  return updated[0] ?? null;
}

/* ------------------------------------------------------ layer 1: vocabulary */

export async function todaysWords(userId: string, day: string): Promise<Vocabulary[]> {
  return db
    .select()
    .from(vocabulary)
    .where(and(eq(vocabulary.userId, userId), eq(vocabulary.learnedOn, day)))
    .orderBy(vocabulary.createdAt);
}

export async function ensureVocabulary(
  user: User,
  day: string,
  count: number,
): Promise<{ words: Vocabulary[]; aiUsed: boolean }> {
  const existing = await todaysWords(user.id, day);
  if (existing.length > 0) return { words: existing, aiUsed: true };

  // Never repeat a word the user has already been given.
  const knownRows = await db
    .select({ word: vocabulary.word })
    .from(vocabulary)
    .where(eq(vocabulary.userId, user.id));
  const known = knownRows.map((r) => r.word);

  const { data, source } = await generateVocabulary(
    user.id,
    day,
    count,
    user.subjects,
    known,
  );

  // If AI returned only fallback words that are all already known,
  // still show them for today — they're better than nothing.
  const fresh = data.words.filter((w) => !known.includes(w.word.toLowerCase()));
  const toInsert = fresh.length >= 3 ? fresh : data.words.slice(0, count);
  if (toInsert.length === 0) return { words: [], aiUsed: source !== "fallback" };

  const inserted = await db
    .insert(vocabulary)
    .values(
      toInsert.map((w) => ({
        userId: user.id,
        word: w.word.toLowerCase(),
        partOfSpeech: w.partOfSpeech,
        meaning: w.meaning,
        etymology: w.etymology,
        examples: w.examples,
        learnedOn: day,
      })),
    )
    // If word already exists for this user, update learnedOn to today so it
    // surfaces on the Learn page — the user is reviewing it again.
    .onConflictDoUpdate({
      target: [vocabulary.userId, vocabulary.word],
      set: { learnedOn: day },
    })
    .returning();

  for (const row of inserted) {
    await enqueue(user.id, "vocab", row.id, `What does "${row.word}" mean?`, row.meaning, day);
  }

  return { words: inserted, aiUsed: source !== "fallback" };
}

export async function submitSentence(
  user: User,
  id: string,
  sentence: string,
): Promise<{ word: Vocabulary; aiUsed: boolean } | null> {
  const rows = await db
    .select()
    .from(vocabulary)
    .where(and(eq(vocabulary.id, id), eq(vocabulary.userId, user.id)))
    .limit(1);

  const word = rows[0];
  if (!word) return null;

  const { data, source } = await judgeSentence(word.word, word.meaning, sentence);

  const updated = await db
    .update(vocabulary)
    .set({
      userSentence: sentence,
      sentenceVerdict: data.verdict,
      sentenceFeedback: data.improved ? `${data.feedback}\n\nBetter: ${data.improved}` : data.feedback,
    })
    .where(eq(vocabulary.id, id))
    .returning();

  const row = updated[0];
  return row ? { word: row, aiUsed: source !== "fallback" } : null;
}

/* --------------------------------------------------------- layer 2: concept */

export async function ensureRichConcept(
  user: User,
  day: string,
  requested: string | null,
  force = false,
): Promise<{ session: typeof learningSessions.$inferSelect; aiUsed: boolean }> {
  const existing = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.userId, user.id), eq(learningSessions.date, day)))
    .limit(1);

  // Return cached only when no explicit topic was requested AND not forced
  if (existing[0] && !requested && !force) {
    return { session: existing[0], aiUsed: existing[0].generatedByAi };
  }

  const subjects = user.examMode && user.examSubjects.length ? user.examSubjects : user.subjects;
  const seed = requested?.trim() || subjects[0] || "Compound interest";

  const { data, source } = await generateRichConcept(
    user.id,
    day,
    seed,
    subjects,
    user.examMode ? "exam" : "normal",
  );

  // The rich card is stored in the existing table: `explanation` carries the
  // full body, with the example and facts appended as readable sections.
  const body = [
    data.summary,
    "",
    data.explanation,
    "",
    "WORKED EXAMPLE",
    data.workedExample.setup,
    data.workedExample.walkthrough,
    `Result: ${data.workedExample.result}`,
    "",
    "FACTS",
    ...data.facts.map((f) => `• ${f.claim}${f.figure ? ` (${f.figure})` : ""}${f.source ? ` — ${f.source}` : ""}`),
  ].join("\n");

  const saved = await db
    .insert(learningSessions)
    .values({
      userId: user.id,
      date: day,
      topic: data.topic,
      explanation: body,
      connections: data.connections,
      applicationPrompt: data.applicationPrompt,
      generatedByAi: source !== "fallback",
    })
    .onConflictDoUpdate({
      target: [learningSessions.userId, learningSessions.date],
      set: {
        topic: data.topic,
        explanation: body,
        connections: data.connections,
        applicationPrompt: data.applicationPrompt,
        generatedByAi: source !== "fallback",
      },
    })
    .returning();

  const session = saved[0];
  if (!session) throw new Error("Could not create the concept card.");

  await enqueue(
    user.id,
    "concept",
    session.id,
    `Explain ${session.topic} in two sentences.`,
    data.summary,
    day,
  );

  return { session, aiUsed: source !== "fallback" };
}

export async function runFeynman(user: User, day: string, explanation: string) {
  const rows = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.userId, user.id), eq(learningSessions.date, day)))
    .limit(1);

  const topic = rows[0]?.topic ?? "today's concept";
  const { data, source } = await judgeFeynman(topic, explanation);
  return { topic, judgement: data, aiUsed: source !== "fallback" };
}

/* ---------------------------------------------------------- layer 4: memory */

export async function recordDrill(
  user: User,
  day: string,
  input: { drill: string; level: number; score: number; maxScore: number; durationSeconds: number },
): Promise<MemorySession> {
  const inserted = await db
    .insert(memorySessions)
    .values({ userId: user.id, playedOn: day, ...input })
    .returning();

  const session = inserted[0];
  if (!session) throw new Error("Could not record the session.");
  return session;
}

/* ------------------------------------------------------ Sunday consolidation */

export async function weeklyMaterial(userId: string, weekEnding: string) {
  const weekStart = shiftISO(weekEnding, -6);

  const [words, concepts, nodes, resolved] = await Promise.all([
    db
      .select({ word: vocabulary.word })
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.userId, userId),
          gte(vocabulary.learnedOn, weekStart),
          lte(vocabulary.learnedOn, weekEnding),
        ),
      ),
    db
      .select({ topic: learningSessions.topic })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          gte(learningSessions.date, weekStart),
          lte(learningSessions.date, weekEnding),
        ),
      ),
    db
      .select({ title: mindMapNodes.title })
      .from(mindMapNodes)
      .where(eq(mindMapNodes.userId, userId))
      .orderBy(desc(mindMapNodes.createdAt))
      .limit(10),
    db
      .select({ topic: difficulties.topic })
      .from(difficulties)
      .where(and(eq(difficulties.userId, userId), eq(difficulties.status, "resolved")))
      .limit(10),
  ]);

  return {
    weekStart,
    words: words.map((w) => w.word),
    concepts: concepts.map((c) => c.topic),
    nodes: nodes.map((n) => n.title),
    resolved: resolved.map((r) => r.topic),
  };
}

export async function ensureWeeklyReview(user: User, weekEnding: string) {
  const existing = await db
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, user.id), eq(weeklyReviews.weekEnding, weekEnding)))
    .limit(1);

  if (existing[0]) return { review: existing[0], aiUsed: true };

  const material = await weeklyMaterial(user.id, weekEnding);
  const { data, source } = await consolidateWeek(user.id, weekEnding, material);

  const saved = await db
    .insert(weeklyReviews)
    .values({
      userId: user.id,
      weekEnding,
      wordCount: material.words.length,
      conceptCount: material.concepts.length,
      nodeCount: material.nodes.length,
      resolvedCount: material.resolved.length,
      questions: data.questions,
      synthesis: data.synthesis,
    })
    .onConflictDoUpdate({
      target: [weeklyReviews.userId, weeklyReviews.weekEnding],
      set: { questions: data.questions, synthesis: data.synthesis },
    })
    .returning();

  const review = saved[0];
  if (!review) throw new Error("Could not build the weekly review.");
  return { review, aiUsed: source !== "fallback" };
}

export async function completeWeeklyReview(user: User, weekEnding: string, score: number) {
  const updated = await db
    .update(weeklyReviews)
    .set({ score, completedAt: new Date() })
    .where(and(eq(weeklyReviews.userId, user.id), eq(weeklyReviews.weekEnding, weekEnding)))
    .returning();
  return updated[0] ?? null;
}

/** Sunday, or the most recent one. Consolidation is anchored to week end. */
export function currentWeekEnding(today: string): string {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  return day === 0 ? today : shiftISO(today, -day);
}

export async function unseenVocabWords(userId: string, words: string[]): Promise<string[]> {
  if (words.length === 0) return [];
  const rows = await db
    .select({ word: vocabulary.word })
    .from(vocabulary)
    .where(and(eq(vocabulary.userId, userId), inArray(vocabulary.word, words)));
  const seen = new Set(rows.map((r) => r.word));
  return words.filter((w) => !seen.has(w));
}
