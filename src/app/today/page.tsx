import { redirect } from "next/navigation";

import { Badge, Card, CardTitle, EmptyState, LinkButton, ProgressBar } from "@/components/ui";
import { DayPhaseTracker } from "@/components/day-phase-tracker";
import { getLocalUser } from "@/db";
import { ReflectionForm, Timeline, WinCards } from "@/features/today/today-client";
import { currentThreeWinStreak } from "@/lib/behavior";
import type { WinType } from "@/lib/constants";
import { formatLongDate, todayISO } from "@/lib/time";
import { openDifficulties } from "@/services/difficulties";
import { recentRollups } from "@/services/history";
import { mindMapActivityToday } from "@/services/mindmap";
import { getDayView } from "@/services/plans";
import { getReview } from "@/services/reviews";

export const dynamic = "force-dynamic";

/**
 * Where the same tasks flow to for execution: mark them done, get asked for
 * proof right there, reflect once at the end. Adding tasks happens on Plan.
 */
export default async function TodayPage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const date = todayISO();
  const now = new Date();
  const nowClock = now.toTimeString().slice(0, 5);

  const [day, difficulties, mapActivity, review, rollups] = await Promise.all([
    getDayView(user, date, nowClock),
    openDifficulties(user.id, date),
    mindMapActivityToday(user.id, date),
    getReview(user.id, date),
    recentRollups(user.id, date, 56),
  ]);

  const mappedToday = mapActivity.nodesAdded + mapActivity.edgesAdded > 0;
  const allWinsDone =
    day.wins.length > 0 && day.wins.every((w) => w.task?.status === "completed");
  const streak = currentThreeWinStreak(rollups, date);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink-faint">
            {formatLongDate(date)} · {nowClock}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Today</h1>
        </div>
        <DayPhaseTracker current="today" planDone={day.plan !== null} />
      </header>

      {day.plan === null ? (
        <Card>
          <CardTitle>No plan yet</CardTitle>
          <EmptyState
            title="Add today's tasks and goals first."
            action={<LinkButton href="/plan">Go to Plan</LinkButton>}
          >
            Two inputs — tasks and goals — and Orbit builds the timetable.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle hint={day.plan.mode === "exam" ? <Badge tone="danger">Exam mode</Badge> : null}>
              What to do now
            </CardTitle>
            {day.next ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-medium">{day.next.title}</p>
                <p className="text-sm text-ink-faint">
                  {day.next.startAt}–{day.next.endAt}
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                Nothing scheduled ahead. Everything left is yours to pick from below.
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <ProgressBar percent={day.completion.percent} label="Today's completion" />
              <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                {day.completion.completed}/{day.completion.planned}
              </span>
            </div>
          </Card>

          <section aria-labelledby="wins-heading">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="wins-heading" className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
                Today&apos;s three wins
              </h2>
              {allWinsDone ? (
                <p role="status" className="text-sm font-medium text-streak">
                  All three landed — {streak}-day streak.
                </p>
              ) : null}
            </div>
            <WinCards
              wins={day.wins.map((w) => ({
                winType: w.winType as WinType,
                task: w.task
                  ? {
                      id: w.task.id,
                      title: w.task.title,
                      detail: w.task.detail,
                      status: w.task.status,
                      category: w.task.category,
                      winType: w.task.winType,
                      isMandatory: w.task.isMandatory,
                      estimatedMinutes: w.task.estimatedMinutes,
                      startAt: w.task.startAt,
                      endAt: w.task.endAt,
                      tags: w.task.tags,
                    }
                  : null,
              }))}
              rationale={null}
            />
          </section>

          <Card>
            <CardTitle>Mark it done</CardTitle>
            <Timeline
              date={date}
              tasks={day.tasks.map((t) => ({
                id: t.id,
                title: t.title,
                detail: t.detail,
                status: t.status,
                category: t.category,
                winType: t.winType,
                isMandatory: t.isMandatory,
                estimatedMinutes: t.estimatedMinutes,
                startAt: t.startAt,
                endAt: t.endAt,
                tags: t.tags,
              }))}
            />
          </Card>
        </>
      )}

      <Card>
        <CardTitle
          hint={mappedToday ? `${mapActivity.nodesAdded} nodes · ${mapActivity.edgesAdded} links` : undefined}
        >
          Mind map
        </CardTitle>
        {mappedToday ? (
          <p className="text-sm text-ink-soft">
            Keep going — a connection you have to retrieve later is what makes it stick.
          </p>
        ) : (
          <EmptyState title="Nothing mapped today yet.">
            Turn what you worked on into a node and a link.
          </EmptyState>
        )}
        <div className="mt-4">
          <LinkButton href="/map" variant="secondary" size="sm">
            Open mind map
          </LinkButton>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href="/difficulties" variant="secondary">
          Capture a difficulty
        </LinkButton>
        {difficulties.length > 0 ? (
          <span className="text-xs text-ink-faint">{difficulties.length} open</span>
        ) : null}
        <LinkButton href="/learn" variant="secondary">
          Today&apos;s learning card
        </LinkButton>
      </div>

      <Card>
        <CardTitle>Reflect</CardTitle>
        <ReflectionForm
          date={date}
          existingReflection={review?.learned ?? null}
          existingInsight={review?.aiInsight ?? null}
        />
      </Card>
    </div>
  );
}
