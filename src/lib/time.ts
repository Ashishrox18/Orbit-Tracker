/**
 * Time helpers. Everything here is pure and clock-arithmetic only — no Date
 * maths on user-facing times, because "09:30 + 50 minutes" must never depend
 * on a timezone or a DST rule.
 */

/** "09:30" -> 570. Returns NaN for malformed input; callers validate first. */
export function toMinutes(clock: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 570 -> "09:30". Wraps past midnight so a late plan never renders "26:00". */
export function toClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutes(clock: string, minutes: number): string {
  return toClock(toMinutes(clock) + minutes);
}

/**
 * Minutes from start to end. A sleep time earlier than the wake time means the
 * day crosses midnight, so add a full day rather than returning a negative.
 */
export function spanMinutes(start: string, end: string): number {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return b >= a ? b - a : b + 1440 - a;
}

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISODate: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISODate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** 0 = Sunday, matching Date#getDay, so it lines up with VARIATION_THEMES. */
export function weekdayIndex(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : new Date(t).getUTCDay();
}

export function formatLongDate(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function greetingFor(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
