import { daysBetween, shiftISO } from "./time";

/**
 * Date ranges and chart-bucketing for the exported growth report. Pure and
 * deterministic — no DB access — so the same range always resolves to the
 * same days regardless of when or where it's called.
 */

export const RANGE_PRESETS = ["week", "month", "quarter", "6months", "year"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

const PRESET_DAYS_BACK: Record<RangePreset, number> = {
  week: 6,
  month: 29,
  quarter: 89,
  "6months": 181,
  year: 364,
};

const PRESET_LABELS: Record<RangePreset, string> = {
  week: "Last 7 days",
  month: "Last 30 days",
  quarter: "Last 3 months",
  "6months": "Last 6 months",
  year: "Last 12 months",
};

export function resolvePreset(preset: RangePreset, today: string): DateRange {
  return { from: shiftISO(today, -PRESET_DAYS_BACK[preset]), to: today, label: PRESET_LABELS[preset] };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPreset(value: string | undefined): value is RangePreset {
  return value !== undefined && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** A valid preset wins; otherwise a valid custom from/to; otherwise "month". */
export function resolveRange(
  params: { preset?: string; from?: string; to?: string },
  today: string,
): DateRange {
  if (isPreset(params.preset)) return resolvePreset(params.preset, today);

  if (
    params.from &&
    params.to &&
    ISO_DATE.test(params.from) &&
    ISO_DATE.test(params.to) &&
    params.from <= params.to
  ) {
    return { from: params.from, to: params.to, label: "Custom range" };
  }

  return resolvePreset("month", today);
}

export type BucketGrain = "day" | "week" | "month";

export interface Bucket {
  start: string;
  end: string;
  label: string;
}

/** Short ranges read day-by-day; long ones would render an unreadable chart at that grain. */
export function bucketGrainFor(from: string, to: string): BucketGrain {
  const days = daysBetween(from, to);
  if (days <= 31) return "day";
  if (days <= 200) return "week";
  return "month";
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] ?? ""} ${Number(d)}`;
}

function buildDayBuckets(from: string, to: string): Bucket[] {
  const buckets: Bucket[] = [];
  let d = from;
  while (d <= to) {
    buckets.push({ start: d, end: d, label: shortDate(d) });
    d = shiftISO(d, 1);
  }
  return buckets;
}

function buildWeekBuckets(from: string, to: string): Bucket[] {
  const buckets: Bucket[] = [];
  let start = from;
  while (start <= to) {
    const naiveEnd = shiftISO(start, 6);
    const end = naiveEnd > to ? to : naiveEnd;
    buckets.push({ start, end, label: shortDate(start) });
    start = shiftISO(end, 1);
  }
  return buckets;
}

function buildMonthBuckets(from: string, to: string): Bucket[] {
  const buckets: Bucket[] = [];
  const parts = from.split("-").map(Number);
  let y = parts[0] ?? 1970;
  let m = parts[1] ?? 1;

  while (true) {
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const start = monthStart > from ? monthStart : from;
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const firstOfNext = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
    const lastOfMonth = shiftISO(firstOfNext, -1);
    const end = lastOfMonth < to ? lastOfMonth : to;

    buckets.push({ start, end, label: `${MONTHS_SHORT[m - 1] ?? ""} ${y}` });
    if (end >= to) break;
    y = nextY;
    m = nextM;
  }
  return buckets;
}

export function buildBuckets(from: string, to: string, grain: BucketGrain): Bucket[] {
  if (grain === "day") return buildDayBuckets(from, to);
  if (grain === "week") return buildWeekBuckets(from, to);
  return buildMonthBuckets(from, to);
}
