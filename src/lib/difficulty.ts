/**
 * Difficulty prioritisation and the escalation ladder.
 *
 * The rule that makes this a learning loop rather than a nag list: a topic the
 * user is still stuck on is never rescheduled as the same task. Each failed
 * attempt advances `interventionStage`, which changes the *kind* of work —
 * explanation, worked example, easier problem, guided, independent.
 */

import { INTERVENTION_STAGES } from "./constants";
import { daysBetween } from "./time";

export interface DifficultyLike {
  id: string;
  topic: string;
  subject: string;
  difficulty: string;
  status: string;
  attempts: number;
  interventionStage: number;
  estimatedMinutes: number;
  createdAt: Date | string;
}

const DIFFICULTY_WEIGHT: Record<string, number> = {
  stuck: 40,
  difficult: 30,
  moderate: 18,
  easy: 8,
};

export function stageFor(index: number) {
  const clamped = Math.min(Math.max(index, 0), INTERVENTION_STAGES.length - 1);
  // Index is clamped into range, so this element always exists.
  return INTERVENTION_STAGES[clamped]!;
}

/** Advance one rung, stopping at the last so a topic can't fall off the ladder. */
export function nextStage(current: number): number {
  return Math.min(current + 1, INTERVENTION_STAGES.length - 1);
}

/**
 * Higher scores get scheduled first. Severity dominates, age breaks ties so
 * nothing rots in the backlog, and repeated attempts add urgency because
 * something the user keeps failing at is the highest-value thing to fix.
 */
export function priorityScore(d: DifficultyLike, todayISODate: string): number {
  if (d.status === "resolved") return 0;

  const created =
    typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : d.createdAt.toISOString().slice(0, 10);
  const ageDays = Math.max(0, daysBetween(created, todayISODate));

  const severity = DIFFICULTY_WEIGHT[d.difficulty] ?? 15;
  const age = Math.min(ageDays * 2, 20);
  const persistence = Math.min(d.attempts * 5, 20);
  const inProgress = d.status === "in_progress" ? 5 : 0;

  return severity + age + persistence + inProgress;
}

export function rankDifficulties<T extends DifficultyLike>(
  list: T[],
  todayISODate: string,
): T[] {
  return [...list]
    .filter((d) => d.status !== "resolved")
    .sort((a, b) => priorityScore(b, todayISODate) - priorityScore(a, todayISODate));
}

export interface RepairTask {
  title: string;
  detail: string;
  estimatedMinutes: number;
  difficultyId: string;
}

/** Turn the top difficulty into the concrete task that goes on today's plan. */
export function repairTaskFor(d: DifficultyLike): RepairTask {
  const stage = stageFor(d.interventionStage);
  return {
    title: `${stage.verb} ${d.topic}`,
    detail: `${stage.label} · ${d.subject}${d.attempts > 0 ? ` · attempt ${d.attempts + 1}` : ""}`,
    estimatedMinutes: Math.max(stage.minutes, Math.min(d.estimatedMinutes, 60)),
    difficultyId: d.id,
  };
}

export interface DifficultyStats {
  open: number;
  inProgress: number;
  resolved: number;
  averageResolutionDays: number | null;
  mostRepeatedTopic: string | null;
}

export function difficultyStats(
  list: (DifficultyLike & { resolvedAt?: Date | string | null })[],
): DifficultyStats {
  const stats: DifficultyStats = {
    open: 0,
    inProgress: 0,
    resolved: 0,
    averageResolutionDays: null,
    mostRepeatedTopic: null,
  };

  const resolutionDays: number[] = [];
  const topicCounts = new Map<string, number>();

  for (const d of list) {
    if (d.status === "open") stats.open += 1;
    else if (d.status === "in_progress") stats.inProgress += 1;
    else if (d.status === "resolved") stats.resolved += 1;

    const key = d.topic.trim().toLowerCase();
    topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);

    if (d.status === "resolved" && d.resolvedAt) {
      const from = typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : d.createdAt.toISOString().slice(0, 10);
      const to =
        typeof d.resolvedAt === "string"
          ? d.resolvedAt.slice(0, 10)
          : d.resolvedAt.toISOString().slice(0, 10);
      resolutionDays.push(Math.max(0, daysBetween(from, to)));
    }
  }

  if (resolutionDays.length > 0) {
    stats.averageResolutionDays =
      Math.round((resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length) * 10) / 10;
  }

  let best: { topic: string; count: number } | null = null;
  for (const [topic, count] of topicCounts) {
    if (count > 1 && (best === null || count > best.count)) best = { topic, count };
  }
  stats.mostRepeatedTopic = best?.topic ?? null;

  return stats;
}

/**
 * Heuristic classifier used when Groq is unavailable or rate-limited. Crude on
 * purpose — it only has to keep the capture flow working, and the user's own
 * difficulty selection carries most of the signal.
 */
const SUBJECT_HINTS: [RegExp, string][] = [
  [/integrat|derivat|calculus|algebra|matri|probabilit|geometr|trigono/i, "Mathematics"],
  [/sn1|sn2|organic|reaction|molecul|chemis|titrat/i, "Chemistry"],
  [/newton|thermodynam|circuit|physic|momentum|optics/i, "Physics"],
  [/recursion|\bdp\b|dynamic programming|algorithm|array|pointer|complexit|leetcode/i, "Programming"],
  [/cell|enzyme|genetic|biolog|photosynth/i, "Biology"],
  [/essay|grammar|literature|comprehension/i, "Language"],
];

export function classifyLocally(
  rawInput: string,
  difficulty: string,
  subjectHint?: string,
): {
  topic: string;
  subject: string;
  problemType: string;
  likelyGap: string;
  recommendedAction: string;
  estimatedMinutes: number;
} {
  const text = rawInput.trim();
  const firstClause = text.split(/[.;\n]|\s+-\s+/)[0]?.trim() ?? text;
  const topic = (firstClause.length > 4 ? firstClause : text).slice(0, 120);

  let subject = subjectHint?.trim() || "General";
  if (!subjectHint) {
    for (const [pattern, name] of SUBJECT_HINTS) {
      if (pattern.test(text)) {
        subject = name;
        break;
      }
    }
  }

  const procedural = /how do i|when to use|steps|method|procedure|solve/i.test(text);
  const recall = /forget|remember|memoris|memoriz/i.test(text);
  const problemType = recall ? "recall" : procedural ? "procedural" : "conceptual";

  const minutes = difficulty === "stuck" ? 40 : difficulty === "difficult" ? 30 : 20;

  return {
    topic,
    subject,
    problemType,
    likelyGap: "Captured without AI classification — refine this after your first attempt.",
    recommendedAction: `Start with ${stageFor(0).label.toLowerCase()}, then attempt one problem.`,
    estimatedMinutes: minutes,
  };
}
