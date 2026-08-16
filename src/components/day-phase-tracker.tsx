import Link from "next/link";

/**
 * Two phases, always in the same order: add tasks, then do them. Reflection
 * and proof happen inline on the second phase, not as a third destination.
 */

export interface DayPhaseTrackerProps {
  current: "plan" | "today";
  planDone: boolean;
}

const STEPS = [
  { key: "plan", label: "Plan", href: "/plan" },
  { key: "today", label: "Today", href: "/today" },
] as const;

export function DayPhaseTracker({ current, planDone }: DayPhaseTrackerProps) {
  return (
    <nav aria-label="Day progress" className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, i) => {
        const isCurrent = step.key === current;
        const isDone = step.key === "plan" && planDone;
        return (
          <span key={step.key} className="flex items-center gap-2">
            <Link
              href={step.href}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
                isCurrent
                  ? "bg-accent text-white"
                  : isDone
                    ? "bg-physical-soft text-physical"
                    : "border border-line-strong text-ink-soft hover:border-accent"
              }`}
            >
              <span aria-hidden="true" className="text-xs">
                {isDone && !isCurrent ? "✓" : i + 1}
              </span>
              {step.label}
            </Link>
            {i < STEPS.length - 1 ? (
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
