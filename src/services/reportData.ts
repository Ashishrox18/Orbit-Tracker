import "server-only";

import { and, eq, gte, lt, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  dailyPlans,
  mindMapEdges,
  mindMapNodes,
  reviewQueue,
  tasks,
  vocabulary,
  type User,
} from "@/db/schema";
import {
  painPoints,
  reportSummary,
  streaks,
  type PainPoint,
  type ReportSummary,
  type StreakSet,
} from "@/lib/consistency";
import { difficultyStats } from "@/lib/difficulty";
import { type Bucket, type DateRange, bucketGrainFor, buildBuckets } from "@/lib/reportRanges";
import { queueStats, retentionRate, type QueueStats } from "@/lib/srs";
import { daysBetween, todayISO } from "@/lib/time";
import { listDifficulties } from "./difficulties";
import { evidenceDates, listEvidence } from "./evidence";
import { recentRollups } from "./history";

/**
 * The growth report — one aggregation behind every export format (on-screen,
 * Excel, PDF). Everything here traces to a specific computation over dated
 * rows, the same standard `lib/consistency.ts` already holds itself to:
 * nothing is generated, estimated or softened.
 */

export interface GrowthReport {
  range: DateRange;
  subject: string;
  generatedAt: string;
  summary: ReportSummary;
  streaks: StreakSet;
  painPoints: PainPoint[];
  buckets: (Bucket & {
    tasksPlanned: number;
    tasksCompleted: number;
    vocabAdded: number;
    vocabCumulative: number;
    evidenceCount: number;
    mindMapNodesAdded: number;
  })[];
  tasksByCategory: { category: string; planned: number; completed: number; skipped: number }[];
  tasksByTag: { tag: string; planned: number; completed: number }[];
  difficulties: {
    open: number;
    inProgress: number;
    resolved: number;
    avgDaysToResolve: number | null;
    byTopic: { topic: string; attempts: number; status: string; subject: string }[];
    byTag: { tag: string; count: number; resolved: number }[];
  };
  vocabulary: {
    totalAllTime: number;
    addedInRange: number;
    words: { word: string; learnedOn: string }[];
  };
  mindMap: { nodesAdded: number; edgesAdded: number; orphanCount: number };
  evidence: {
    total: number;
    verifiable: number;
    byCategory: Record<string, number>;
    items: {
      date: string;
      title: string;
      url: string | null;
      kind: string;
      category: string;
      note: string | null;
      metricValue: number | null;
      metricUnit: string | null;
    }[];
  };
  srs: { queue: QueueStats; retention: number | null };
  dailyDetail: {
    date: string;
    tasks: { title: string; category: string; status: string; proofUrl: string | null }[];
    vocab: string[];
  }[];
}

