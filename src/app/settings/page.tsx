import { redirect } from "next/navigation";

import { Card, CardTitle } from "@/components/ui";
import { db, getLocalUser } from "@/db";
import { habits } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SettingsForm } from "@/features/settings/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const habitRows = await db.select().from(habits).where(eq(habits.userId, user.id));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Changes apply to the next plan you build, not to today&apos;s existing timetable.
        </p>
      </header>

      <SettingsForm
        initial={{
          name: user.name,
          wakeTime: user.wakeTime,
          sleepTime: user.sleepTime,
          dailyHours: user.dailyHours,
          exerciseMinutes: user.exerciseMinutes,
          learningMinutes: user.learningMinutes,
          socialFrequencyDays: user.socialFrequencyDays,
          examMode: user.examMode,
          goals: user.goals.join("\n"),
          subjects: user.subjects.join("\n"),
          examSubjects: user.examSubjects.join("\n"),
          habits: habitRows.map((h) => h.title).join("\n"),
        }}
      />

      <Card>
        <CardTitle>What Orbit sends to Groq</CardTitle>
        <p className="text-sm text-ink-soft">
          Your first name, today&apos;s mode, energy and available time, the three win titles, up
          to three open difficulty topics, and up to three already-computed insight sentences.
          Never your reviews, reflections, learning answers or history beyond those summaries.
          Scheduling, streaks and every percentage are computed locally and never sent.
        </p>
      </Card>
    </div>
  );
}
