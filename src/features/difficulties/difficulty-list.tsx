"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button } from "@/components/ui";
import { patch } from "@/lib/client-api";

export interface DifficultyItem {
  id: string;
  topic: string;
  subject: string;
  difficulty: string;
  status: string;
  attempts: number;
  likelyGap: string | null;
  recommendedAction: string | null;
  stageLabel: string;
  timeSpentMinutes: number;
  tags: string[];
}

const TONE: Record<string, "danger" | "emotional" | "accent" | "neutral"> = {
  stuck: "danger",
  difficult: "emotional",
  moderate: "accent",
  easy: "neutral",
};

export function DifficultyList({ items }: { items: DifficultyItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <DifficultyRow item={item} />
        </li>
      ))}
    </ul>
  );
}

function DifficultyRow({ item }: { item: DifficultyItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const act = (body: Record<string, unknown>) => {
    setError(null);
    startTransition(async () => {
      const res = await patch("/api/difficulties", { id: item.id, ...body });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) return null;

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{item.topic}</h3>
        <Badge tone={TONE[item.difficulty] ?? "neutral"}>{item.difficulty}</Badge>
        <Badge>{item.subject}</Badge>
        {item.attempts > 0 ? <Badge>attempt {item.attempts + 1}</Badge> : null}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Next intervention: <span className="text-ink-soft">{item.stageLabel}</span>
        {item.timeSpentMinutes > 0 ? ` · ${item.timeSpentMinutes} min spent` : ""}
      </p>

      {item.likelyGap ? (
        <p className="mt-2 text-sm text-ink-soft">{item.likelyGap}</p>
      ) : null}
      {item.recommendedAction ? (
        <p className="mt-1 text-sm text-ink-soft">{item.recommendedAction}</p>
      ) : null}
      {item.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => act({ status: "resolved", resolution: "Marked resolved" })}
          disabled={pending}
        >
          Resolved
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => act({ stillStruggling: true, timeSpentMinutes: 20 })}
          disabled={pending}
        >
          Still struggling
        </Button>
        {item.status === "open" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act({ status: "in_progress" })}
            disabled={pending}
          >
            Start working on it
          </Button>
        ) : null}
      </div>

      <div aria-live="polite">
        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
