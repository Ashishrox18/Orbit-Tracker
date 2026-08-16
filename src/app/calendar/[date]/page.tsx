import { notFound, redirect } from "next/navigation";

import { Badge, Card, CardTitle, EmptyState, LinkButton } from "@/components/ui";
import { getLocalUser } from "@/db";
import { formatLongDate } from "@/lib/time";
import { getDayDetail } from "@/services/dayDetail";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_TONE: Record<string, "physical" | "neutral" | "accent"> = {
  completed: "physical",
  skipped: "neutral",
  pending: "accent",
};

/**
 * What actually happened on one past day — the drill-down Calendar's month
 * grid points to, since a completion ratio alone can't answer "what did I do."
 */
export default async function DayDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const { date } = await params;
  if (!ISO_DATE.test(date)) notFound();

  const day = await getDayDetail(user.id, date);
  const completed = day.tasks.filter((t) => t.status === "completed").length;
  const nothingAtAll =
    !day.hasPlan &&
    day.tasks.length === 0 &&
    day.difficultiesCaptured.length === 0 &&
    day.vocabLearned.length === 0 &&
    !day.reflection;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-faint">{formatLongDate(date)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">What you did that day</h1>
        </div>
        <LinkButton href="/calendar" variant="secondary">
          ← Back to Calendar
        </LinkButton>
      </header>

      {nothingAtAll ? (
        <Card>
          <EmptyState title="Nothing recorded on this day.">
            No plan was built and nothing was logged.
          </EmptyState>
        </Card>
      ) : (
        <>
          {day.mainGoal ? (
            <Card>
              <CardTitle>Goal that day</CardTitle>
              <p className="text-sm text-ink-soft">{day.mainGoal}</p>
            </Card>
          ) : null}

          <Card>
            <CardTitle hint={day.tasks.length > 0 ? `${completed}/${day.tasks.length} done` : undefined}>
              Tasks
            </CardTitle>
            {day.tasks.length === 0 ? (
              <p className="text-sm text-ink-faint">No plan was built this day.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {day.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <time className="w-24 shrink-0 tabular-nums text-ink-faint">
                      {t.startAt && t.endAt ? `${t.startAt}–${t.endAt}` : "unscheduled"}
                    </time>
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        t.status === "completed" ? "text-ink-faint line-through" : ""
                      }`}
                    >
                      {t.title}
                    </span>
                    <Badge>{t.category}</Badge>
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                    {t.proofUrl ? (
                      <a
                        href={t.proofUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0 text-xs font-medium text-accent underline"
                      >
                        proof ↗
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {day.difficultiesCaptured.length > 0 ? (
            <Card>
              <CardTitle hint={`${day.difficultiesCaptured.length}`}>Difficulties captured</CardTitle>
              <ul className="flex flex-col gap-2">
                {day.difficultiesCaptured.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{d.topic}</span>
                    <Badge>{d.difficulty}</Badge>
                    <Badge tone={d.status === "resolved" ? "physical" : "neutral"}>{d.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {day.vocabLearned.length > 0 ? (
            <Card>
              <CardTitle hint={`${day.vocabLearned.length}`}>Words learned</CardTitle>
              <ul className="flex flex-col gap-1.5">
                {day.vocabLearned.map((v) => (
                  <li key={v.word} className="text-sm">
                    <span className="font-medium">{v.word}</span>
                    <span className="text-ink-faint"> — {v.meaning}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {day.reflection ? (
            <Card>
              <CardTitle>Reflection</CardTitle>
              <p className="text-sm text-ink-soft">{day.reflection}</p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
