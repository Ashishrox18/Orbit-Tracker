"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Card, CardTitle, Field, Textarea } from "@/components/ui";
import { post } from "@/lib/client-api";

export interface BacklogItem {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  status: string;
  tags: string[];
}

interface Props {
  date: string;
  defaultExamMode: boolean;
  defaultAvailableMinutes: number;
  theme: string | null;
}

/**
 * Two inputs, nothing else — tasks and goals. Energy, hours and exam mode
 * come from Settings rather than being asked every morning; the scheduler
 * still uses them, they just aren't a decision the user re-makes daily.
 *
 * Only rendered before today has a plan — rebuilding an existing plan wiped
 * completed task history, which was more confusing than useful, so once a
 * plan exists this form is replaced entirely by "Add one more" on the same page.
 */
export function StartDayForm({
  date,
  defaultExamMode,
  defaultAvailableMinutes,
  theme,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [goals, setGoals] = useState("");
  const [tasks, setTasks] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const goalLines = goals
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await post<{ summary: string; unscheduledCount: number }>(
        "/api/day/start",
        {
          date,
          mainGoal: goalLines.join("; ") || undefined,
          actionItems: tasks
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 12),
          fixedCommitments: [],
          energyLevel: 3,
          availableMinutes: defaultAvailableMinutes,
          examMode: defaultExamMode,
        },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(
        res.data.summary +
          (res.data.unscheduledCount > 0
            ? ` ${res.data.unscheduledCount} task(s) didn't fit and were left unscheduled.`
            : ""),
      );
      router.refresh();
    });
  };

  return (
    <Card>
      <CardTitle hint={theme ?? undefined}>Add today&apos;s tasks and goals</CardTitle>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field label="Goals" htmlFor="goals" hint="One per line.">
              <Textarea
                id="goals"
                rows={4}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder={"Ship the report page\nStay ahead on calculus"}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Tasks" htmlFor="tasks" hint="One per line. Orbit orders them for you.">
              <Textarea
                id="tasks"
                rows={4}
                value={tasks}
                onChange={(e) => setTasks(e.target.value)}
                placeholder={"Finish the integration problem set\n35 min movement"}
              />
            </Field>
          </div>
        </div>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Building…" : "Build my day"}
        </Button>
      </form>

      <div aria-live="polite" className="mt-3">
        {result ? <p className="text-sm text-ink-soft">{result}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Yesterday's tasks that never got marked done. Habits and generated wins
 * aren't included — the planner already regenerates those fresh every day.
 */
export function BacklogCard({
  date,
  items,
  planExists,
}: {
  date: string;
  items: BacklogItem[];
  planExists: boolean;
}) {
  const router = useRouter();
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = items.filter((item) => !addedIds.includes(item.id));
  if (remaining.length === 0) return null;

  const addToday = (item: BacklogItem) => {
    setPendingId(item.id);
    setError(null);
    void post("/api/tasks", {
      date,
      title: item.title,
      category: item.category,
      estimatedMinutes: item.estimatedMinutes,
      tags: item.tags,
    }).then((res) => {
      setPendingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAddedIds((prev) => [...prev, item.id]);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardTitle hint={`${remaining.length}`}>Yesterday&apos;s leftovers</CardTitle>
      <p className="mb-3 text-sm text-ink-soft">
        {planExists
          ? "These didn't get finished yesterday. Add any of them to today."
          : "These didn't get finished yesterday — worth folding into today's tasks below."}
      </p>
      <ul className="flex flex-col gap-2">
        {remaining.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <Badge>{item.category}</Badge>
            {item.status === "skipped" ? <Badge tone="accent">skipped</Badge> : null}
            {planExists ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addToday(item)}
                disabled={pendingId === item.id}
              >
                {pendingId === item.id ? "Adding…" : "Add to today"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
