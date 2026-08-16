import { describe, expect, it } from "vitest";

import {
  buildInsights,
  completionRate,
  consistencyScore,
  loadFactor,
  longestThreeWinStreak,
  mostSkippedCategory,
  planningAccuracy,
  rollupDay,
  threeWinStreak,
  windowComparison,
  type DailyRollup,
  type TaskLike,
} from "@/lib/behavior";

const task = (over: Partial<TaskLike> = {}): TaskLike => ({
  status: "pending",
  estimatedMinutes: 30,
  actualMinutes: null,
  startAt: "09:00",
  winType: null,
  category: "other",
  ...over,
});

const rollup = (over: Partial<DailyRollup> = {}): DailyRollup => ({
  date: "2026-08-01",
  plannedCount: 4,
  completedCount: 2,
  skippedCount: 1,
  plannedMinutes: 120,
  actualMinutes: 120,
  morningPlanned: 2,
  morningCompleted: 2,
  eveningPlanned: 2,
  eveningCompleted: 0,
  threeWins: false,
  ...over,
});

describe("rollupDay", () => {
  it("counts completions, skips and minutes", () => {
    const result = rollupDay("2026-08-11", [
      task({ status: "completed", actualMinutes: 40 }),
      task({ status: "skipped" }),
      task(),
    ]);
    expect(result.plannedCount).toBe(3);
    expect(result.completedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.plannedMinutes).toBe(90);
    expect(result.actualMinutes).toBe(40);
  });

  it("falls back to the estimate when no actual duration was recorded", () => {
    const result = rollupDay("2026-08-11", [task({ status: "completed", actualMinutes: null })]);
    expect(result.actualMinutes).toBe(30);
  });

  it("splits completion by morning and evening windows", () => {
    const result = rollupDay("2026-08-11", [
      task({ status: "completed", startAt: "09:00" }),
      task({ status: "pending", startAt: "20:00" }),
    ]);
    expect(result.morningPlanned).toBe(1);
    expect(result.morningCompleted).toBe(1);
    expect(result.eveningPlanned).toBe(1);
    expect(result.eveningCompleted).toBe(0);
  });

  it("excludes unscheduled tasks from both windows", () => {
    const result = rollupDay("2026-08-11", [task({ startAt: null })]);
    expect(result.morningPlanned).toBe(0);
    expect(result.eveningPlanned).toBe(0);
  });

  it("marks threeWins only when all three win types are completed", () => {
    const twoWins = rollupDay("2026-08-11", [
      task({ status: "completed", winType: "physical" }),
      task({ status: "completed", winType: "mental" }),
    ]);
    expect(twoWins.threeWins).toBe(false);

    const allThree = rollupDay("2026-08-11", [
      task({ status: "completed", winType: "physical" }),
      task({ status: "completed", winType: "mental" }),
      task({ status: "completed", winType: "emotional" }),
    ]);
    expect(allThree.threeWins).toBe(true);
  });

  it("does not count an incomplete win", () => {
    const result = rollupDay("2026-08-11", [
      task({ status: "completed", winType: "physical" }),
      task({ status: "completed", winType: "mental" }),
      task({ status: "skipped", winType: "emotional" }),
    ]);
    expect(result.threeWins).toBe(false);
  });
});

describe("completionRate", () => {
  it("computes the aggregate rate", () => {
    expect(completionRate([rollup({ plannedCount: 4, completedCount: 2 })])).toBe(0.5);
  });

  it("returns null when nothing was ever planned", () => {
    expect(completionRate([rollup({ plannedCount: 0, completedCount: 0 })])).toBeNull();
    expect(completionRate([])).toBeNull();
  });
});

describe("loadFactor", () => {
  it("is neutral without enough history", () => {
    expect(loadFactor([])).toBe(1);
    expect(loadFactor([rollup()])).toBe(1);
  });

  it("shrinks the plan when completion is poor", () => {
    const poor = Array.from({ length: 5 }, () =>
      rollup({ plannedCount: 10, completedCount: 3 }),
    );
    expect(loadFactor(poor)).toBeLessThan(1);
  });

  it("never drops below the 0.6 floor, however bad the week", () => {
    const awful = Array.from({ length: 7 }, () =>
      rollup({ plannedCount: 10, completedCount: 0 }),
    );
    expect(loadFactor(awful)).toBeGreaterThanOrEqual(0.6);
  });

  it("never exceeds 1 even on a perfect week", () => {
    const perfect = Array.from({ length: 7 }, () =>
      rollup({ plannedCount: 5, completedCount: 5 }),
    );
    expect(loadFactor(perfect)).toBeLessThanOrEqual(1);
  });
});

