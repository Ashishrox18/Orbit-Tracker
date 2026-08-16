import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { dailyPlans, difficulties, evidence, tasks, vocabulary } from "@/db/schema";
import { getReview } from "./reviews";

/**
 * A single past day, reconstructed in full — the drill-down Calendar and
 * Reports both need: what was planned, what actually got done, the proof
 * attached, and anything else logged that day.
 */

export interface DayDetailTask {
  id: string;
  title: string;
  category: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  estimatedMinutes: number;
  proofUrl: string | null;
}

export interface DayDetail {
  date: string;
  hasPlan: boolean;
  mainGoal: string | null;
  tasks: DayDetailTask[];
  difficultiesCaptured: { id: string; topic: string; difficulty: string; status: string }[];
  vocabLearned: { word: string; meaning: string }[];
  reflection: string | null;
}

export async function getDayDetail(userId: string, date: string): Promise<DayDetail> {
  const planRows = await db
    .select()
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.date, date)))
    .limit(1);
  const plan = planRows[0] ?? null;

  const [taskRows, evidenceRows, difficultyRows, vocabRows, review] = await Promise.all([
    plan ? db.select().from(tasks).where(eq(tasks.planId, plan.id)) : Promise.resolve([]),
    db
      .select({ taskId: evidence.taskId, url: evidence.url })
      .from(evidence)
      .where(and(eq(evidence.userId, userId), eq(evidence.date, date))),
    db
      .select({
        id: difficulties.id,
        topic: difficulties.topic,
        difficulty: difficulties.difficulty,
        status: difficulties.status,
        createdAt: difficulties.createdAt,
      })
      .from(difficulties)
      .where(eq(difficulties.userId, userId)),
    db
      .select({ word: vocabulary.word, meaning: vocabulary.meaning })
      .from(vocabulary)
      .where(and(eq(vocabulary.userId, userId), eq(vocabulary.learnedOn, date))),
    getReview(userId, date),
  ]);

  const proofByTask = new Map(
    evidenceRows.filter((e) => e.taskId !== null).map((e) => [e.taskId as string, e.url]),
  );

  const dayDifficulties = difficultyRows.filter(
    (d) => d.createdAt.toISOString().slice(0, 10) === date,
  );

  return {
    date,
    hasPlan: plan !== null,
    mainGoal: plan?.mainGoal ?? null,
    tasks: taskRows
      .slice()
      .sort((a, b) => (a.startAt ?? "99:99").localeCompare(b.startAt ?? "99:99"))
      .map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        status: t.status,
        startAt: t.startAt,
        endAt: t.endAt,
        estimatedMinutes: t.estimatedMinutes,
        proofUrl: proofByTask.get(t.id) ?? null,
      })),
    difficultiesCaptured: dayDifficulties.map((d) => ({
      id: d.id,
      topic: d.topic,
      difficulty: d.difficulty,
      status: d.status,
    })),
    vocabLearned: vocabRows,
    reflection: review?.learned ?? null,
  };
}
