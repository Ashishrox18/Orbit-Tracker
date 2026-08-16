"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { post } from "@/lib/client-api";
import { TASK_CATEGORIES } from "@/lib/constants";

/**
 * Onboarding asks only what the planner actually consumes. Every field here
 * feeds a specific decision — nothing is collected "for later".
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    wakeTime: "07:00",
    sleepTime: "23:00",
    dailyHours: 6,
    exerciseMinutes: 30,
    learningMinutes: 45,
    socialFrequencyDays: 3,
    examMode: false,
    goals: "",
    subjects: "",
    examSubjects: "",
    habits: "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toList = (raw: string) =>
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const habits = toList(form.habits).map((title) => ({
      title,
      category: "habit" as (typeof TASK_CATEGORIES)[number],
      durationMinutes: 20,
    }));

    startTransition(async () => {
      const result = await post("/api/onboarding", {
        name: form.name.trim(),
        wakeTime: form.wakeTime,
        sleepTime: form.sleepTime,
        dailyHours: Number(form.dailyHours),
        exerciseMinutes: Number(form.exerciseMinutes),
        learningMinutes: Number(form.learningMinutes),
        socialFrequencyDays: Number(form.socialFrequencyDays),
        examMode: form.examMode,
        goals: toList(form.goals),
        subjects: toList(form.subjects),
        examSubjects: toList(form.examSubjects),
        habits,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Set up Orbit</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Six answers. Everything is editable later in Settings.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <Card>
          <fieldset>
            <legend className="mb-4 text-sm font-semibold tracking-wide text-ink-soft uppercase">
              About you
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What should Orbit call you?" htmlFor="name">
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Hours you can actually use each day" htmlFor="dailyHours">
                <Input
                  id="dailyHours"
                  type="number"
                  min={0.5}
                  max={16}
                  step={0.5}
                  value={form.dailyHours}
                  onChange={(e) => set("dailyHours", Number(e.target.value))}
                />
              </Field>
              <Field label="Typical wake-up" htmlFor="wakeTime">
                <Input
                  id="wakeTime"
                  type="time"
                  value={form.wakeTime}
                  onChange={(e) => set("wakeTime", e.target.value)}
                />
              </Field>
              <Field label="Typical sleep" htmlFor="sleepTime">
                <Input
                  id="sleepTime"
                  type="time"
                  value={form.sleepTime}
                  onChange={(e) => set("sleepTime", e.target.value)}
                />
              </Field>
            </div>
          </fieldset>
        </Card>

        <Card>
          <fieldset>
            <legend className="mb-4 text-sm font-semibold tracking-wide text-ink-soft uppercase">
              What you&apos;re working on
            </legend>
            <div className="flex flex-col gap-4">
              <Field label="Primary goals" htmlFor="goals" hint="One per line.">
                <Textarea
                  id="goals"
                  rows={3}
                  value={form.goals}
                  onChange={(e) => set("goals", e.target.value)}
                  placeholder={"Get fit\nShip my project"}
                />
              </Field>
              <Field
                label="Subjects or skills you're learning"
                htmlFor="subjects"
                hint="One per line. The first one is used most."
              >
                <Textarea
                  id="subjects"
                  rows={2}
                  value={form.subjects}
                  onChange={(e) => set("subjects", e.target.value)}
                  placeholder={"Mathematics\nProgramming"}
                />
              </Field>
            </div>
          </fieldset>
        </Card>

        <Card>
          <fieldset>
            <legend className="mb-4 text-sm font-semibold tracking-wide text-ink-soft uppercase">
              Exams
            </legend>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <input
                  id="examMode"
                  type="checkbox"
                  checked={form.examMode}
                  onChange={(e) => set("examMode", e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <label htmlFor="examMode" className="text-sm">
                  I&apos;m currently preparing for an exam
                  <span className="block text-xs text-ink-faint">
                    Exam mode prioritises preparation, difficult topics, revision and recovery,
                    and stops Orbit inventing unrelated learning tasks.
                  </span>
                </label>
              </div>
              {form.examMode ? (
                <Field label="Exam subjects" htmlFor="examSubjects" hint="One per line.">
                  <Textarea
                    id="examSubjects"
                    rows={2}
                    value={form.examSubjects}
                    onChange={(e) => set("examSubjects", e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          </fieldset>
        </Card>

        <Card>
          <fieldset>
            <legend className="mb-4 text-sm font-semibold tracking-wide text-ink-soft uppercase">
              Daily shape
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preferred exercise" htmlFor="exerciseMinutes" hint="Minutes.">
                <Input
                  id="exerciseMinutes"
                  type="number"
                  min={0}
                  max={240}
                  value={form.exerciseMinutes}
                  onChange={(e) => set("exerciseMinutes", Number(e.target.value))}
                />
              </Field>
              <Field label="Preferred learning block" htmlFor="learningMinutes" hint="Minutes.">
                <Input
                  id="learningMinutes"
                  type="number"
                  min={0}
                  max={240}
                  value={form.learningMinutes}
                  onChange={(e) => set("learningMinutes", Number(e.target.value))}
                />
              </Field>
              <Field
                label="Connect with people every"
                htmlFor="socialFrequencyDays"
                hint="Days. Drives the emotional win."
              >
                <Select
                  id="socialFrequencyDays"
                  value={form.socialFrequencyDays}
                  onChange={(e) => set("socialFrequencyDays", Number(e.target.value))}
                >
                  {[1, 2, 3, 5, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? "day" : "days"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Mandatory daily habits"
                htmlFor="habits"
                hint="One per line. These are never dropped from a plan."
              >
                <Textarea
                  id="habits"
                  rows={3}
                  value={form.habits}
                  onChange={(e) => set("habits", e.target.value)}
                  placeholder={"Morning walk\nRead 20 minutes"}
                />
              </Field>
            </div>
          </fieldset>
        </Card>

        <div aria-live="polite">
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Finish setup"}
        </Button>
      </form>
    </div>
  );
}
