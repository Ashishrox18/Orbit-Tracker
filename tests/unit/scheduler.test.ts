import { describe, expect, it } from "vitest";

import {
  buildSchedule,
  freeIntervals,
  nextBlock,
  orderTasks,
  type SchedulableTask,
  type ScheduleRequest,
} from "@/lib/scheduler";
import { toMinutes } from "@/lib/time";

const t = (over: Partial<SchedulableTask> = {}): SchedulableTask => ({
  id: "1",
  title: "Task",
  estimatedMinutes: 30,
  priority: 3,
  isMandatory: false,
  winType: null,
  ...over,
});

const request = (over: Partial<ScheduleRequest> = {}): ScheduleRequest => ({
  wakeTime: "07:00",
  sleepTime: "23:00",
  availableMinutes: 480,
  energyLevel: 3,
  loadFactor: 1,
  tasks: [],
  commitments: [],
  ...over,
});

describe("freeIntervals", () => {
  it("returns the whole day when nothing is committed", () => {
    const free = freeIntervals("07:00", "23:00", []);
    expect(free).toHaveLength(1);
    expect(free[0]).toEqual({ start: 0, end: 960 });
  });

  it("splits the day around a commitment", () => {
    const free = freeIntervals("07:00", "23:00", [
      { title: "Class", startAt: "10:00", durationMinutes: 60 },
    ]);
    expect(free).toHaveLength(2);
    expect(free[0]?.end).toBe(180);
    expect(free[1]?.start).toBe(240);
  });

  it("merges overlapping commitments rather than double-blocking", () => {
    const free = freeIntervals("07:00", "23:00", [
      { title: "A", startAt: "10:00", durationMinutes: 60 },
      { title: "B", startAt: "10:30", durationMinutes: 60 },
    ]);
    expect(free).toHaveLength(2);
    expect(free[1]?.start).toBe(270); // 11:30
  });

  it("discards slivers too short to hold anything", () => {
    const free = freeIntervals("07:00", "08:00", [
      { title: "A", startAt: "07:05", durationMinutes: 55 },
    ]);
    expect(free).toHaveLength(0);
  });
});

