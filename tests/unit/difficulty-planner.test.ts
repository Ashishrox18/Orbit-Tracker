import { describe, expect, it } from "vitest";

import { INTERVENTION_STAGES } from "@/lib/constants";
import {
  classifyLocally,
  difficultyStats,
  nextStage,
  priorityScore,
  rankDifficulties,
  repairTaskFor,
  stageFor,
  type DifficultyLike,
} from "@/lib/difficulty";
import { buildDayPlan, type PlanContext } from "@/lib/planner";
import { practiceTitleFor, themeFor, themeForMode } from "@/lib/variation";

const TODAY = "2026-08-11";

type DiffWithResolution = DifficultyLike & { resolvedAt?: Date | string | null };

const diff = (over: Partial<DiffWithResolution> = {}): DiffWithResolution => ({
  id: "d1",
  topic: "Integration by parts",
  subject: "Mathematics",
  difficulty: "difficult",
  status: "open",
  attempts: 0,
  interventionStage: 0,
  estimatedMinutes: 25,
  createdAt: TODAY,
  ...over,
});

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  input: {
    date: TODAY,
    actionItems: [],
    fixedCommitments: [],
    energyLevel: 3,
    availableMinutes: 360,
    examMode: false,
  },
  exerciseMinutes: 30,
  learningMinutes: 45,
  subjects: ["Mathematics"],
  examSubjects: ["Physics"],
  socialFrequencyDays: 3,
  habits: [],
  difficulties: [],
  daysSinceEmotionalWin: 1,
  ...over,
});

describe("intervention ladder", () => {
  it("clamps an out-of-range stage into the ladder", () => {
    expect(stageFor(-5)).toBe(INTERVENTION_STAGES[0]);
    expect(stageFor(99)).toBe(INTERVENTION_STAGES[INTERVENTION_STAGES.length - 1]);
  });

  it("advances one rung at a time", () => {
    expect(nextStage(0)).toBe(1);
    expect(nextStage(2)).toBe(3);
  });

  it("stops at the last rung so a topic cannot fall off the ladder", () => {
    const last = INTERVENTION_STAGES.length - 1;
    expect(nextStage(last)).toBe(last);
  });

  it("changes the kind of task, not just the wording, as it escalates", () => {
    const first = repairTaskFor(diff({ interventionStage: 0 }));
    const later = repairTaskFor(diff({ interventionStage: 3 }));
    expect(first.title).not.toBe(later.title);
    expect(first.detail).not.toBe(later.detail);
  });
});

describe("priorityScore", () => {
  it("scores stuck above difficult above moderate", () => {
    const stuck = priorityScore(diff({ difficulty: "stuck" }), TODAY);
    const hard = priorityScore(diff({ difficulty: "difficult" }), TODAY);
    const mid = priorityScore(diff({ difficulty: "moderate" }), TODAY);
    expect(stuck).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(mid);
  });

  it("scores resolved items at zero", () => {
    expect(priorityScore(diff({ status: "resolved" }), TODAY)).toBe(0);
  });

  it("raises priority as an item ages", () => {
    const fresh = priorityScore(diff({ createdAt: TODAY }), TODAY);
    const stale = priorityScore(diff({ createdAt: "2026-08-01" }), TODAY);
    expect(stale).toBeGreaterThan(fresh);
  });

  it("raises priority with repeated failed attempts", () => {
    expect(priorityScore(diff({ attempts: 3 }), TODAY)).toBeGreaterThan(
      priorityScore(diff({ attempts: 0 }), TODAY),
    );
  });

  it("excludes resolved items from the ranking entirely", () => {
    const ranked = rankDifficulties(
      [diff({ id: "a" }), diff({ id: "b", status: "resolved" })],
      TODAY,
    );
    expect(ranked.map((d) => d.id)).toEqual(["a"]);
  });
});

describe("difficultyStats", () => {
  it("counts by status", () => {
    const stats = difficultyStats([
      diff({ id: "1", status: "open" }),
      diff({ id: "2", status: "in_progress" }),
      diff({ id: "3", status: "resolved", resolvedAt: TODAY }),
    ]);
    expect(stats.open).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.resolved).toBe(1);
  });

  it("averages resolution time in days", () => {
    const stats = difficultyStats([
      diff({ id: "1", status: "resolved", createdAt: "2026-08-01", resolvedAt: "2026-08-05" }),
    ]);
    expect(stats.averageResolutionDays).toBe(4);
  });

  it("reports a repeated topic only when it actually repeats", () => {
    expect(difficultyStats([diff({ id: "1" })]).mostRepeatedTopic).toBeNull();
    expect(
      difficultyStats([diff({ id: "1" }), diff({ id: "2" })]).mostRepeatedTopic,
    ).toBe("integration by parts");
  });
});

