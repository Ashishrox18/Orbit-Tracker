import { z } from "zod";

import {
  DAY_MODES,
  DIFFICULTY_LEVELS,
  DIFFICULTY_STATUSES,
  PROBLEM_TYPES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  WIN_TYPES,
} from "./constants";

/* -------------------------------------------------------------------------
 * Shared primitives
 * ---------------------------------------------------------------------- */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

export const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a HH:MM time");

const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().max(2_000);
/** Presets are suggestions, not an enum — a custom tag is always allowed. */
const tagsInput = z.array(z.string().trim().min(1).max(40)).max(8);

/* -------------------------------------------------------------------------
 * API input — everything crossing the network boundary validates here
 * ---------------------------------------------------------------------- */

export const onboardingInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  wakeTime: clockTime,
  sleepTime: clockTime,
  dailyHours: z.number().min(0.5).max(16),
  exerciseMinutes: z.number().int().min(0).max(240),
  learningMinutes: z.number().int().min(0).max(240),
  socialFrequencyDays: z.number().int().min(1).max(30),
  examMode: z.boolean(),
  goals: z.array(shortText).max(10),
  subjects: z.array(shortText).max(20),
  examSubjects: z.array(shortText).max(20),
  habits: z
    .array(
      z.object({
        title: shortText,
        category: z.enum(TASK_CATEGORIES),
        durationMinutes: z.number().int().min(5).max(240),
      }),
    )
    .max(10),
});
export type OnboardingInput = z.infer<typeof onboardingInput>;

export const settingsInput = onboardingInput.partial().extend({
  name: z.string().trim().min(1).max(80).optional(),
});
export type SettingsInput = z.infer<typeof settingsInput>;

export const startDayInput = z.object({
  date: isoDate,
  mainGoal: z.string().trim().max(200).optional(),
  actionItems: z.array(shortText).max(12).default([]),
  fixedCommitments: z
    .array(
      z.object({
        title: shortText,
        startAt: clockTime,
        durationMinutes: z.number().int().min(5).max(600),
      }),
    )
    .max(8)
    .default([]),
  energyLevel: z.number().int().min(1).max(5),
  availableMinutes: z.number().int().min(30).max(960),
  examMode: z.boolean(),
});
export type StartDayInput = z.infer<typeof startDayInput>;

