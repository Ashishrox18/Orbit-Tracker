/**
 * Variation engine. Consistency without monotony: mandatory habits repeat
 * every day, but the *optional* mental work rotates on a weekly cycle so the
 * routine doesn't collapse into the same seven days forever.
 */

import { VARIATION_THEMES } from "./constants";
import { weekdayIndex } from "./time";

export function themeFor(iso: string): string {
  const index = weekdayIndex(iso) % VARIATION_THEMES.length;
  return VARIATION_THEMES[index] ?? VARIATION_THEMES[0];
}

/**
 * In exam mode the rotation collapses to revision and practice — the brief is
 * explicit that exam days must not sprout unrelated learning tasks.
 */
export function themeForMode(iso: string, mode: string): string {
  if (mode === "exam") {
    return weekdayIndex(iso) % 2 === 0 ? "Revision" : "Mock and self-test";
  }
  return themeFor(iso);
}

export function practiceTitleFor(theme: string, subject: string): string {
  switch (theme) {
    case "Deep practice":
      return `Deep practice — ${subject}`;
    case "Concept learning":
      return `Learn one new concept in ${subject}`;
    case "Problem solving":
      return `Solve 3 problems — ${subject}`;
    case "Project implementation":
      return `Build something small using ${subject}`;
    case "Revision":
      return `Revise earlier ${subject} material`;
    case "Mock and self-test":
      return `Timed self-test — ${subject}`;
    case "Review and reset":
      return `Review the week's ${subject} notes`;
    default:
      return `Practice ${subject}`;
  }
}
