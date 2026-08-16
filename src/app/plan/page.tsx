import { redirect } from "next/navigation";

import { DayPhaseTracker } from "@/components/day-phase-tracker";
import { Card, CardTitle, LinkButton } from "@/components/ui";
import { getLocalUser } from "@/db";
import { Timeline, AddTask } from "@/features/today/today-client";
import { BacklogCard, StartDayForm } from "@/features/plan/plan-forms";
import { formatLongDate, todayISO } from "@/lib/time";
import { getDayView, yesterdayBacklog } from "@/services/plans";

export const dynamic = "force-dynamic";

/**
 * Add tasks and goals, see the result immediately, on the same page. Marking
 * things done and attaching proof happens on Today, not here.
 */
export default async function PlanPage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const date = todayISO();
  const now = new Date();
  const nowClock = now.toTimeString().slice(0, 5);
  const [day, backlog] = await Promise.all([
    getDayView(user, date, nowClock),
    yesterdayBacklog(user.id, date),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink-faint">
            {formatLongDate(date)} · {nowClock}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Plan</h1>
        </div>
        <DayPhaseTracker current="plan" planDone={day.plan !== null} />
      </header>

      <BacklogCard date={date} items={backlog} planExists={day.plan !== null} />

      {day.plan === null ? (
        <StartDayForm
          date={date}
          defaultExamMode={user.examMode}
          defaultAvailableMinutes={Math.round(user.dailyHours * 60)}
          theme={null}
        />
      ) : (
        <>
          {day.plan.aiSummary ? (
            <p className="text-sm text-ink-soft">{day.plan.aiSummary}</p>
          ) : null}

          <Card>
            <CardTitle hint={`${day.completion.planned} tasks`}>Today&apos;s list</CardTitle>
            <Timeline
              date={date}
              mode="plan"
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

          <Card>
            <CardTitle>Add one more</CardTitle>
            <AddTask date={date} />
          </Card>

          <div className="self-start">
            <LinkButton href="/today">Go to Today →</LinkButton>
          </div>
        </>
      )}
    </div>
  );
}
