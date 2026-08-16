import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Single-user application: there is exactly one row in `users`, resolved by
 * `getLocalUser()`. The table exists so the schema stays honest about
 * ownership and so a future multi-user version is a routing change rather
 * than a migration of every table.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  wakeTime: text("wake_time").notNull().default("07:00"),
  sleepTime: text("sleep_time").notNull().default("23:00"),
  dailyHours: real("daily_hours").notNull().default(6),
  exerciseMinutes: integer("exercise_minutes").notNull().default(30),
  learningMinutes: integer("learning_minutes").notNull().default(45),
  socialFrequencyDays: integer("social_frequency_days").notNull().default(3),
  examMode: boolean("exam_mode").notNull().default(false),
  goals: jsonb("goals").$type<string[]>().notNull().default([]),
  subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
  examSubjects: jsonb("exam_subjects").$type<string[]>().notNull().default([]),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Non-negotiable daily habits. These are never silently dropped from a plan. */
export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("other"),
    durationMinutes: integer("duration_minutes").notNull().default(20),
    preferredTime: text("preferred_time"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("habits_user_active_idx").on(t.userId, t.active)],
);

export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    mode: text("mode").notNull().default("normal"),
    energyLevel: integer("energy_level").notNull().default(3),
    availableMinutes: integer("available_minutes").notNull().default(360),
    mainGoal: text("main_goal"),
    variationTheme: text("variation_theme"),
    plannedLoadMinutes: integer("planned_load_minutes").notNull().default(0),
    loadFactor: real("load_factor").notNull().default(1),
    aiSummary: text("ai_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_plans_user_date_idx").on(t.userId, t.date)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => dailyPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail"),
    category: text("category").notNull().default("other"),
    /** Purpose/context tags — orthogonal to `category`, which drives planning. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** physical | mental | emotional — set only on the three headline wins. */
    winType: text("win_type"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    priority: integer("priority").notNull().default(3),
    estimatedMinutes: integer("estimated_minutes").notNull().default(30),
    actualMinutes: integer("actual_minutes"),
    startAt: text("start_at"),
    endAt: text("end_at"),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("user"),
    difficultyId: uuid("difficulty_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_plan_idx").on(t.planId),
    index("tasks_user_status_idx").on(t.userId, t.status),
  ],
);

export const difficulties = pgTable(
  "difficulties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawInput: text("raw_input").notNull(),
    topic: text("topic").notNull(),
    subject: text("subject").notNull().default("general"),
    difficulty: text("difficulty").notNull().default("moderate"),
    problemType: text("problem_type").notNull().default("conceptual"),
    /** Purpose/context tags — orthogonal to `subject`/`difficulty`/`problemType`. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    likelyGap: text("likely_gap"),
    recommendedAction: text("recommended_action"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(25),
    status: text("status").notNull().default("open"),
    attempts: integer("attempts").notNull().default(0),
    timeSpentMinutes: integer("time_spent_minutes").notNull().default(0),
    /** Index into the escalation ladder — see lib/difficulty.ts. */
    interventionStage: integer("intervention_stage").notNull().default(0),
    classifiedByAi: boolean("classified_by_ai").notNull().default(false),
    resolution: text("resolution"),
    reflection: text("reflection"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("difficulties_user_status_idx").on(t.userId, t.status)],
);

export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    topic: text("topic").notNull(),
    explanation: text("explanation").notNull(),
    connections: jsonb("connections")
      .$type<{ domain: string; insight: string }[]>()
      .notNull()
      .default([]),
    applicationPrompt: text("application_prompt"),
    userResponse: text("user_response"),
    confidence: integer("confidence"),
    generatedByAi: boolean("generated_by_ai").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learning_user_date_idx").on(t.userId, t.date)],
);