describe("planningAccuracy", () => {
  it("returns null below the minimum sample size", () => {
    expect(planningAccuracy([rollup()])).toBeNull();
  });

  it("detects consistent underestimation", () => {
    const days = Array.from({ length: 5 }, () =>
      rollup({ plannedMinutes: 100, actualMinutes: 150, completedCount: 2 }),
    );
    const accuracy = planningAccuracy(days);
    expect(accuracy).not.toBeNull();
    expect(accuracy!).toBeLessThan(1);
  });
});

describe("windowComparison", () => {
  it("returns null without enough days", () => {
    expect(windowComparison([rollup()])).toBeNull();
  });

  it("identifies the stronger window and the gap", () => {
    const days = Array.from({ length: 5 }, () =>
      rollup({
        morningPlanned: 2,
        morningCompleted: 2,
        eveningPlanned: 2,
        eveningCompleted: 0,
      }),
    );
    const result = windowComparison(days);
    expect(result?.strongerWindow).toBe("morning");
    expect(result?.gapPoints).toBe(100);
  });
});

describe("streaks and consistency", () => {
  it("counts the current three-win streak from the most recent day", () => {
    expect(
      threeWinStreak([
        rollup({ threeWins: true }),
        rollup({ threeWins: false }),
        rollup({ threeWins: true }),
        rollup({ threeWins: true }),
      ]),
    ).toBe(2);
  });

  it("returns zero when the most recent day broke the streak", () => {
    expect(threeWinStreak([rollup({ threeWins: true }), rollup({ threeWins: false })])).toBe(0);
  });

  it("finds the longest historical run", () => {
    expect(
      longestThreeWinStreak([
        rollup({ threeWins: true }),
        rollup({ threeWins: true }),
        rollup({ threeWins: true }),
        rollup({ threeWins: false }),
        rollup({ threeWins: true }),
      ]),
    ).toBe(3);
  });

  it("scores consistency as days with any completion", () => {
    expect(
      consistencyScore([rollup({ completedCount: 1 }), rollup({ completedCount: 0 })]),
    ).toBe(0.5);
  });
});

describe("mostSkippedCategory", () => {
  it("ignores categories with too few samples to be a pattern", () => {
    expect(
      mostSkippedCategory([
        { category: "physical", status: "skipped" },
        { category: "physical", status: "completed" },
      ]),
    ).toBeNull();
  });

  it("finds the worst category once there is enough data", () => {
    expect(
      mostSkippedCategory([
        { category: "emotional", status: "skipped" },
        { category: "emotional", status: "skipped" },
        { category: "emotional", status: "completed" },
        { category: "mental", status: "completed" },
        { category: "mental", status: "completed" },
        { category: "mental", status: "completed" },
      ]),
    ).toBe("emotional");
  });
});

describe("buildInsights", () => {
  it("refuses to draw conclusions from too little data", () => {
    const insights = buildInsights([rollup(), rollup()]);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.reliable).toBe(false);
    expect(insights[0]?.text).toContain("Still learning your pattern");
  });

  it("names how many more days are needed", () => {
    expect(buildInsights([rollup()])[0]?.text).toContain("3 more days");
  });

  it("reports a completion rate once there is enough history", () => {
    const insights = buildInsights(Array.from({ length: 5 }, () => rollup()));
    expect(insights.some((i) => i.id === "completion-rate" && i.reliable)).toBe(true);
  });

  it("surfaces a window gap worth acting on", () => {
    const days = Array.from({ length: 6 }, () =>
      rollup({ morningPlanned: 2, morningCompleted: 2, eveningPlanned: 2, eveningCompleted: 0 }),
    );
    expect(buildInsights(days).some((i) => i.id === "window-gap")).toBe(true);
  });

  it("never emits an unreliable insight alongside reliable ones", () => {
    const insights = buildInsights(Array.from({ length: 6 }, () => rollup()));
    expect(insights.every((i) => i.reliable)).toBe(true);
  });
});
