/**
 * The day planner. Turns preferences, habits, open difficulties and this
 * morning's answers into a concrete task list containing exactly three
 * headline wins — physical, mental, emotional.
 *
 * Deterministic end to end — no AI involved anywhere in building or
 * scheduling the plan.
 */

import type { StartDayInput } from "./contracts";
import { rankDifficulties, repairTaskFor, type DifficultyLike } from "./difficulty";
import type { TaskCategory, TaskSource, WinType } from "./constants";
import { practiceTitleFor, themeForMode } from "./variation";

export interface PlannedTask {
  title: string;
  detail: string | null;
  category: TaskCategory;
  winType: WinType | null;
  isMandatory: boolean;
  priority: number;
  estimatedMinutes: number;
  source: TaskSource;
  difficultyId: string | null;
}

export interface HabitLike {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
}

export interface PlanContext {
  input: StartDayInput;
  exerciseMinutes: number;
  learningMinutes: number;
  subjects: string[];
  examSubjects: string[];
  socialFrequencyDays: number;
  habits: HabitLike[];
  difficulties: DifficultyLike[];
  /** Days since an emotional win was last completed; null if never. */
  daysSinceEmotionalWin: number | null;
}

export interface PlanResult {
  tasks: PlannedTask[];
  theme: string;
  rationale: Record<WinType, string>;
}

function pickSubject(ctx: PlanContext, mode: string): string {
  const pool = mode === "exam" && ctx.examSubjects.length > 0 ? ctx.examSubjects : ctx.subjects;
  return pool[0] ?? "your main subject";
}

/**
 * Physical win: an existing physical habit is reused rather than duplicated,
 * so the user never sees "30 min walk" twice on one plan.
 */
function physicalWin(ctx: PlanContext): PlannedTask {
  const habit = ctx.habits.find((h) => h.category === "physical");
  if (habit) {
    return {
      title: habit.title,
      detail: "Mandatory habit, doubling as today's physical win",
      category: "physical",
      winType: "physical",
      isMandatory: true,
      priority: 1,
      estimatedMinutes: habit.durationMinutes,
      source: "habit",
      difficultyId: null,
    };
  }

  const minutes = Math.max(10, ctx.exerciseMinutes);
  const lowEnergy = ctx.input.energyLevel <= 2;
  return {
    title: lowEnergy ? `${Math.round(minutes / 2)} min walk` : `${minutes} min movement`,
    detail: lowEnergy ? "Shortened because you logged low energy" : null,
    category: "physical",
    winType: "physical",
    isMandatory: false,
    priority: 2,
    estimatedMinutes: lowEnergy ? Math.round(minutes / 2) : minutes,
    source: "generated",
    difficultyId: null,
  };
}

/**
 * Mental win: an unresolved difficulty always outranks generic practice —
 * that is the difficulty-to-plan pipeline, and it is the whole point.
 */
function mentalWin(ctx: PlanContext, today: string, theme: string): PlannedTask {
  const mode = ctx.input.examMode ? "exam" : "normal";
  const ranked = rankDifficulties(ctx.difficulties, today);
  const top = ranked[0];

  if (top) {
    const repair = repairTaskFor(top);
    return {
      title: repair.title,
      detail: repair.detail,
      category: "mental",
      winType: "mental",
      isMandatory: false,
      priority: 1,
      estimatedMinutes: repair.estimatedMinutes,
      source: "difficulty",
      difficultyId: repair.difficultyId,
    };
  }

  const subject = pickSubject(ctx, mode);
  return {
    title: practiceTitleFor(theme, subject),
    detail: `${theme} · nothing is currently marked difficult`,
    category: "mental",
    winType: "mental",
    isMandatory: false,
    priority: 2,
    estimatedMinutes: Math.max(20, ctx.learningMinutes),
    source: "generated",
    difficultyId: null,
  };
}

/**
 * Emotional win: reaching out is preferred once the user's stated social
 * cadence has lapsed; otherwise a lighter reflection keeps the slot honest
 * without manufacturing an obligation.
 */
function emotionalWin(ctx: PlanContext): PlannedTask {
  const due =
    ctx.daysSinceEmotionalWin === null ||
    ctx.daysSinceEmotionalWin >= ctx.socialFrequencyDays;

  if (due) {
    const since =
      ctx.daysSinceEmotionalWin === null
        ? "no connection logged yet"
        : `${ctx.daysSinceEmotionalWin} days since the last one`;
    return {
      title: "Call or message someone who matters",
      detail: since,
      category: "emotional",
      winType: "emotional",
      isMandatory: false,
      priority: 2,
      estimatedMinutes: 20,
      source: "generated",
      difficultyId: null,
    };
  }

  return {
    title: "Ten minutes of reflection",
    detail: "You connected recently — this one is for you",
    category: "emotional",
    winType: "emotional",
    isMandatory: false,
    priority: 3,
    estimatedMinutes: 10,
    source: "generated",
    difficultyId: null,
  };
}

export function buildDayPlan(ctx: PlanContext): PlanResult {
  const { input } = ctx;
  const mode = input.examMode ? "exam" : "normal";
  const theme = themeForMode(input.date, mode);

  const physical = physicalWin(ctx);
  const mental = mentalWin(ctx, input.date, theme);
  const emotional = emotionalWin(ctx);

  const tasks: PlannedTask[] = [physical, mental, emotional];

  // Mandatory habits that weren't already absorbed by the physical win.
  for (const habit of ctx.habits) {
    if (physical.source === "habit" && habit.category === "physical") continue;
    tasks.push({
      title: habit.title,
      detail: "Mandatory habit",
      category: (habit.category as TaskCategory) ?? "habit",
      winType: null,
      isMandatory: true,
      priority: 1,
      estimatedMinutes: habit.durationMinutes,
      source: "habit",
      difficultyId: null,
    });
  }

  for (const item of input.actionItems) {
    tasks.push({
      title: item,
      detail: null,
      category: "other",
      winType: null,
      isMandatory: false,
      priority: 3,
      estimatedMinutes: 30,
      source: "user",
      difficultyId: null,
    });
  }

  // A second difficulty gets a shorter slot when the day has room for it.
  const ranked = rankDifficulties(ctx.difficulties, input.date);
  const second = ranked[1];
  if (second && input.availableMinutes >= 300 && mode !== "exam") {
    const repair = repairTaskFor(second);
    tasks.push({
      title: repair.title,
      detail: repair.detail,
      category: "mental",
      winType: null,
      isMandatory: false,
      priority: 4,
      estimatedMinutes: Math.min(repair.estimatedMinutes, 25),
      source: "difficulty",
      difficultyId: repair.difficultyId,
    });
  }

  return {
    tasks,
    theme,
    rationale: {
      physical:
        physical.source === "habit"
          ? "Your mandatory habit covers this."
          : ctx.input.energyLevel <= 2
            ? "Shortened because you logged low energy."
            : "Movement you already said you want daily.",
      mental:
        mental.source === "difficulty"
          ? "Your most pressing unresolved difficulty, at the next intervention stage."
          : `Nothing is marked difficult, so today follows the ${theme.toLowerCase()} rotation.`,
      emotional:
        emotional.title.startsWith("Call")
          ? "Your stated connection cadence has lapsed."
          : "You connected recently, so this one is lighter.",
    },
  };
}