describe("orderTasks", () => {
  it("puts mandatory habits before everything else", () => {
    const ordered = orderTasks([
      t({ id: "a", priority: 1 }),
      t({ id: "b", isMandatory: true, priority: 5 }),
    ]);
    expect(ordered[0]?.id).toBe("b");
  });

  it("orders by priority within the same tier", () => {
    const ordered = orderTasks([t({ id: "a", priority: 4 }), t({ id: "b", priority: 2 })]);
    expect(ordered.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("prefers win tasks over filler at equal priority", () => {
    const ordered = orderTasks([
      t({ id: "filler", priority: 3 }),
      t({ id: "win", priority: 3, winType: "mental" }),
    ]);
    expect(ordered[0]?.id).toBe("win");
  });

  it("is stable for otherwise identical tasks", () => {
    const ordered = orderTasks([t({ id: "first" }), t({ id: "second" })]);
    expect(ordered.map((x) => x.id)).toEqual(["first", "second"]);
  });
});

describe("buildSchedule", () => {
  it("places tasks in non-overlapping ascending blocks", () => {
    const result = buildSchedule(
      request({ tasks: [t({ id: "1" }), t({ id: "2" }), t({ id: "3" })] }),
    );
    const times = result.blocks.map((b) => toMinutes(b.startAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    for (let i = 1; i < result.blocks.length; i += 1) {
      const prev = result.blocks[i - 1]!;
      const curr = result.blocks[i]!;
      expect(toMinutes(curr.startAt)).toBeGreaterThanOrEqual(toMinutes(prev.endAt));
    }
  });

  it("opens the day with a setup buffer rather than work", () => {
    const result = buildSchedule(request({ tasks: [t()] }));
    expect(result.blocks[0]?.kind).toBe("buffer");
  });

  it("inserts breaks instead of scheduling straight through", () => {
    const result = buildSchedule(
      request({ tasks: Array.from({ length: 6 }, (_, i) => t({ id: String(i), estimatedMinutes: 45 })) }),
    );
    expect(result.blocks.some((b) => b.kind === "break")).toBe(true);
  });

  it("schedules mandatory habits even when capacity is exhausted", () => {
    const result = buildSchedule(
      request({
        availableMinutes: 60,
        loadFactor: 0.6,
        tasks: [
          t({ id: "big", estimatedMinutes: 200 }),
          t({ id: "habit", estimatedMinutes: 20, isMandatory: true }),
        ],
      }),
    );
    expect(result.blocks.some((b) => b.taskId === "habit")).toBe(true);
    expect(result.unscheduled.map((x) => x.id)).toContain("big");
  });

  it("drops optional work past capacity rather than overfilling the day", () => {
    const result = buildSchedule(
      request({
        availableMinutes: 120,
        tasks: Array.from({ length: 10 }, (_, i) => t({ id: String(i), estimatedMinutes: 60 })),
      }),
    );
    expect(result.unscheduled.length).toBeGreaterThan(0);
    expect(result.scheduledMinutes).toBeLessThanOrEqual(result.capacityMinutes);
  });

  it("applies the load factor so poor completion shrinks the plan", () => {
    const full = buildSchedule(
      request({ loadFactor: 1, tasks: Array.from({ length: 8 }, (_, i) => t({ id: String(i) })) }),
    );
    const reduced = buildSchedule(
      request({ loadFactor: 0.6, tasks: Array.from({ length: 8 }, (_, i) => t({ id: String(i) })) }),
    );
    expect(reduced.capacityMinutes).toBeLessThan(full.capacityMinutes);
  });

  it("works around fixed commitments", () => {
    const result = buildSchedule(
      request({
        tasks: [t({ id: "1", estimatedMinutes: 60 })],
        commitments: [{ title: "Class", startAt: "07:20", durationMinutes: 120 }],
      }),
    );
    const work = result.blocks.find((b) => b.taskId === "1");
    expect(work).toBeDefined();
    expect(toMinutes(work!.startAt)).toBeGreaterThanOrEqual(toMinutes("09:20"));
  });

  it("shortens work stretches when energy is low", () => {
    const tasks = Array.from({ length: 4 }, (_, i) => t({ id: String(i), estimatedMinutes: 40 }));
    const tired = buildSchedule(request({ energyLevel: 1, tasks }));
    const sharp = buildSchedule(request({ energyLevel: 5, tasks }));
    const breaks = (r: { blocks: { kind: string }[] }) =>
      r.blocks.filter((b) => b.kind === "break").length;
    expect(breaks(tired)).toBeGreaterThanOrEqual(breaks(sharp));
  });

  it("returns everything unscheduled when there is no usable window", () => {
    const result = buildSchedule(
      request({
        wakeTime: "07:00",
        sleepTime: "07:10",
        tasks: [t()],
      }),
    );
    expect(result.unscheduled).toHaveLength(1);
    expect(result.blocks).toHaveLength(0);
  });
});

describe("nextBlock", () => {
  const blocks = [
    { startAt: "09:00", endAt: "09:30", title: "A", kind: "task" as const, taskId: "a", winType: null, isMandatory: false },
    { startAt: "10:00", endAt: "11:00", title: "B", kind: "task" as const, taskId: "b", winType: null, isMandatory: false },
  ];

  it("returns the block currently in progress", () => {
    expect(nextBlock(blocks, "09:15")?.title).toBe("A");
  });

  it("returns the next upcoming block when between blocks", () => {
    expect(nextBlock(blocks, "09:45")?.title).toBe("B");
  });

  it("returns null once the day is over", () => {
    expect(nextBlock(blocks, "23:00")).toBeNull();
  });

  it("ignores breaks when choosing what to do next", () => {
    const withBreak = [
      { startAt: "09:00", endAt: "09:10", title: "Break", kind: "break" as const, taskId: null, winType: null, isMandatory: false },
      ...blocks,
    ];
    expect(nextBlock(withBreak, "09:05")?.title).toBe("A");
  });
});
