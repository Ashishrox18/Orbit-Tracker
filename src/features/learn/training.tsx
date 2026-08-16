"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Card, CardTitle, Field, Input } from "@/components/ui";
import { del, post } from "@/lib/client-api";

/**
 * External brain-training links.
 *
 * The app deliberately hosts no games. It holds the link, opens it in a new
 * tab, and records what you scored when you come back — far less to maintain
 * than bespoke drills, and you can point it at anything.
 */

export interface TrainingLinkView {
  id: string;
  name: string;
  url: string | null;
  trains: string | null;
  sessions: number;
  best: number;
  last: number | null;
  lastPlayedOn: string | null;
}

export function TrainingLinks({ links }: { links: TrainingLinkView[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle hint={`${links.filter((l) => l.url).length}/${links.length} configured`}>
          Training
        </CardTitle>
        <p className="mb-4 text-sm text-ink-soft">
          Paste the URL of any trainer you like — Human Benchmark, a dual N-back site, whatever
          you actually use. Orbit opens it and keeps the score history.
        </p>

        <ul className="flex flex-col gap-2">
          {links.map((link) =>
            editing === link.id ? (
              <li key={link.id}>
                <LinkEditor link={link} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.name}</p>
                  <p className="text-xs text-ink-faint">
                    {link.trains ?? "—"}
                    {link.sessions > 0
                      ? ` · ${link.sessions} sessions · best ${link.best}`
                      : " · never played"}
                  </p>
                </div>

                {link.url ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    Play
                  </a>
                ) : (
                  <Badge>no link yet</Badge>
                )}

                <Button size="sm" variant="ghost" onClick={() => setEditing(link.id)}>
                  {link.url ? "Edit" : "Add link"}
                </Button>
              </li>
            ),
          )}
        </ul>

        <div className="mt-4 border-t border-line pt-4">
          {adding ? (
            <LinkEditor link={null} onDone={() => setAdding(false)} />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              Add another trainer
            </Button>
          )}
        </div>
      </Card>

      <ScoreLogger links={links.filter((l) => l.url)} />
    </div>
  );
}

function LinkEditor({
  link,
  onDone,
}: {
  link: TrainingLinkView | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(link?.name ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [trains, setTrains] = useState(link?.trains ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await post("/api/training", {
        ...(link ? { id: link.id } : {}),
        name: name.trim(),
        url: url.trim() || null,
        trains: trains.trim() || undefined,
        sortOrder: 0,
      });
      if (!res.ok) setError(res.error);
      else {
        onDone();
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!link) return;
    startTransition(async () => {
      await del("/api/training", { id: link.id });
      onDone();
      router.refresh();
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-lg border border-accent p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Field label="Name" htmlFor={`t-name-${link?.id ?? "new"}`}>
            <Input
              id={`t-name-${link?.id ?? "new"}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Trains" htmlFor={`t-trains-${link?.id ?? "new"}`}>
            <Input
              id={`t-trains-${link?.id ?? "new"}`}
              value={trains}
              onChange={(e) => setTrains(e.target.value)}
              placeholder="Working memory"
            />
          </Field>
        </div>
      </div>
      <Field
        label="URL"
        htmlFor={`t-url-${link?.id ?? "new"}`}
        hint="Must start with http:// or https://"
      >
        <Input
          id={`t-url-${link?.id ?? "new"}`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://humanbenchmark.com/tests/sequence"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {link ? (
          <Button type="button" size="sm" variant="danger" onClick={remove} className="ml-auto">
            Remove
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Manual score entry — the external site can't tell us how you did. */
function ScoreLogger({ links }: { links: TrainingLinkView[] }) {
  const router = useRouter();
  const [linkId, setLinkId] = useState(links[0]?.id ?? "");
  const [score, setScore] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (links.length === 0) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(score);
    if (!linkId || !Number.isFinite(value) || value < 0) {
      setError("Pick a trainer and enter the score you got.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await post("/api/training/session", {
        linkId,
        score: Math.round(value),
        level: 0,
        durationSeconds: Math.round(Number(minutes) || 0) * 60,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setScore("");
      setMessage("Logged.");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardTitle>Log a score</CardTitle>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <Field label="Trainer" htmlFor="log-link">
            <select
              id="log-link"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
            >
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-28">
          <Field label="Score" htmlFor="log-score">
            <Input
              id="log-score"
              inputMode="numeric"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Minutes" htmlFor="log-minutes">
            <Input
              id="log-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Log"}
        </Button>
      </form>

      <div aria-live="polite" className="mt-2">
        {message ? <p className="text-xs text-physical">{message}</p> : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