describe("classifyLocally", () => {
  it("infers a subject from the wording", () => {
    expect(classifyLocally("SN1 vs SN2", "difficult").subject).toBe("Chemistry");
    expect(classifyLocally("I can't solve DP problems", "stuck").subject).toBe("Programming");
  });

  it("prefers an explicit subject hint over inference", () => {
    expect(classifyLocally("SN1 vs SN2", "difficult", "Organic").subject).toBe("Organic");
  });

  it("detects a procedural question", () => {
    expect(classifyLocally("When to use integration by parts?", "moderate").problemType).toBe(
      "procedural",
    );
  });

  it("scales estimated time with difficulty", () => {
    expect(classifyLocally("x", "stuck").estimatedMinutes).toBeGreaterThan(
      classifyLocally("x", "moderate").estimatedMinutes,
    );
  });
});

describe("variation engine", () => {
  it("rotates the theme across the week", () => {
    const week = ["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"].map(themeFor);
    expect(new Set(week).size).toBe(4);
  });

  it("collapses to revision and testing in exam mode", () => {
    for (const date of ["2026-08-09", "2026-08-10", "2026-08-11"]) {
      expect(["Revision", "Mock and self-test"]).toContain(themeForMode(date, "exam"));
    }
  });

  it("names the subject in the practice title", () => {
    expect(practiceTitleFor("Revision", "Physics")).toContain("Physics");
  });
});

describe("buildDayPlan", () => {
  it("always produces exactly three headline wins", () => {
    const plan = buildDayPlan(ctx());
    const wins = plan.tasks.filter((t) => t.winType);
    expect(wins).toHaveLength(3);
    expect(new Set(wins.map((w) => w.winType))).toEqual(
      new Set(["physical", "mental", "emotional"]),
    );
  });

  it("promotes the top difficulty into the mental win", () => {
    const plan = buildDayPlan(ctx({ difficulties: [diff()] }));
    const mental = plan.tasks.find((t) => t.winType === "mental");
    expect(mental?.source).toBe("difficulty");
    expect(mental?.difficultyId).toBe("d1");
  });

  it("falls back to rotation practice when nothing is difficult", () => {
    const mental = buildDayPlan(ctx()).tasks.find((t) => t.winType === "mental");
    expect(mental?.source).toBe("generated");
    expect(mental?.title).toContain("Mathematics");
  });

  it("uses exam subjects and skips extra work in exam mode", () => {
    const plan = buildDayPlan(
      ctx({ input: { ...ctx().input, examMode: true }, difficulties: [diff(), diff({ id: "d2" })] }),
    );
    // The second difficulty is deliberately not added on exam days.
    expect(plan.tasks.filter((t) => t.source === "difficulty")).toHaveLength(1);
  });

  it("never drops a mandatory habit", () => {
    const plan = buildDayPlan(
      ctx({ habits: [{ id: "h1", title: "Read 20 pages", category: "habit", durationMinutes: 20 }] }),
    );
    expect(plan.tasks.some((t) => t.title === "Read 20 pages" && t.isMandatory)).toBe(true);
  });

  it("reuses a physical habit as the physical win instead of duplicating it", () => {
    const plan = buildDayPlan(
      ctx({ habits: [{ id: "h1", title: "Morning walk", category: "physical", durationMinutes: 30 }] }),
    );
    expect(plan.tasks.filter((t) => t.title === "Morning walk")).toHaveLength(1);
    expect(plan.tasks.find((t) => t.winType === "physical")?.isMandatory).toBe(true);
  });

  it("shortens the physical win when energy is low", () => {
    const tired = buildDayPlan(ctx({ input: { ...ctx().input, energyLevel: 1 } }));
    const sharp = buildDayPlan(ctx({ input: { ...ctx().input, energyLevel: 5 } }));
    const minutes = (p: ReturnType<typeof buildDayPlan>) =>
      p.tasks.find((t) => t.winType === "physical")?.estimatedMinutes ?? 0;
    expect(minutes(tired)).toBeLessThan(minutes(sharp));
  });

  it("asks the user to reach out once their social cadence has lapsed", () => {
    const overdue = buildDayPlan(ctx({ daysSinceEmotionalWin: 10, socialFrequencyDays: 3 }));
    expect(overdue.tasks.find((t) => t.winType === "emotional")?.title).toContain("Call");
  });

  it("keeps the emotional win light when they connected recently", () => {
    const recent = buildDayPlan(ctx({ daysSinceEmotionalWin: 0, socialFrequencyDays: 3 }));
    expect(recent.tasks.find((t) => t.winType === "emotional")?.title).toContain("reflection");
  });

  it("treats a never-logged emotional win as overdue", () => {
    const never = buildDayPlan(ctx({ daysSinceEmotionalWin: null }));
    expect(never.tasks.find((t) => t.winType === "emotional")?.title).toContain("Call");
  });

  it("carries the user's own action items onto the plan", () => {
    const plan = buildDayPlan(
      ctx({ input: { ...ctx().input, actionItems: ["Email the registrar"] } }),
    );
    expect(plan.tasks.some((t) => t.title === "Email the registrar" && t.source === "user")).toBe(
      true,
    );
  });

  it("explains each win in terms the user can check", () => {
    const plan = buildDayPlan(ctx({ difficulties: [diff()] }));
    expect(plan.rationale.mental).toContain("difficulty");
    expect(plan.rationale.physical.length).toBeGreaterThan(0);
    expect(plan.rationale.emotional.length).toBeGreaterThan(0);
  });
});