export const taskUpdateInput = z.object({
  id: z.uuid(),
  status: z.enum(TASK_STATUSES).optional(),
  actualMinutes: z.number().int().min(0).max(600).nullable().optional(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateInput>;

export const taskCreateInput = z.object({
  date: isoDate,
  title: shortText,
  category: z.enum(TASK_CATEGORIES).default("other"),
  estimatedMinutes: z.number().int().min(5).max(600).default(30),
  priority: z.number().int().min(1).max(5).default(3),
  tags: tagsInput.default([]),
});
export type TaskCreateInput = z.infer<typeof taskCreateInput>;

export const difficultyCaptureInput = z.object({
  rawInput: z.string().trim().min(3, "Describe what you're stuck on").max(1_000),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  subjectHint: z.string().trim().max(80).optional(),
  tags: tagsInput.default([]),
});
export type DifficultyCaptureInput = z.infer<typeof difficultyCaptureInput>;

export const difficultyUpdateInput = z.object({
  id: z.uuid(),
  status: z.enum(DIFFICULTY_STATUSES).optional(),
  timeSpentMinutes: z.number().int().min(0).max(600).optional(),
  reflection: longText.optional(),
  resolution: longText.optional(),
  stillStruggling: z.boolean().optional(),
  tags: tagsInput.optional(),
});
export type DifficultyUpdateInput = z.infer<typeof difficultyUpdateInput>;

export const learningResponseInput = z.object({
  date: isoDate,
  userResponse: z.string().trim().min(1).max(2_000),
  confidence: z.number().int().min(1).max(5),
});
export type LearningResponseInput = z.infer<typeof learningResponseInput>;

export const reviewInput = z.object({
  date: isoDate,
  energyGivers: longText.optional(),
  energyDrains: longText.optional(),
  learned: longText.optional(),
  tomorrowChange: longText.optional(),
});
export type ReviewInput = z.infer<typeof reviewInput>;

export const assistantInput = z.object({
  question: z.string().trim().min(1, "Ask something").max(500),
});
export type AssistantInput = z.infer<typeof assistantInput>;

/* -------------------------------------------------------------------------
 * AI output — the model is untrusted input. Nothing reaches the database or
 * the screen without passing one of these.
 * ---------------------------------------------------------------------- */

export const difficultyClassification = z.object({
  topic: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(60),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  problemType: z.enum(PROBLEM_TYPES),
  likelyGap: z.string().trim().max(400),
  recommendedAction: z.string().trim().max(400),
  estimatedMinutes: z.number().int().min(5).max(180),
});
export type DifficultyClassification = z.infer<typeof difficultyClassification>;

export const learningTopic = z.object({
  topic: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(1_500),
  connections: z
    .array(
      z.object({
        domain: z.string().trim().min(1).max(60),
        insight: z.string().trim().min(1).max(300),
      }),
    )
    .min(2)
    .max(6),
  applicationPrompt: z.string().trim().min(1).max(300),
});
export type LearningTopic = z.infer<typeof learningTopic>;

export const eveningInsight = z.object({
  headline: z.string().trim().min(1).max(200),
  observations: z.array(z.string().trim().min(1).max(300)).min(1).max(4),
  tomorrowAdjustment: z.string().trim().min(1).max(300),
});
export type EveningInsight = z.infer<typeof eveningInsight>;

export const assistantReply = z.object({
  answer: z.string().trim().min(1).max(1_200),
  suggestedAction: z.string().trim().max(200).nullable(),
});
export type AssistantReply = z.infer<typeof assistantReply>;

/* -------------------------------------------------------------------------
 * Derived view models
 * ---------------------------------------------------------------------- */

export const scheduledBlock = z.object({
  startAt: clockTime,
  endAt: clockTime,
  title: z.string(),
  kind: z.enum(["task", "break", "buffer"]),
  taskId: z.string().nullable(),
  winType: z.enum(WIN_TYPES).nullable(),
  isMandatory: z.boolean(),
});
export type ScheduledBlock = z.infer<typeof scheduledBlock>;

export const dayModeSchema = z.enum(DAY_MODES);

/* -------------------------------------------------------------------------
 * LEARN — four layers
 * ---------------------------------------------------------------------- */

export { MIND_DOMAINS, DOMAIN_GROUPS } from "./domains";
import { MIND_DOMAINS as DOMAINS } from "./domains";

/** Layer 1 — a day's vocabulary set. */
export const vocabularySet = z.object({
  words: z
    .array(
      z.object({
        word: z.string().trim().min(2).max(40),
        partOfSpeech: z.string().trim().max(24),
        meaning: z.string().trim().min(5).max(300),
        etymology: z.string().trim().max(240),
        examples: z.array(z.string().trim().min(5).max(240)).min(1).max(3),
      }),
    )
    .min(1)
    .max(10),
});
export type VocabularySet = z.infer<typeof vocabularySet>;

/** Groq's verdict on the user's own sentence. */
export const sentenceJudgement = z.object({
  verdict: z.enum(["correct", "close", "misused"]),
  feedback: z.string().trim().min(1).max(400),
  improved: z.string().trim().max(240),
});
export type SentenceJudgement = z.infer<typeof sentenceJudgement>;

/**
 * Layer 2 — the upgraded concept card. `facts` is the part that makes it
 * professional rather than vague: concrete figures with their source named.
 */
export const richConcept = z.object({
  topic: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(5).max(600),
  explanation: z.string().trim().min(40).max(3_000),
  workedExample: z.object({
    setup: z.string().trim().min(3).max(900),
    walkthrough: z.string().trim().min(5).max(2_000),
    result: z.string().trim().min(1).max(500),
  }),
  facts: z
    .array(
      z.object({
        claim: z.string().trim().min(3).max(400),
        figure: z.string().trim().max(160),
        source: z.string().trim().max(200),
      }),
    )
    .min(1)
    .max(6),
  connections: z
    .array(
      z.object({
        domain: z.string().trim().min(1).max(60),
        insight: z.string().trim().min(3).max(400),
      }),
    )
    .min(2)
    .max(6),
  applicationPrompt: z.string().trim().min(1).max(300),
});
export type RichConcept = z.infer<typeof richConcept>;

/** The Feynman check — explain it to a five-year-old, then get marked. */
export const feynmanJudgement = z.object({
  clarityScore: z.number().int().min(1).max(10),
  accuracyScore: z.number().int().min(1).max(10),
  jargonFound: z.array(z.string().trim().max(60)).max(8),
  strongestPart: z.string().trim().min(1).max(300),
  weakestPart: z.string().trim().min(1).max(300),
  oneThingToFix: z.string().trim().min(1).max(300),
});
export type FeynmanJudgement = z.infer<typeof feynmanJudgement>;

/** Layer 3 — link suggestions. Never applied without the user accepting. */
export const linkSuggestions = z.object({
  links: z
    .array(
      z.object({
        from: z.string().trim().min(1).max(120),
        to: z.string().trim().min(1).max(120),
        relationship: z.string().trim().min(2).max(80),
        why: z.string().trim().max(300),
      }),
    )
    .max(6),
});
export type LinkSuggestions = z.infer<typeof linkSuggestions>;

export const nodeSeed = z.object({
  summary: z.string().trim().min(20).max(600),
  domain: z.enum(DOMAINS),
});
export type NodeSeed = z.infer<typeof nodeSeed>;

/** Sunday consolidation. */
export const weeklyConsolidation = z.object({
  synthesis: z.string().trim().min(50).max(1_200),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(5).max(300),
        answer: z.string().trim().min(1).max(400),
        source: z.string().trim().max(60),
      }),
    )
    .min(3)
    .max(12),
});
export type WeeklyConsolidation = z.infer<typeof weeklyConsolidation>;

