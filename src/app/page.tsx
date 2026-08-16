import { redirect } from "next/navigation";

import { Card, CardTitle, LinkButton, Stat } from "@/components/ui";
import { DayPhaseTracker } from "@/components/day-phase-tracker";
import { getLocalUser } from "@/db";
import { StreakCard } from "@/features/home/streak-card";
import { currentThreeWinStreak, longestThreeWinStreak, threeWinStreak } from "@/lib/behavior";
import { formatLongDate, greetingFor, todayISO } from "@/lib/time";
import { listEvidence } from "@/services/evidence";
import { openDifficulties } from "@/services/difficulties";
import { recentRollups } from "@/services/history";
import { mindMapActivityToday } from "@/services/mindmap";
import { getDayView } from "@/services/plans";

export const dynamic = "force-dynamic";

const STREAK_WINDOW_DAYS = 56;

/**
 * Home is a hub, not a workspace. It greets you and hands you one clear next
 * action — the detail all lives on Plan or Today so this page never has to
 * compete with itself for attention.
 */
export default async function HomePage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const date = todayISO();
  const nowClock = new Date().toTimeString().slice(0, 5);

  const [day, difficulties, evidence, mapActivity, rollups] = await Promise.all([
    getDayView(user, date, nowClock),
    openDifficulties(user.id, date),
    listEvidence(user.id, date, date),
    mindMapActivityToday(user.id, date),
    recentRollups(user.id, date, STREAK_WINDOW_DAYS),
  ]);

  const firstName = user.name.split(" ")[0] ?? user.name;

  const streak = currentThreeWinStreak(rollups, date);
  const longest = longestThreeWinStreak(rollups);
  const todayDone = rollups.find((r) => r.date === date)?.threeWins ?? false;
  const historicStreak = threeWinStreak(rollups.filter((r) => r.date !== date));
  const atRisk = historicStreak > 0 && !todayDone;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink-faint">{formatLongDate(date)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greetingFor()}, {firstName}.
          </h1>
        </div>
        <DayPhaseTracker current={day.plan === null ? "plan" : "today"} planDone={day.plan !== null} />
      </header>

      <StreakCard
        streak={streak}
        longest={longest}
        atRisk={atRisk}
        todayDone={todayDone}
        rollups={rollups}
      />

      {day.plan === null ? (
        <Card>
          <CardTitle>Let&apos;s plan your day</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            Add your tasks and goals — Orbit builds the timetable and picks your three wins.
          </p>
          <LinkButton href="/plan">Start planning →</LinkButton>
        </Card>
      ) : (
        <Card>
          <CardTitle hint={`${day.completion.completed}/${day.completion.planned} done`}>
            Your day so far
          </CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            {day.next
              ? `Next up: ${day.next.title}, ${day.next.startAt}–${day.next.endAt}.`
              : "Nothing scheduled ahead — pick from your timeline."}
          </p>
          <LinkButton href="/today">Continue your day →</LinkButton>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open difficulties" value={String(difficulties.length)} />
        <Stat label="Evidence today" value={String(evidence.length)} />
        <Stat
          label="Mind map today"
          value={String(mapActivity.nodesAdded + mapActivity.edgesAdded)}
        />
      </div>
    </div>
  );
}
