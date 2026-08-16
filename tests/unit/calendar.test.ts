import { describe, expect, it } from "vitest";

import { daysInMonth, mondayIndex, monthGrid, monthName, shiftMonth } from "@/lib/calendar";

describe("daysInMonth", () => {
  it("knows the ordinary months", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("handles February in common and leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("applies the century rule", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("mondayIndex", () => {
  it("puts Monday first and Sunday last", () => {
    expect(mondayIndex("2026-08-10")).toBe(0); // Monday
    expect(mondayIndex("2026-08-16")).toBe(6); // Sunday
  });

  it("returns 0 for unparseable input rather than NaN", () => {
    expect(mondayIndex("nonsense")).toBe(0);
  });
});

describe("monthGrid", () => {
  it("always returns six rows of seven", () => {
    for (const month of [1, 2, 6, 12]) {
      const grid = monthGrid(2026, month);
      expect(grid).toHaveLength(6);
      for (const week of grid) expect(week).toHaveLength(7);
    }
  });

  it("starts every row on a Monday", () => {
    for (const week of monthGrid(2026, 8)) {
      expect(mondayIndex(week[0]!.date)).toBe(0);
    }
  });

  it("contains every day of the month exactly once", () => {
    const grid = monthGrid(2026, 2);
    const inMonth = grid.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(new Set(inMonth.map((c) => c.date)).size).toBe(28);
  });

  it("borrows the leading days from the previous month", () => {
    // 1 August 2026 is a Saturday, so the row starts in July.
    const first = monthGrid(2026, 8)[0]!;
    expect(first[0]?.inMonth).toBe(false);
    expect(first[0]?.date.startsWith("2026-07")).toBe(true);
  });

  it("rolls the year back across a January boundary", () => {
    const first = monthGrid(2026, 1)[0]!;
    const borrowed = first.filter((c) => !c.inMonth);
    if (borrowed.length > 0) expect(borrowed[0]?.date.startsWith("2025-12")).toBe(true);
  });

  it("rolls the year forward across a December boundary", () => {
    const trailing = monthGrid(2026, 12).flat().filter((c) => !c.inMonth && c.day < 15);
    expect(trailing.every((c) => c.date.startsWith("2027-01"))).toBe(true);
  });

  it("produces strictly consecutive dates", () => {
    const dates = monthGrid(2026, 3).flat().map((c) => Date.parse(`${c.date}T00:00:00Z`));
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i]! - dates[i - 1]!).toBe(86_400_000);
    }
  });
});

describe("shiftMonth", () => {
  it("moves within a year", () => {
    expect(shiftMonth(2026, 5, 2)).toEqual({ year: 2026, month: 7 });
  });

  it("wraps forward across December", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("wraps backward across January", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("handles multi-year jumps in both directions", () => {
    expect(shiftMonth(2026, 6, 25)).toEqual({ year: 2028, month: 7 });
    expect(shiftMonth(2026, 6, -25)).toEqual({ year: 2024, month: 5 });
  });
});

describe("monthName", () => {
  it("names the months", () => {
    expect(monthName(1)).toBe("January");
    expect(monthName(12)).toBe("December");
  });

  it("returns empty for an out-of-range month", () => {
    expect(monthName(13)).toBe("");
  });
});