const dateOf = (d: Date) => d.toISOString().slice(0, 10);
const dayStart = (iso: string) => new Date(`${iso}T00:00:00Z`);

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function buildGrowthReport(user: User, range: DateRange): Promise<GrowthReport> {
  const { from, to } = range;
  const today = todayISO();

  // Anchor rollups on the *real* today, not `to` — a historical range would
  // otherwise never pull in the rows `streaks()` needs to see "today".
  const rollups = await recentRollups(user.id, today, Math.max(0, daysBetween(from, today)));
  const inRangeRollups = rollups.filter((r) => r.date >= from && r.date <= to);

  const [evidence, evDates, allDifficulties, allVocab, allNodes, allEdges, reviewItems, taskRows, dayTaskRows] =
    await Promise.all([
      listEvidence(user.id, from, to),
      evidenceDates(user.id),
      listDifficulties(user.id),
      db
        .select({ word: vocabulary.word, learnedOn: vocabulary.learnedOn })
        .from(vocabulary)
        .where(eq(vocabulary.userId, user.id)),
      db
        .select({ id: mindMapNodes.id, createdAt: mindMapNodes.createdAt })
        .from(mindMapNodes)
        .where(eq(mindMapNodes.userId, user.id)),
      db
        .select({
          fromId: mindMapEdges.fromId,
          toId: mindMapEdges.toId,
          suggested: mindMapEdges.suggested,
          createdAt: mindMapEdges.createdAt,
        })
        .from(mindMapEdges)
        .where(eq(mindMapEdges.userId, user.id)),
      db
        .select({
          id: reviewQueue.id,
          kind: reviewQueue.kind,
          due: reviewQueue.due,
          lapses: reviewQueue.lapses,
          repetitions: reviewQueue.repetitions,
          intervalDays: reviewQueue.intervalDays,
        })
        .from(reviewQueue)
        .where(eq(reviewQueue.userId, user.id)),
      db
        .select({ category: tasks.category, status: tasks.status, tags: tasks.tags })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, user.id),
            gte(tasks.createdAt, dayStart(from)),
            lt(tasks.createdAt, dayStart(nextDay(to))),
          ),
        ),
      // Joined on the plan's own date, not createdAt — the correct source of
      // "which day" a task belongs to, for the day-by-day detail below.
      db
        .select({
          date: dailyPlans.date,
          id: tasks.id,
          title: tasks.title,
          category: tasks.category,
          status: tasks.status,
        })
        .from(tasks)
        .innerJoin(dailyPlans, eq(tasks.planId, dailyPlans.id))
        .where(and(eq(tasks.userId, user.id), gte(dailyPlans.date, from), lte(dailyPlans.date, to))),
    ]);

  const summary = reportSummary(inRangeRollups, evidence, from, to);
  const problems = painPoints({
    rollups: inRangeRollups,
    recurringDifficulties: allDifficulties
      .filter((d) => d.status !== "resolved" && d.attempts >= 2)
      .map((d) => ({ topic: d.topic, attempts: d.attempts })),
    taskOutcomes: taskRows,
    evidenceDates: evDates,
    today,
  });

  // ---- difficulties: activity within the window (opened or resolved there) ----
  const inRangeDifficulties = allDifficulties.filter((d) => {
    const created = dateOf(d.createdAt);
    const resolved = d.resolvedAt ? dateOf(d.resolvedAt) : null;
    return (created >= from && created <= to) || (resolved !== null && resolved >= from && resolved <= to);
  });
  const diffStats = difficultyStats(inRangeDifficulties);

  // ---- vocabulary ----
  const inRangeVocab = allVocab.filter((v) => v.learnedOn >= from && v.learnedOn <= to);

  // ---- mind map: confirmed (non-suggested) links only count as "knowledge" ----
  const linkedNodeIds = new Set<string>();
  for (const e of allEdges) {
    if (e.suggested) continue;
    linkedNodeIds.add(e.fromId);
    linkedNodeIds.add(e.toId);
  }
  const orphanCount = allNodes.filter((n) => !linkedNodeIds.has(n.id)).length;
  const nodesInRange = allNodes.filter((n) => {
    const d = dateOf(n.createdAt);
    return d >= from && d <= to;
  });
  const edgesInRange = allEdges.filter((e) => {
    const d = dateOf(e.createdAt);
    return d >= from && d <= to;
  });

  // ---- buckets: per-period rollup for the growth curve ----
  const grain = bucketGrainFor(from, to);
  const rawBuckets = buildBuckets(from, to, grain);
  const rollupByDate = new Map(rollups.map((r) => [r.date, r]));

  const buckets = rawBuckets.map((bucket) => {
    let tasksPlanned = 0;
    let tasksCompleted = 0;
    for (let d = bucket.start; ; d = nextDay(d)) {
      const r = rollupByDate.get(d);
      if (r) {
        tasksPlanned += r.plannedCount;
        tasksCompleted += r.completedCount;
      }
      if (d === bucket.end) break;
    }
    const vocabAdded = allVocab.filter((v) => v.learnedOn >= bucket.start && v.learnedOn <= bucket.end).length;
    const vocabCumulative = allVocab.filter((v) => v.learnedOn <= bucket.end).length;
    const evidenceCount = evidence.filter((e) => e.date >= bucket.start && e.date <= bucket.end).length;
    const mindMapNodesAdded = allNodes.filter((n) => {
      const d = dateOf(n.createdAt);
      return d >= bucket.start && d <= bucket.end;
    }).length;

    return { ...bucket, tasksPlanned, tasksCompleted, vocabAdded, vocabCumulative, evidenceCount, mindMapNodesAdded };
  });

  // ---- tasks by category (within range) ----
  const byCategory = new Map<string, { planned: number; completed: number; skipped: number }>();
  for (const t of taskRows) {
    const entry = byCategory.get(t.category) ?? { planned: 0, completed: 0, skipped: 0 };
    entry.planned += 1;
    if (t.status === "completed") entry.completed += 1;
    if (t.status === "skipped") entry.skipped += 1;
    byCategory.set(t.category, entry);
  }

  // ---- tasks by tag (within range) — an item counts once per tag it carries ----
  const byTag = new Map<string, { planned: number; completed: number }>();
  for (const t of taskRows) {
    for (const tag of t.tags) {
      const entry = byTag.get(tag) ?? { planned: 0, completed: 0 };
      entry.planned += 1;
      if (t.status === "completed") entry.completed += 1;
      byTag.set(tag, entry);
    }
  }

  // ---- difficulties by tag (within range) ----
  const byDiffTag = new Map<string, { count: number; resolved: number }>();
  for (const d of inRangeDifficulties) {
    for (const tag of d.tags) {
      const entry = byDiffTag.get(tag) ?? { count: 0, resolved: 0 };
      entry.count += 1;
      if (d.status === "resolved") entry.resolved += 1;
      byDiffTag.set(tag, entry);
    }
  }

  // ---- evidence by category ----
  const evidenceByCategory: Record<string, number> = {};
  for (const e of evidence) evidenceByCategory[e.category] = (evidenceByCategory[e.category] ?? 0) + 1;

  // ---- day by day: tasks, proof links and vocab, for the in-depth breakdown ----
  const proofByTask = new Map(
    evidence.filter((e) => e.taskId !== null).map((e) => [e.taskId as string, e.url]),
  );
  const dailyMap = new Map<
    string,
    { tasks: { title: string; category: string; status: string; proofUrl: string | null }[]; vocab: string[] }
  >();
  for (const t of dayTaskRows) {
    const entry = dailyMap.get(t.date) ?? { tasks: [], vocab: [] };
    entry.tasks.push({
      title: t.title,
      category: t.category,
      status: t.status,
      proofUrl: proofByTask.get(t.id) ?? null,
    });
    dailyMap.set(t.date, entry);
  }
  for (const v of inRangeVocab) {
    const entry = dailyMap.get(v.learnedOn) ?? { tasks: [], vocab: [] };
    entry.vocab.push(v.word);
    dailyMap.set(v.learnedOn, entry);
  }
  const dailyDetail = [...dailyMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, v]) => ({ date, ...v }));

  return {
    range,
    subject: user.name,
    generatedAt: new Date().toISOString(),
    summary,
    streaks: streaks(rollups, evDates, today),
    painPoints: problems,
    buckets,
    tasksByCategory: [...byCategory.entries()].map(([category, v]) => ({ category, ...v })),
    tasksByTag: [...byTag.entries()].map(([tag, v]) => ({ tag, ...v })),
    difficulties: {
      open: diffStats.open,
      inProgress: diffStats.inProgress,
      resolved: diffStats.resolved,
      avgDaysToResolve: diffStats.averageResolutionDays,
      byTopic: inRangeDifficulties.map((d) => ({
        topic: d.topic,
        attempts: d.attempts,
        status: d.status,
        subject: d.subject,
      })),
      byTag: [...byDiffTag.entries()].map(([tag, v]) => ({ tag, ...v })),
    },
    vocabulary: {
      totalAllTime: allVocab.length,
      addedInRange: inRangeVocab.length,
      words: inRangeVocab.map((v) => ({ word: v.word, learnedOn: v.learnedOn })),
    },
    mindMap: {
      nodesAdded: nodesInRange.length,
      edgesAdded: edgesInRange.length,
      orphanCount,
    },
    evidence: {
      total: evidence.length,
      verifiable: evidence.filter((e) => e.kind === "link" || e.kind === "file").length,
      byCategory: evidenceByCategory,
      items: evidence.map((e) => ({
        date: e.date,
        title: e.title,
        url: e.url,
        kind: e.kind,
        category: e.category,
        note: e.note,
        metricValue: e.metricValue,
        metricUnit: e.metricUnit,
      })),
    },
    srs: {
      queue: queueStats(reviewItems, today),
      retention: retentionRate(reviewItems),
    },
    dailyDetail,
  };
}
