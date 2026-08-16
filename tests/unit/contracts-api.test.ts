import { beforeEach, describe, expect, it } from "vitest";

import { rateLimit, resetRateLimits } from "@/lib/api";
import {
  assistantInput,
  difficultyCaptureInput,
  difficultyClassification,
  learningTopic,
  onboardingInput,
  startDayInput,
  taskUpdateInput,
} from "@/lib/contracts";

const validOnboarding = {
  name: "Teja",
  wakeTime: "07:00",
  sleepTime: "23:00",
  dailyHours: 6,
  exerciseMinutes: 30,
  learningMinutes: 45,
  socialFrequencyDays: 3,
  examMode: false,
  goals: ["Get fit"],
  subjects: ["Mathematics"],
  examSubjects: [],
  habits: [{ title: "Walk", category: "physical" as const, durationMinutes: 30 }],
};

describe("input contracts", () => {
  it("accepts a well-formed onboarding payload", () => {
    expect(onboardingInput.safeParse(validOnboarding).success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = onboardingInput.safeParse({ ...validOnboarding, name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed clock time", () => {
    expect(onboardingInput.safeParse({ ...validOnboarding, wakeTime: "7:00" }).success).toBe(false);
    expect(onboardingInput.safeParse({ ...validOnboarding, wakeTime: "25:00" }).success).toBe(
      false,
    );
  });

  it("rejects an impossible day length", () => {
    expect(onboardingInput.safeParse({ ...validOnboarding, dailyHours: 40 }).success).toBe(false);
  });

  it("rejects a malformed date on the start-day payload", () => {
    const base = {
      date: "11-08-2026",
      energyLevel: 3,
      availableMinutes: 360,
      examMode: false,
    };
    expect(startDayInput.safeParse(base).success).toBe(false);
  });

  it("defaults optional collections so the planner never sees undefined", () => {
    const result = startDayInput.safeParse({
      date: "2026-08-11",
      energyLevel: 3,
      availableMinutes: 360,
      examMode: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionItems).toEqual([]);
      expect(result.data.fixedCommitments).toEqual([]);
    }
  });

  it("bounds the energy level to 1-5", () => {
    const base = { date: "2026-08-11", availableMinutes: 360, examMode: false };
    expect(startDayInput.safeParse({ ...base, energyLevel: 0 }).success).toBe(false);
    expect(startDayInput.safeParse({ ...base, energyLevel: 6 }).success).toBe(false);
  });

  it("requires a real UUID on task updates", () => {
    expect(taskUpdateInput.safeParse({ id: "not-a-uuid", status: "completed" }).success).toBe(
      false,
    );
  });

  it("rejects a status outside the allowed set", () => {
    expect(
      taskUpdateInput.safeParse({
        id: "3f0f3a9e-2b1a-4d3c-9f0e-1a2b3c4d5e6f",
        status: "banana",
      }).success,
    ).toBe(false);
  });

  it("requires enough text to be a real difficulty", () => {
    expect(difficultyCaptureInput.safeParse({ rawInput: "x", difficulty: "stuck" }).success).toBe(
      false,
    );
    expect(
      difficultyCaptureInput.safeParse({ rawInput: "SN1 vs SN2", difficulty: "stuck" }).success,
    ).toBe(true);
  });

  it("caps assistant questions to keep prompts small", () => {
    expect(assistantInput.safeParse({ question: "a".repeat(501) }).success).toBe(false);
  });
});

describe("AI output contracts", () => {
  it("accepts a well-formed classification", () => {
    const result = difficultyClassification.safeParse({
      topic: "Integration by parts",
      subject: "Mathematics",
      difficulty: "difficult",
      problemType: "procedural",
      likelyGap: "Not recognising the product structure",
      recommendedAction: "Work one solved example",
      estimatedMinutes: 25,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a hallucinated difficulty level", () => {
    const result = difficultyClassification.safeParse({
      topic: "x",
      subject: "y",
      difficulty: "extremely-hard",
      problemType: "conceptual",
      likelyGap: "",
      recommendedAction: "",
      estimatedMinutes: 25,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range time estimate", () => {
    const result = difficultyClassification.safeParse({
      topic: "x",
      subject: "y",
      difficulty: "easy",
      problemType: "conceptual",
      likelyGap: "",
      recommendedAction: "",
      estimatedMinutes: 9999,
    });
    expect(result.success).toBe(false);
  });

  it("requires at least two cross-domain connections on a learning card", () => {
    const result = learningTopic.safeParse({
      topic: "Compound interest",
      explanation: "Money grows on itself.",
      connections: [{ domain: "Maths", insight: "Exponential growth" }],
      applicationPrompt: "Where today?",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a card with the required shape", () => {
    const result = learningTopic.safeParse({
      topic: "Compound interest",
      explanation: "Money grows on itself.",
      connections: [
        { domain: "Maths", insight: "Exponential growth" },
        { domain: "Psychology", insight: "Delayed gratification" },
      ],
      applicationPrompt: "Where today?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a completely malformed model response", () => {
    expect(learningTopic.safeParse({ nonsense: true }).success).toBe(false);
    expect(learningTopic.safeParse(null).success).toBe(false);
    expect(learningTopic.safeParse("[]").success).toBe(false);
  });
});

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit", () => {
    expect(rateLimit("k", 3, 60_000)).toBe(true);
    expect(rateLimit("k", 3, 60_000)).toBe(true);
    expect(rateLimit("k", 3, 60_000)).toBe(true);
  });

  it("blocks the request past the limit", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("k", 3, 60_000);
    expect(rateLimit("k", 3, 60_000)).toBe(false);
  });

  it("keeps separate buckets per key", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("a", 3, 60_000);
    expect(rateLimit("a", 3, 60_000)).toBe(false);
    expect(rateLimit("b", 3, 60_000)).toBe(true);
  });

  it("reopens the window once it expires", async () => {
    expect(rateLimit("w", 1, 10)).toBe(true);
    expect(rateLimit("w", 1, 10)).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(rateLimit("w", 1, 10)).toBe(true);
  });
});