export const dailyReviews = pgTable(
  "daily_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    energyGivers: text("energy_givers"),
    energyDrains: text("energy_drains"),
    learned: text("learned"),
    tomorrowChange: text("tomorrow_change"),
    threeWinsComplete: boolean("three_wins_complete").notNull().default(false),
    aiInsight: text("ai_insight"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reviews_user_date_idx").on(t.userId, t.date)],
);

/** Deterministic daily rollup. Recomputed on write, never guessed. */
export const behaviorMetrics = pgTable(
  "behavior_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    plannedCount: integer("planned_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    plannedMinutes: integer("planned_minutes").notNull().default(0),
    actualMinutes: integer("actual_minutes").notNull().default(0),
    morningPlanned: integer("morning_planned").notNull().default(0),
    morningCompleted: integer("morning_completed").notNull().default(0),
    eveningPlanned: integer("evening_planned").notNull().default(0),
    eveningCompleted: integer("evening_completed").notNull().default(0),
    threeWins: boolean("three_wins").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("metrics_user_date_idx").on(t.userId, t.date)],
);

/**
 * Groq responses keyed by (user, kind, day, input hash). A page refresh must
 * never re-spend free-tier quota, so every AI call goes through this.
 */
export const aiCache = pgTable(
  "ai_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cacheKey: text("cache_key").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_cache_key_idx").on(t.userId, t.cacheKey)],
);

export type User = typeof users.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Difficulty = typeof difficulties.$inferSelect;
export type LearningSession = typeof learningSessions.$inferSelect;
export type DailyReview = typeof dailyReviews.$inferSelect;
export type BehaviorMetric = typeof behaviorMetrics.$inferSelect;

/* =========================================================================
 * LEARN — four layers, one review queue
 * ====================================================================== */

/** Layer 1: vocabulary. Words enter the shared review queue once seen. */
export const vocabulary = pgTable(
  "vocabulary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    word: text("word").notNull(),
    partOfSpeech: text("part_of_speech"),
    meaning: text("meaning").notNull(),
    etymology: text("etymology"),
    examples: jsonb("examples").$type<string[]>().notNull().default([]),
    /** The user's own sentence — writing one is what moves a word into memory. */
    userSentence: text("user_sentence"),
    /** Groq's verdict on that sentence: correct | close | misused | null. */
    sentenceVerdict: text("sentence_verdict"),
    sentenceFeedback: text("sentence_feedback"),
    learnedOn: date("learned_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vocab_user_word_idx").on(t.userId, t.word),
    index("vocab_user_day_idx").on(t.userId, t.learnedOn),
  ],
);


/**
 * Named maps. Each is an independent web: its own nodes, notes and layout.
 * A "universal" map is created on first use and cannot be deleted — it is the
 * one that never resets, and the subject maps sit alongside it.
 */
export const mindMaps = pgTable(
  "mind_maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("subject"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mind_maps_user_name_idx").on(t.userId, t.name)],
);

/** Layer 3: the personal knowledge web. */
export const mindMapNodes = pgTable(
  "mind_map_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mapId: uuid("map_id").references(() => mindMaps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    domain: text("domain").notNull().default("abstract"),
    summary: text("summary"),
    /* Canvas position. Saved so the layout you arrange stays put — spatial
       stability is most of why a map aids recall in the first place. */
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    /** The user's own research and thinking — the part that makes it theirs. */
    notes: text("notes"),
    /** An external reference for this topic — an article, video, or doc. */
    resourceUrl: text("resource_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mind_node_map_title_idx").on(t.mapId, t.title),
    index("mind_node_map_idx").on(t.userId, t.mapId),
  ],
);

/**
 * Directed edges. `suggested` marks links Groq proposed but the user has not
 * accepted — an unapproved suggestion never becomes part of the web.
 */
export const mindMapEdges = pgTable(
  "mind_map_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromId: uuid("from_id")
      .notNull()
      .references(() => mindMapNodes.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => mindMapNodes.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull().default("relates to"),
    suggested: boolean("suggested").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mind_edge_unique_idx").on(t.userId, t.fromId, t.toId),
    index("mind_edge_from_idx").on(t.fromId),
  ],
);

/** Layer 4: memory drills. One row per completed session. */
export const memorySessions = pgTable(
  "memory_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    drill: text("drill").notNull(),
    /** Difficulty reached — span length, N-back level, or item count. */
    level: integer("level").notNull().default(1),
    score: integer("score").notNull().default(0),
    maxScore: integer("max_score").notNull().default(0),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    playedOn: date("played_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memory_user_drill_idx").on(t.userId, t.drill, t.playedOn)],
);

