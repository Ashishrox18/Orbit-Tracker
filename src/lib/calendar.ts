/**
 * Month grid maths. Pure — no clock reads, no timezone conversion.
 *
 * Weeks start on Monday, which is what a planning calendar wants: it keeps the
 * working week intact instead of splitting it across two rows.
 */

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface MonthCell {
  date: string;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
  day: number;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday = 0 … Sunday = 6, unlike Date#getUTCDay where Sunday is 0. */
export function mondayIndex(isoDate: string): number {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  return (new Date(t).getUTCDay() + 6) % 7;
}

/**
 * Six rows of seven, always. A fixed height stops the grid jumping as you page
 * between months, which matters more than trimming an empty final row.
 */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = iso(year, month, 1);
  const lead = mondayIndex(first);
  const total = daysInMonth(year, month);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevTotal = daysInMonth(prevYear, prevMonth);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: MonthCell[] = [];

  for (let i = lead; i > 0; i -= 1) {
    const day = prevTotal - i + 1;
    cells.push({ date: iso(prevYear, prevMonth, day), inMonth: false, day });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ date: iso(year, month, day), inMonth: true, day });
  }
  let day = 1;
  while (cells.length < 42) {
    cells.push({ date: iso(nextYear, nextMonth, day), inMonth: false, day });
    day += 1;
  }

  const weeks: MonthCell[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + by;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

export function monthName(month: number): string {
  return (
    [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ][month - 1] ?? ""
  );
}
