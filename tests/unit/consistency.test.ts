import { describe, expect, it } from "vitest";

import type { DailyRollup } from "@/lib/behavior";
import { painPoints, reportSummary, streakFrom, streaks, type PainInput } from "@/lib/consistency";

const TODAY = "2026-08-11";

const rollup = (date: string, over: Partial<DailyRollup> = {}): DailyRollup => ({
  date,
  plannedCount: 4,
  completedCount: 3,
  skippedCount: 1,
  plannedMinutes: 120,
  actualMinutes: 120,
  morningPlanned: 2,
  morningCompleted: 2,
  eveningPlanned: 2,
  eveningCompleted: 1,
  threeWins: false,
  ...over,
});

/** Consecutive dates ending at TODAY. */
const runTo = (days: number, end = TODAY) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });

describe("streakFrom", () => {
  it("returns zeros for no qualifying days", () => {
    expect(streakFrom([], TODAY)).toEqual({ current: 0, longest: 0, lastQualifyingDate: null });
  });

  it("counts an unbroken run ending today", () => {
    expect(streakFrom(runTo(5), TODAY).current).toBe(5);
  });

  it("does not break the streak just because today is not done yet", () => {
    // A morning check-in must not show yesterday's work as already lost.
    const throughYesterday = runTo(4, "2026-08-10");
    expect(streakFrom(throughYesterday, TODAY).current).toBe(4);
  });

  it("breaks when a day is missed", () => {
    expect(streakFrom(["2026-08-11", "2026-08-09", "2026-08-08"], TODAY).current).toBe(1);
  });

  it("finds the longest historical run, not just the current one", () => {
    const days = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-08-11"];
    const result = streakFrom(days, TODAY);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(4);
  });

  it("ignores duplicate dates", () => {
    expect(streakFrom(["2026-08-11", "2026-08-11", "2026-08-10"], TODAY).current).toBe(2);
  });

  it("reports the last qualifying date", () => {
    expect(streakFrom(["2026-08-01", "2026-08-09"], TODAY).lastQualifyingDate).toBe("2026-08-09");
  });

  it("is zero when the last qualifying day is too old", () => {
    expect(streakFrom(["2026-07-01"], TODAY).current).toBe(0);
  });
});

describe("streaks", () => {
  it("tracks the three independently", () => {
    const rollups = runTo(4).map((d, i) => rollup(d, { threeWins: i >= 2 }));
    const result = streaks(rollups, [TODAY], TODAY);

    expect(result.activity.current).toBe(4);
    expect(result.threeWins.current).toBe(2);
    expect(result.evidence.current).toBe(1);
  });

  it("does not count a day with no completions as activity", () => {
    const rollups = runTo(3).map((d, i) => rollup(d, { completedCount: i === 1 ? 0 : 2 }));
    expect(streaks(rollups, [], TODAY).activity.current).toBe(1);
  });

  it("keeps the evidence streak independent of task completion", () => {
    const rollups = runTo(3).map((d) => rollup(d, { completedCount: 0 }));
    expect(streaks(rollups, runTo(3), TODAY).evidence.current).toBe(3);
    expect(streaks(rollups, runTo(3), TODAY).activity.current).toBe(0);
  });
});

