export const WIN_TYPES = ["physical", "mental", "emotional"] as const;
export type WinType = (typeof WIN_TYPES)[number];

export const TASK_CATEGORIES = [
  "physical",
  "mental",
  "emotional",
  "habit",
  "commitment",
  "other",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_STATUSES = ["pending", "completed", "skipped", "postponed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Preset purpose/context tags — orthogonal to `TASK_CATEGORIES`, which drives
 * planning. Stored as plain `string[]`, not this union: a custom tag typed by
 * the user is always allowed alongside these presets.
 */
export const TASK_TAGS = [
  "Exam prep",
  "Academics/coursework",
  "Competitive exam prep",
  "Work/professional",
  "Work upskilling",
  "Certification",
  "Personal project",
  "Health & fitness",
  "Household/admin",
  "Finance",
  "Creative",
  "Social/relationships",
  "Volunteering",
  "Hobby learning",
  "Other",
] as const;

export const DIFFICULTY_TAGS = [
  "Exam-related",
  "Competitive exam-related",
  "Academic/coursework",
  "Daily/routine friction",
  "Self-improvement",
  "Vocational/technical skill",
  "Soft skill",
  "Work-related",
  "Language",
  "Creative skill",
  "Life skill",
  "Other",
] as const;

export const TASK_SOURCES = ["habit", "difficulty", "user", "generated", "learning"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const DAY_MODES = ["normal", "exam"] as const;
export type DayMode = (typeof DAY_MODES)[number];

export const DIFFICULTY_LEVELS = ["easy", "moderate", "difficult", "stuck"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const DIFFICULTY_STATUSES = ["open", "in_progress", "resolved"] as const;
export type DifficultyStatus = (typeof DIFFICULTY_STATUSES)[number];

export const PROBLEM_TYPES = [
  "conceptual",
  "procedural",
  "application",
  "recall",
  "unknown",
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

/**
 * The escalation ladder. A topic the user is still stuck on must not simply be
 * rescheduled as the same task — each repeat moves one rung down, changing the
 * *kind* of intervention rather than repeating it louder.
 */
export const INTERVENTION_STAGES = [
  { label: "Concept explanation", verb: "Re-read and restate the core idea for", minutes: 20 },
  { label: "Worked example", verb: "Work through a solved example of", minutes: 25 },
  { label: "Easier problem", verb: "Solve one simplified problem on", minutes: 20 },
  { label: "Guided problem", verb: "Solve a problem with hints for", minutes: 30 },
  { label: "Independent problem", verb: "Solve unaided, then self-mark:", minutes: 35 },
] as const;

/** Weekly rotation. Keeps the routine consistent without making it identical. */
export const VARIATION_THEMES = [
  "Review and reset",
  "Deep practice",
  "Concept learning",
  "Problem solving",
  "Project implementation",
  "Revision",
  "Mock and self-test",
] as const;

/** Below this many days of history, insights are suppressed rather than guessed. */
export const MIN_DAYS_FOR_INSIGHT = 4;

/** Boundary between "morning" and "evening" completion analysis, in minutes. */
export const MIDDAY_MINUTES = 12 * 60;

export const AI_TIMEOUT_MS = 12_000;
export const AI_MAX_INPUT_CHARS = 4_000;
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
