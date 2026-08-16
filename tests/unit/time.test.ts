import { describe, expect, it } from "vitest";

import {
  addMinutes,
  daysBetween,
  formatDuration,
  shiftISO,
  spanMinutes,
  toClock,
  toMinutes,
  todayISO,
  weekdayIndex,
} from "@/lib/time";

describe("clock arithmetic", () => {
  it("parses HH:MM into minutes", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("returns NaN for malformed times rather than a silent zero", () => {
    expect(toMinutes("24:00")).toBeNaN();
    expect(toMinutes("9:30")).toBeNaN();
    expect(toMinutes("abc")).toBeNaN();
  });

  it("formats minutes back to a zero-padded clock", () => {
    expect(toClock(0)).toBe("00:00");
    expect(toClock(570)).toBe("09:30");
  });

  it("wraps past midnight instead of rendering 26:00", () => {
    expect(toClock(1440)).toBe("00:00");
    expect(toClock(1560)).toBe("02:00");
    expect(toClock(-60)).toBe("23:00");
  });

  it("adds minutes across the hour boundary", () => {
    expect(addMinutes("09:50", 20)).toBe("10:10");
    expect(addMinutes("23:30", 45)).toBe("00:15");
  });
});

describe("spanMinutes", () => {
  it("measures a normal waking day", () => {
    expect(spanMinutes("07:00", "23:00")).toBe(960);
  });

  it("handles a day that crosses midnight", () => {
    expect(spanMinutes("22:00", "06:00")).toBe(480);
  });

  it("returns 0 for unparseable input", () => {
    expect(spanMinutes("nope", "06:00")).toBe(0);
  });
});

describe("calendar helpers", () => {
  it("formats a date as ISO without timezone drift", () => {
    expect(todayISO(new Date(2026, 7, 11, 23, 30))).toBe("2026-08-11");
  });

  it("shifts dates across month boundaries", () => {
    expect(shiftISO("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts days between dates in both directions", () => {
    expect(daysBetween("2026-08-01", "2026-08-11")).toBe(10);
    expect(daysBetween("2026-08-11", "2026-08-01")).toBe(-10);
    expect(daysBetween("2026-08-11", "2026-08-11")).toBe(0);
  });

  it("maps a date to a weekday index", () => {
    expect(weekdayIndex("2026-08-09")).toBe(0); // Sunday
    expect(weekdayIndex("2026-08-11")).toBe(2); // Tuesday
  });
});

describe("formatDuration", () => {
  it("renders minutes, hours and mixed durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(95)).toBe("1 hr 35 min");
  });
});
