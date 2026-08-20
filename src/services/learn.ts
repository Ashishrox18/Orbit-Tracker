import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  learningSessions,
  memorySessions,
  mindMapNodes,
  reviewQueue,
  vocabulary,
  type MemorySession,
  type ReviewItem,
  type User,
  type Vocabulary,
} from "@/db/schema";
import { NEW_ITEM, queueStats, retentionRate, schedule, selectDue, type Grade } from "@/lib/srs";
import { shiftISO } from "@/lib/time";

/* ------------------------------------------------------------ review queue */

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
    { repetitions: item.repetitions, intervalDays: item.intervalDays, easeFactor: item.easeFactor, lapses: item.lapses },
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

/** Add a word manually — no AI. */
export async function addWordManual(
  user: User,
  day: string,
  input: {
    word: string;
    meaning: string;
    partOfSpeech: string | null;
    etymology: string | null;
    examples: string[];
  },
): Promise<Vocabulary> {
  const wordLower = input.word.toLowerCase().trim();

  const inserted = await db
    .insert(vocabulary)
    .values({
      userId:       user.id,
      word:         wordLower,
      partOfSpeech: input.partOfSpeech,
      meaning:      input.meaning,
      etymology:    input.etymology,
      examples:     input.examples,
      learnedOn:    day,
    })
    .onConflictDoUpdate({
      target: [vocabulary.userId, vocabulary.word],
      set: {
        learnedOn:    day,
        meaning:      input.meaning,
        partOfSpeech: input.partOfSpeech,
        etymology:    input.etymology,
        examples:     input.examples,
      },
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Could not save the word.");

  await enqueue(user.id, "vocab", row.id, `What does "${row.word}" mean?`, row.meaning, day);

  return row;
}

/** Delete a word by ID. */
export async function deleteWord(userId: string, id: string): Promise<void> {
  await db.delete(vocabulary).where(and(eq(vocabulary.id, id), eq(vocabulary.userId, userId)));
}

/* --------------------------------------------------------- layer 2: concept */

/** Save a concept topic manually — user writes their own explanation. */
export async function saveConceptManual(
  user: User,
  day: string,
  topic: string,
): Promise<typeof learningSessions.$inferSelect> {
  const saved = await db
    .insert(learningSessions)
    .values({
      userId:        user.id,
      date:          day,
      topic:         topic.trim(),
      explanation:   "",
      connections:   [],
      generatedByAi: false,
    })
    .onConflictDoUpdate({
      target: [learningSessions.userId, learningSessions.date],
      set: { topic: topic.trim(), generatedByAi: false },
    })
    .returning();

  const session = saved[0];
  if (!session) throw new Error("Could not save the concept.");

  await enqueue(user.id, "concept", session.id, `Explain: ${topic}`, topic, day);

  return session;
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

/* ------------------------------------------------------ Weekly material (no AI) */

export async function weeklyMaterial(userId: string, weekEnding: string) {
  const weekStart = shiftISO(weekEnding, -6);

  const [words, concepts, nodes] = await Promise.all([
    db.select({ word: vocabulary.word })
      .from(vocabulary)
      .where(and(eq(vocabulary.userId, userId), gte(vocabulary.learnedOn, weekStart), lte(vocabulary.learnedOn, weekEnding))),
    db.select({ topic: learningSessions.topic })
      .from(learningSessions)
      .where(and(eq(learningSessions.userId, userId), gte(learningSessions.date, weekStart), lte(learningSessions.date, weekEnding))),
    db.select({ title: mindMapNodes.title })
      .from(mindMapNodes)
      .where(eq(mindMapNodes.userId, userId))
      .orderBy(desc(mindMapNodes.createdAt))
      .limit(10),
  ]);

  return {
    weekStart,
    words:    words.map((w) => w.word),
    concepts: concepts.map((c) => c.topic),
    nodes:    nodes.map((n) => n.title),
    resolved: [] as string[],
  };
}

/** Sunday, or the most recent one. */
export function currentWeekEnding(today: string): string {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  return day === 0 ? today : shiftISO(today, -day);
}
