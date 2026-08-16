"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Field, Input } from "@/components/ui";
import { post } from "@/lib/client-api";
import { formatDuration } from "@/lib/time";

interface Suggestion {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  rationale: string | null;
}

/**
 * Type a rough intention, get the concrete tasks it implies.
 *
 * Everything shown is pre-ticked: the common case is "yes, mostly". Whatever
 * you untick is recorded as a rejection, which is how the suggestions learn
 * your phrasing and sizing — silence has to count as a signal or the system
 * only ever hears agreement.
 */
export function SuggestTasks({
  date,
  learned,
}: {
  date: string;
  learned: { decided: number; accepted: number };
}) {
  const router = useRouter();
  const [intent, setIntent] = useState("");
  const [batch, setBatch] = useState<Suggestion[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [aiUsed, setAiUsed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggest = (event: React.FormEvent) => {
    event.preventDefault();
    if (intent.trim().length < 2) {
      setError("Say what you want to do.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res = await post<{ suggestions: Suggestion[]; aiUsed: boolean }>(
        "/api/tasks/suggest",
        { action: "suggest", intent: intent.trim() },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBatch(res.data.suggestions);
      setChosen(new Set(res.data.suggestions.map((s) => s.id)));
      setAiUsed(res.data.aiUsed);
    });
  };

  const apply = () => {
    startTransition(async () => {
      const res = await post<{ added: number }>("/api/tasks/suggest", {
        action: "apply",
        date,
        batchIds: batch.map((s) => s.id),
        chosenIds: [...chosen],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBatch([]);
      setIntent("");
      router.refresh();
    });
  };

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={suggest} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="What do you want to get done?"
            htmlFor="suggest-intent"
            hint="Rough is fine — Orbit works out the steps."
          >
            <Input
              id="suggest-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Add Eureka to the portfolio"
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {pending && batch.length === 0 ? "Thinking…" : "Break it down"}
        </Button>
      </form>

      {learned.decided >= 5 ? (
        <p className="text-xs text-ink-faint">
          Tuned to your choices across {learned.decided} previous suggestions ({learned.accepted}{" "}
          kept).
        </p>
      ) : learned.decided > 0 ? (
        <p className="text-xs text-ink-faint">
          Still learning your style — {5 - learned.decided} more batches before suggestions adapt
          properly.
        </p>
      ) : null}

      {batch.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-accent p-3">
          {!aiUsed ? (
            <p className="text-xs text-ink-faint">
              AI was unavailable, so this is just what you typed. Untick to discard it.
            </p>
          ) : null}

          <ul className="flex flex-col gap-2">
            {batch.map((s) => {
              const on = chosen.has(s.id);
              return (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-canvas">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(s.id)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${on ? "font-medium" : "text-ink-faint"}`}>
                        {s.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                        <Badge>{s.category}</Badge>
                        <span>{formatDuration(s.estimatedMinutes)}</span>
                        {s.rationale ? <span>· {s.rationale}</span> : null}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={apply} disabled={pending}>
              {pending ? "Adding…" : `Add ${chosen.size} to today`}
            </Button>
            <Button variant="ghost" onClick={() => setBatch([])} disabled={pending}>
              Discard all
            </Button>
            <span className="text-xs text-ink-faint">
              Whatever you leave unticked teaches it what not to suggest.
            </span>
          </div>
        </div>
      ) : null}

      <div aria-live="polite">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