/* ----------------------------------------------------- Learn API inputs */

export const vocabRequestInput = z.object({ date: isoDate, count: z.number().int().min(1).max(10).default(10) });

export const vocabSentenceInput = z.object({
  id: z.uuid(),
  sentence: z.string().trim().min(3).max(400),
});

export const reviewGradeInput = z.object({
  id: z.uuid(),
  grade: z.enum(["again", "hard", "good", "easy"]),
});

export const feynmanInput = z.object({
  date: isoDate,
  explanation: z.string().trim().min(20).max(2_000),
});

export const nodeCreateInput = z.object({
  title: shortText,
  domain: z.enum(DOMAINS).default("abstract"),
  notes: z.string().trim().max(4_000).optional(),
  autoSummary: z.boolean().default(true),
});

export const nodeUpdateInput = z.object({
  id: z.uuid(),
  title: shortText.optional(),
  domain: z.enum(DOMAINS).optional(),
  notes: z.string().trim().max(4_000).optional(),
});

export const edgeInput = z.object({
  fromId: z.uuid(),
  toId: z.uuid(),
  relationship: z.string().trim().min(2).max(80).default("relates to"),
});

export const drillResultInput = z.object({
  drill: z.enum(["sequence", "reaction", "change", "switch"]),
  level: z.number().int().min(1).max(20),
  score: z.number().int().min(0).max(1_000),
  maxScore: z.number().int().min(0).max(1_000),
  durationSeconds: z.number().int().min(0).max(7_200),
});

/** Full task control — the timeline is editable, not just tickable. */
export const taskEditInput = z.object({
  id: z.uuid(),
  title: shortText.optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  startAt: clockTime.nullable().optional(),
  endAt: clockTime.nullable().optional(),
  tags: tagsInput.optional(),
});
export type TaskEditInput = z.infer<typeof taskEditInput>;

export const taskDeleteInput = z.object({ id: z.uuid() });
