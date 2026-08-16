import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { learningSessions, type LearningSession, type User } from "@/db/schema";
import { generateLearningTopic } from "@/lib/ai/tasks";
import type { LearningResponseInput } from "@/lib/contracts";
import { shiftISO } from "@/lib/time";

export async function getLearningSession(
  userId: string,
  date: string,
): Promise<LearningSession | null> {
  const rows = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.userId, userId), eq(learningSessions.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * One learning card per day, created on demand and then reused. The unique
 * index on (user, date) is what stops a refresh from generating a second card
 * and spending another Groq request.
 */
export async function ensureLearningSession(
  user: User,
  date: string,
  requestedTopic: string | null,
): Promise<{ session: LearningSession; aiUsed: boolean }> {
  const existing = await getLearningSession(user.id, date);
  if (existing && !requestedTopic) {
    return { session: existing, aiUsed: existing.generatedByAi };
  }

  const mode = user.examMode ? "exam" : "normal";
  const subjects = user.examMode && user.examSubjects.length ? user.examSubjects : user.subjects;
  const { data, source } = await generateLearningTopic(
    user.id,
    date,
    subjects,
    requestedTopic,
    mode,
  );

  const values = {
    userId: user.id,
    date,
    topic: data.topic,
    explanation: data.explanation,
    connections: data.connections,
    applicationPrompt: data.applicationPrompt,
    generatedByAi: source !== "fallback",
  };

  const saved = await db
    .insert(learningSessions)
    .values(values)
    .onConflictDoUpdate({
      target: [learningSessions.userId, learningSessions.date],
      set: {
        topic: values.topic,
        explanation: values.explanation,
        connections: values.connections,
        applicationPrompt: values.applicationPrompt,
        generatedByAi: values.generatedByAi,
      },
    })
    .returning();

  const session = saved[0];
  if (!session) throw new Error("Could not create the learning session.");
  return { session, aiUsed: source !== "fallback" };
}

export async function recordLearningResponse(
  user: User,
  input: LearningResponseInput,
): Promise<LearningSession | null> {
  const updated = await db
    .update(learningSessions)
    .set({ userResponse: input.userResponse, confidence: input.confidence })
    .where(
      and(eq(learningSessions.userId, user.id), eq(learningSessions.date, input.date)),
    )
    .returning();
  return updated[0] ?? null;
}

/** Consecutive days, ending today or yesterday, with a card the user answered. */
export async function learningStreak(userId: string, today: string): Promise<number> {
  const rows = await db
    .select({ date: learningSessions.date })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.userId, userId),
        sql`${learningSessions.userResponse} is not null`,
      ),
    )
    .orderBy(desc(learningSessions.date))
    .limit(60);

  const answered = new Set(rows.map((r) => r.date));
  if (answered.size === 0) return 0;

  // Allow the streak to start yesterday so it doesn't read as broken before
  // today's card has been answered.
  let cursor = answered.has(today) ? today : shiftISO(today, -1);
  let streak = 0;
  while (answered.has(cursor)) {
    streak += 1;
    cursor = shiftISO(cursor, -1);
  }
  return streak;
}