describe("painPoints", () => {
  const base = (over: Partial<PainInput> = {}): PainInput => ({
    rollups: runTo(10).map((d) => rollup(d)),
    recurringDifficulties: [],
    taskOutcomes: [],
    evidenceDates: runTo(10),
    today: TODAY,
    ...over,
  });

  it("refuses to draw conclusions from too little data", () => {
    const result = painPoints(base({ rollups: [rollup("2026-08-10")] }));
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("insufficient");
  });

  it("names the category you actually skip", () => {
    const outcomes = [
      ...Array.from({ length: 5 }, () => ({ category: "emotional", status: "skipped" })),
      ...Array.from({ length: 5 }, () => ({ category: "emotional", status: "completed" })),
      ...Array.from({ length: 6 }, () => ({ category: "mental", status: "completed" })),
    ];
    const found = painPoints(base({ taskOutcomes: outcomes })).find(
      (p) => p.id === "skipped-category",
    );
    expect(found?.finding).toContain("emotional");
    expect(found?.finding).toContain("50%");
  });

  it("ignores a category with too few samples to be a pattern", () => {
    const outcomes = [
      { category: "physical", status: "skipped" },
      { category: "physical", status: "completed" },
    ];
    expect(
      painPoints(base({ taskOutcomes: outcomes })).some((p) => p.id === "skipped-category"),
    ).toBe(false);
  });

  it("flags a topic that survives repeated attempts", () => {
    const found = painPoints(
      base({ recurringDifficulties: [{ topic: "Integration by parts", attempts: 4 }] }),
    ).find((p) => p.id === "recurring-difficulty");
    expect(found?.severity).toBe("high");
    expect(found?.finding).toContain("Integration by parts");
  });

  it("ignores a difficulty attempted only once", () => {
    expect(
      painPoints(base({ recurringDifficulties: [{ topic: "x", attempts: 1 }] })).some(
        (p) => p.id === "recurring-difficulty",
      ),
    ).toBe(false);
  });

  it("spots a weekday that keeps breaking the streak", () => {
    // Misses land on consecutive Sundays.
    const dates = runTo(28);
    const rollups = dates.map((d) => {
      const isSunday = new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay() === 0;
      return rollup(d, { completedCount: isSunday ? 0 : 3 });
    });
    const found = painPoints(base({ rollups })).find((p) => p.id === "break-weekday");
    expect(found?.finding).toContain("Sunday");
  });

  it("flags working days with nothing to show for them", () => {
    const found = painPoints(base({ evidenceDates: [] })).find((p) => p.id === "evidence-gap");
    expect(found?.severity).toBe("high");
    expect(found?.finding).toContain("no evidence");
  });

  it("does not flag an evidence gap when most days are documented", () => {
    expect(painPoints(base()).some((p) => p.id === "evidence-gap")).toBe(false);
  });

  it("calls out persistent overplanning", () => {
    const rollups = runTo(10).map((d) => rollup(d, { plannedCount: 10, completedCount: 3 }));
    const found = painPoints(base({ rollups })).find((p) => p.id === "overplanning");
    expect(found?.finding).toContain("30%");
  });

  it("says so plainly when nothing is wrong", () => {
    const result = painPoints(base());
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("none");
  });

  it("sorts the worst problems first", () => {
    const result = painPoints(
      base({
        evidenceDates: [],
        recurringDifficulties: [{ topic: "x", attempts: 2 }],
      }),
    );
    expect(result[0]?.severity).toBe("high");
  });
});

describe("reportSummary", () => {
  it("aggregates the headline figures", () => {
    const rollups = runTo(5).map((d) => rollup(d, { plannedCount: 4, completedCount: 2 }));
    const summary = reportSummary(
      rollups,
      [
        { date: TODAY, kind: "link" },
        { date: TODAY, kind: "reflection" },
      ],
      "2026-08-07",
      TODAY,
    );

    expect(summary.daysTracked).toBe(5);
    expect(summary.activeDays).toBe(5);
    expect(summary.plannedTasks).toBe(20);
    expect(summary.completedTasks).toBe(10);
    expect(summary.completionRate).toBe(0.5);
  });

  it("separates verifiable evidence from self-reported", () => {
    const summary = reportSummary(
      [],
      [
        { date: TODAY, kind: "link" },
        { date: TODAY, kind: "file" },
        { date: TODAY, kind: "metric" },
        { date: TODAY, kind: "reflection" },
      ],
      TODAY,
      TODAY,
    );
    expect(summary.evidenceCount).toBe(4);
    // A reader should be able to see how much of this they can check.
    expect(summary.verifiableCount).toBe(2);
  });

  it("returns a null rate rather than zero when nothing was planned", () => {
    expect(reportSummary([], [], TODAY, TODAY).completionRate).toBeNull();
  });
});