/**
 * One SM-2 queue across every kind of material. Vocabulary, concepts and
 * resolved difficulties all schedule through here, so the user has a single
 * "what needs reviewing" answer rather than three competing ones.
 */
export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Row id in the source table (vocabulary, learning_sessions, ...). */
    sourceId: uuid("source_id").notNull(),
    prompt: text("prompt").notNull(),
    answer: text("answer").notNull(),
    repetitions: integer("repetitions").notNull().default(0),
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: real("ease_factor").notNull().default(2.5),
    due: date("due").notNull(),
    lapses: integer("lapses").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_source_idx").on(t.userId, t.kind, t.sourceId),
    index("review_due_idx").on(t.userId, t.due),
  ],
);

/** Sunday consolidation across everything learnt since the last one. */
export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekEnding: date("week_ending").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    conceptCount: integer("concept_count").notNull().default(0),
    nodeCount: integer("node_count").notNull().default(0),
    resolvedCount: integer("resolved_count").notNull().default(0),
    questions: jsonb("questions")
      .$type<{ prompt: string; answer: string; source: string }[]>()
      .notNull()
      .default([]),
    synthesis: text("synthesis"),
    score: integer("score"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weekly_user_week_idx").on(t.userId, t.weekEnding)],
);

export type Vocabulary = typeof vocabulary.$inferSelect;
export type MindMap = typeof mindMaps.$inferSelect;
export type MindMapNode = typeof mindMapNodes.$inferSelect;
export type MindMapEdge = typeof mindMapEdges.$inferSelect;
export type MemorySession = typeof memorySessions.$inferSelect;
export type ReviewItem = typeof reviewQueue.$inferSelect;
export type WeeklyReview = typeof weeklyReviews.$inferSelect;

/* =========================================================================
 * EVIDENCE — the proof-of-work trail
 * ====================================================================== */

/**
 * Dated evidence that something actually happened.
 *
 * This is the substance of the exported report: self-reported percentages
 * prove nothing to an outside reader, but a dated, clickable link does. Four
 * kinds, deliberately ranked by how much external weight they carry:
 *
 *   link       a URL anyone can open — a commit, PR, deploy, submission
 *   file       a URL to something you host elsewhere (never uploaded here)
 *   metric     a self-reported number, labelled as such in the report
 *   reflection text only, for work that leaves no trace
 */
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Optional: evidence can stand alone, not every proof has a task. */
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    kind: text("kind").notNull().default("link"),
    title: text("title").notNull(),
    url: text("url"),
    note: text("note"),
    metricValue: real("metric_value"),
    metricUnit: text("metric_unit"),
    category: text("category").notNull().default("other"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("evidence_user_date_idx").on(t.userId, t.date),
    index("evidence_kind_idx").on(t.userId, t.kind),
  ],
);

/**
 * External brain-training sites, configured by the user.
 *
 * The app deliberately does not host the games — it holds the link, opens it,
 * and records what you scored when you come back. Far less to maintain than
 * four bespoke drills, and you can point it at anything.
 */
export const trainingLinks = pgTable(
  "training_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    trains: text("trains"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("training_user_name_idx").on(t.userId, t.name)],
);

export type Evidence = typeof evidence.$inferSelect;
export type TrainingLink = typeof trainingLinks.$inferSelect;

/**
 * Every task Orbit has ever proposed, with what you did about it.
 *
 * `accepted` is the training signal: null while pending, true once added to a
 * plan, false when the batch was applied without it. Recent accepts and
 * rejects are fed back into the prompt, so suggestions drift toward the way
 * you actually phrase and size your own work.
 */
export const taskSuggestions = pgTable(
  "task_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What the user typed to trigger the batch. */
    intent: text("intent").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull().default("other"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(30),
    rationale: text("rationale"),
    accepted: boolean("accepted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("suggestions_user_idx").on(t.userId, t.accepted)],
);

export type TaskSuggestion = typeof taskSuggestions.$inferSelect;
