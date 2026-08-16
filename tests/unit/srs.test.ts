import { describe, expect, it } from "vitest";

import { NEW_ITEM, queueStats, retentionRate, schedule, selectDue } from "@/lib/srs";

const TODAY = "2026-08-11";

describe("SM-2 scheduling", () => {
  it("sends a new item one day out on the first pass", () => {
    const r = schedule(NEW_ITEM, "good", TODAY);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
    expect(r.due).toBe("2026-08-12");
  });

  it("uses the classic 1 then 6 day ladder", () => {
    const first = schedule(NEW_ITEM, "good", TODAY);
    const second = schedule(first, "good", "2026-08-12");
    expect(second.intervalDays).toBe(6);
  });

  it("expands by the ease factor from the third repetition", () => {
    let state = schedule(NEW_ITEM, "good", TODAY);
    state = schedule(state, "good", TODAY);
    const third = schedule(state, "good", TODAY);
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it("resets the interval and counts a lapse on 'again'", () => {
    let state = schedule(NEW_ITEM, "good", TODAY);
    state = schedule(state, "good", TODAY);
    const lapsed = schedule(state, "again", TODAY);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.lapses).toBe(1);
  });

  it("never drops the ease factor below the 1.3 floor", () => {
    let state = NEW_ITEM;
    for (let i = 0; i < 20; i += 1) state = schedule(state, "again", TODAY);
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("grows the interval less for 'hard' than for 'good'", () => {
    let base = schedule(NEW_ITEM, "good", TODAY);
    base = schedule(base, "good", TODAY);
    expect(schedule(base, "hard", TODAY).intervalDays).toBeLessThan(
      schedule(base, "good", TODAY).intervalDays,
    );
  });

  it("raises the ease factor on 'easy' and lowers it on 'hard'", () => {
    expect(schedule(NEW_ITEM, "easy", TODAY).easeFactor).toBeGreaterThan(2.5);
    expect(schedule(NEW_ITEM, "hard", TODAY).easeFactor).toBeLessThan(2.5);
  });

  it("caps the interval at a year", () => {
    let state = { repetitions: 10, intervalDays: 300, easeFactor: 2.5, lapses: 0 };
    state = schedule(state, "easy", TODAY);
    expect(state.intervalDays).toBeLessThanOrEqual(365);
  });
});

describe("review queue selection", () => {
  const item = (id: string, due: string, lapses = 0, intervalDays = 1) => ({
    id,
    kind: "vocab",
    due,
    lapses,
    intervalDays,
  });

  it("returns only items that are actually due", () => {
    const due = selectDue([item("a", "2026-08-10"), item("b", "2026-08-20")], TODAY);
    expect(due.map((d) => d.id)).toEqual(["a"]);
  });

  it("includes items due exactly today", () => {
    expect(selectDue([item("a", TODAY)], TODAY)).toHaveLength(1);
  });

  it("puts the most overdue first", () => {
    const due = selectDue([item("a", "2026-08-10"), item("b", "2026-08-01")], TODAY);
    expect(due.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("breaks ties toward the most-forgotten item", () => {
    const due = selectDue([item("a", TODAY, 0), item("b", TODAY, 4)], TODAY);
    expect(due[0]?.id).toBe("b");
  });

  it("respects the session limit", () => {
    const many = Array.from({ length: 50 }, (_, i) => item(String(i), TODAY));
    expect(selectDue(many, TODAY, 20)).toHaveLength(20);
  });

  it("counts due, learning and mature items", () => {
    const stats = queueStats(
      [item("a", TODAY, 0, 1), item("b", "2026-09-01", 0, 30), item("c", TODAY, 0, 5)],
      TODAY,
    );
    expect(stats).toEqual({ due: 2, learning: 2, mature: 1, total: 3 });
  });

  it("withholds a retention rate until there is enough history", () => {
    expect(retentionRate([{ repetitions: 3, lapses: 0 }])).toBeNull();
  });

  it("computes retention once there is", () => {
    const items = Array.from({ length: 6 }, () => ({ repetitions: 3, lapses: 1 }));
    expect(retentionRate(items)).toBeCloseTo(0.75, 2);
  });
});
