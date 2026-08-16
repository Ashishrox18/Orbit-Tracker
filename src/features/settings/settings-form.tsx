"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { patch } from "@/lib/client-api";

interface Initial {
  name: string;
  wakeTime: string;
  sleepTime: string;
  dailyHours: number;
  exerciseMinutes: number;
  learningMinutes: number;
  socialFrequencyDays: number;
  examMode: boolean;
  goals: string;
  subjects: string;
  examSubjects: string;
  habits: string;
}

const toList = (raw: string) =>
  raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Initial>(key: K, value: Initial[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const res = await patch("/api/settings", {
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
        habits: toList(form.habits).map((title) => ({
          title,
          category: "habit" as const,
          durationMinutes: 20,
        })),
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("Saved. Your next plan will use these.");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Card>
        <CardTitle>Preferences</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="s-name">
            <Input id="s-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Hours available per day" htmlFor="s-hours">
            <Input
              id="s-hours"
              type="number"
              min={0.5}
              max={16}
              step={0.5}
              value={form.dailyHours}
              onChange={(e) => set("dailyHours", Number(e.target.value))}
            />
          </Field>
          <Field label="Wake time" htmlFor="s-wake">
            <Input
              id="s-wake"
              type="time"
              value={form.wakeTime}
              onChange={(e) => set("wakeTime", e.target.value)}
            />
          </Field>
          <Field label="Sleep time" htmlFor="s-sleep">
            <Input
              id="s-sleep"
              type="time"
              value={form.sleepTime}
              onChange={(e) => set("sleepTime", e.target.value)}
            />
          </Field>
          <Field label="Exercise minutes" htmlFor="s-exercise">
            <Input
              id="s-exercise"
              type="number"
              min={0}
              max={240}
              value={form.exerciseMinutes}
              onChange={(e) => set("exerciseMinutes", Number(e.target.value))}
            />
          </Field>
          <Field label="Learning minutes" htmlFor="s-learning">
            <Input
              id="s-learning"
              type="number"
              min={0}
              max={240}
              value={form.learningMinutes}
              onChange={(e) => set("learningMinutes", Number(e.target.value))}
            />
          </Field>
          <Field label="Connect with people every" htmlFor="s-social" hint="Days.">
            <Select
              id="s-social"
              value={form.socialFrequencyDays}
              onChange={(e) => set("socialFrequencyDays", Number(e.target.value))}
            >
              {[1, 2, 3, 5, 7, 14].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Focus</CardTitle>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <input
              id="s-exam"
              type="checkbox"
              checked={form.examMode}
              onChange={(e) => set("examMode", e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <label htmlFor="s-exam" className="text-sm">
              Exam mode
              <span className="block text-xs text-ink-faint">
                Default for new plans. You can still override it each morning.
              </span>
            </label>
          </div>
          <Field label="Goals" htmlFor="s-goals" hint="One per line.">
            <Textarea
              id="s-goals"
              rows={3}
              value={form.goals}
              onChange={(e) => set("goals", e.target.value)}
            />
          </Field>
          <Field label="Subjects" htmlFor="s-subjects" hint="One per line.">
            <Textarea
              id="s-subjects"
              rows={2}
              value={form.subjects}
              onChange={(e) => set("subjects", e.target.value)}
            />
          </Field>
          <Field label="Exam subjects" htmlFor="s-examsubjects" hint="One per line.">
            <Textarea
              id="s-examsubjects"
              rows={2}
              value={form.examSubjects}
              onChange={(e) => set("examSubjects", e.target.value)}
            />
          </Field>
          <Field
            label="Mandatory daily habits"
            htmlFor="s-habits"
            hint="One per line. Never dropped from a plan."
          >
            <Textarea
              id="s-habits"
              rows={3}
              value={form.habits}
              onChange={(e) => set("habits", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <div aria-live="polite">
        {message ? <p className="text-sm text-physical">{message}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
