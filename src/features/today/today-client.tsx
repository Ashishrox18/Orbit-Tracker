"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { del, patch, post, put } from "@/lib/client-api";
import {
  DIFFICULTY_LEVELS,
  DIFFICULTY_TAGS,
  TASK_CATEGORIES,
  TASK_TAGS,
  type WinType,
} from "@/lib/constants";
import { formatDuration } from "@/lib/time";

const CATEGORY_LABEL: Record<string, string> = {
  physical: "Physical",
  mental: "Mental",
  emotional: "Emotional",
  habit: "Habit",
  commitment: "Commitment",
  other: "Other",
};

export interface TaskLite {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  category: string;
  winType: string | null;
  isMandatory: boolean;
  estimatedMinutes: number;
  startAt: string | null;
  endAt: string | null;
  tags: string[];
}

/**
 * Multi-select tags: preset pills toggle on click, plus a free-text "Add" for
 * a one-off custom tag. Same toggle-pill visual as the evidence kind picker.
 */
function TagPicker({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = useState("");

  const toggle = (tag: string) =>
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);

  const addCustom = () => {
    const t = custom.trim();
    if (!t || value.includes(t) || value.length >= 8) return;
    onChange([...value, t]);
    setCustom("");
  };

  const customTags = value.filter((t) => !options.includes(t));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            aria-pressed={value.includes(tag)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              value.includes(tag)
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-soft hover:border-accent"
            }`}
          >
            {tag}
          </button>
        ))}
        {customTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            aria-pressed
            className="rounded-lg border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Custom tag"
          className="flex-1"
        />
        <Button type="button" size="sm" variant="ghost" onClick={addCustom}>
          Add tag
        </Button>
      </div>
    </div>
  );
}

const WIN_LABEL: Record<WinType, string> = {
  physical: "Physical",
  mental: "Mental",
  emotional: "Emotional",
};

const WIN_TONE: Record<WinType, "physical" | "mental" | "emotional"> = {
  physical: "physical",
  mental: "mental",
  emotional: "emotional",
};

/**
 * A completed win fills in with its own colour — progress you can see, not
 * just read. Written as full literal class strings (not template-interpolated)
 * so Tailwind's static scanner actually generates them.
 */
const WIN_DONE_STYLE: Record<WinType, string> = {
  physical: "ring-2 ring-physical bg-[var(--color-physical-soft)]",
  mental: "ring-2 ring-mental bg-[var(--color-mental-soft)]",
  emotional: "ring-2 ring-emotional bg-[var(--color-emotional-soft)]",
};

/* ------------------------------------------------------------------ wins */

export function WinCards({
  wins,
  rationale,
}: {
  wins: { winType: WinType; task: TaskLite | null }[];
  rationale: Record<string, string> | null;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {wins.map(({ winType, task }) => (
        <li key={winType}>
          <WinCard winType={winType} task={task} why={rationale?.[winType] ?? null} />
        </li>
      ))}
    </ul>
  );
}

function WinCard({
  winType,
  task,
  why,
}: {
  winType: WinType;
  task: TaskLite | null;
  why: string | null;
}) {
  const [status, setStatus] = useState(task?.status ?? "pending");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const done = status === "completed";

  const toggle = () => {
    if (!task) return;
    const next = done ? "pending" : "completed";
    setError(null);
    startTransition(async () => {
      const result = await patch<{ task: { status: string } }>("/api/tasks", {
        id: task.id,
        status: next,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(next);
      router.refresh();
    });
  };

  return (
    <Card
      className={`h-full transition-colors duration-300 ${done ? WIN_DONE_STYLE[winType] : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={WIN_TONE[winType]}>{WIN_LABEL[winType]}</Badge>
        {task?.startAt ? (
          <time className="text-xs text-ink-faint">{task.startAt}</time>
        ) : null}
      </div>

      {task ? (
        <>
          <p className={`mt-3 text-sm font-medium ${done ? "text-ink-faint line-through" : "text-ink"}`}>
            {task.title}
          </p>
          {why ? <p className="mt-1.5 text-xs text-ink-faint">{why}</p> : null}
          <Button
            variant={done ? "secondary" : "primary"}
            size="sm"
            className="mt-4 w-full"
            onClick={toggle}
            disabled={pending}
            aria-pressed={done}
          >
            {done ? "Completed — undo" : "Mark complete"}
          </Button>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-faint">Not planned today.</p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- timeline */

export function Timeline({
  date,
  tasks,
  mode = "today",
}: {
  date: string;
  tasks: TaskLite[];
  /** "plan" hides completion — morning is for add/edit/delete, not marking done. */
  mode?: "plan" | "today";
}) {
  /**
   * Render from props, not from state.
   *
   * Holding the list in useState meant router.refresh() updated the server
   * props while the component kept its original array — a task added or
   * deleted only appeared after a full page reload. `pending` is a thin
   * overlay for instant feedback, cleared as soon as the server answers.
   */
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<string | null>(null);
  const router = useRouter();

  const rows = tasks
    .filter((t) => pending[t.id] !== null || !(t.id in pending))
    .map((t) => (pending[t.id] ? { ...t, status: pending[t.id]! } : t));

  const settle = (id: string) =>
    setPending((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const status = async (id: string, next: string) => {
    setPending((prev) => ({ ...prev, [id]: next }));
    await patch("/api/tasks", { id, status: next });
    settle(id);
    router.refresh();
  };

  // Completing a task is the moment proof matters most — ask right there,
  // rather than deferring it to a separate end-of-day ritual.
  const complete = async (id: string, currentlyDone: boolean) => {
    await status(id, currentlyDone ? "pending" : "completed");
    if (!currentlyDone) setProofFor(id);
  };

  const remove = async (id: string) => {
    setPending((prev) => ({ ...prev, [id]: null })); // null hides it optimistically
    await del("/api/tasks", { id });
    settle(id);
    router.refresh();
  };

  if (rows.length === 0) {
    return <p className="text-sm text-ink-faint">No tasks scheduled.</p>;
  }

  return (
    <ol className="flex flex-col gap-1">
      {rows.map((task) => {
        const done = task.status === "completed";
        const skipped = task.status === "skipped";

        if (editing === task.id) {
          return (
            <li key={task.id} className="rounded-lg border border-accent p-3">
              <TaskEditor
                task={task}
                onDone={() => {
                  setEditing(null);
                  router.refresh();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          );
        }

        return (
          <li
            key={task.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-transparent px-2 py-2.5 hover:border-line"
          >
            <time className="w-24 shrink-0 text-xs tabular-nums text-ink-faint">
              {task.startAt && task.endAt ? `${task.startAt}–${task.endAt}` : "unscheduled"}
            </time>

            <div className="min-w-0 flex-1 basis-40">
              <p
                className={`truncate text-sm ${
                  done ? "text-ink-faint line-through" : skipped ? "text-ink-faint" : "text-ink"
                }`}
              >
                {task.title}
              </p>
              <p className="text-xs text-ink-faint">
                {formatDuration(task.estimatedMinutes)}
                {task.isMandatory ? " · mandatory" : ""}
                {skipped ? " · skipped" : ""}
                {done ? " · done" : ""}
              </p>
              {task.tags.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {task.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              ) : null}
              {mode === "today" && proofFor === task.id ? (
                <ProofPrompt
                  date={date}
                  taskId={task.id}
                  title={task.title}
                  onDone={() => setProofFor(null)}
                />
              ) : null}
            </div>

            <div className="ml-auto flex shrink-0 gap-1">
              {mode === "today" ? (
                <Button
                  size="sm"
                  variant={done ? "secondary" : "primary"}
                  onClick={() => complete(task.id, done)}
                  aria-label={done ? `Undo ${task.title}` : `Complete ${task.title}`}
                >
                  {done ? "Undo" : "Done"}
                </Button>
              ) : null}
              {mode === "today" && !done && !skipped ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => status(task.id, "skipped")}
                  aria-label={`Skip ${task.title}`}
                >
                  Skip
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(task.id)}
                aria-label={`Edit ${task.title}`}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(task.id)}
                aria-label={`Delete ${task.title}`}
              >
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The one prompt that replaces a whole separate proof-of-work form. */
function ProofPrompt({
  date,
  taskId,
  title,
  onDone,
}: {
  date: string;
  taskId: string;
  title: string;
  onDone: () => void;
}) {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!url.trim()) {
      onDone();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await post("/api/evidence", {
        date,
        kind: "link",
        title,
        url: url.trim(),
        category: "other",
        taskId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-2">
      <span className="text-xs text-ink-soft">Got a link to prove it?</span>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        aria-label="Proof link"
        className="w-56"
      />
      <Button size="sm" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save proof"}
      </Button>
      <button type="button" onClick={onDone} className="text-xs text-ink-faint underline">
        No proof
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Inline editor. Kept in the row so editing never loses your place in the day. */
function TaskEditor({
  task,
  onDone,
  onCancel,
}: {
  task: TaskLite;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category);
  const [minutes, setMinutes] = useState(task.estimatedMinutes);
  const [startAt, setStartAt] = useState(task.startAt ?? "");
  const [tags, setTags] = useState<string[]>(task.tags);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the task a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await put("/api/tasks", {
        id: task.id,
        title: title.trim(),
        category,
        estimatedMinutes: minutes,
        // Clearing the time unschedules the task rather than deleting it.
        startAt: startAt || null,
        tags,
      });
      if (!res.ok) setError(res.error);
      else onDone();
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Title" htmlFor={`edit-title-${task.id}`}>
            <Input
              id={`edit-title-${task.id}`}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Category" htmlFor={`edit-category-${task.id}`}>
            <Select
              id={`edit-category-${task.id}`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c] ?? c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-28">
          <Field label="Minutes" htmlFor={`edit-min-${task.id}`}>
            <Input
              id={`edit-min-${task.id}`}
              type="number"
              min={5}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Starts" htmlFor={`edit-start-${task.id}`}>
            <Input
              id={`edit-start-${task.id}`}
              type="time"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label="Tags" htmlFor={`edit-tags-${task.id}`}>
        <TagPicker id={`edit-tags-${task.id}`} options={TASK_TAGS} value={tags} onChange={setTags} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* --------------------------------------------------------- quick capture */

export function QuickCapture() {
  const [text, setText] = useState("");
  const [level, setLevel] = useState<string>("difficult");
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 3) {
      setError("Describe what you're stuck on — a few words is enough.");
      return;
    }
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await post<{ difficulty: { topic: string }; aiUsed: boolean }>(
        "/api/difficulties",
        { rawInput: text.trim(), difficulty: level, tags },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      setTags([]);
      setMessage(
        `Captured "${result.data.difficulty.topic}". It will shape tomorrow's mental win.` +
          (result.data.aiUsed ? "" : " (classified locally — AI was unavailable)"),
      );
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="What are you struggling with right now?"
        htmlFor="capture-text"
        hint="A topic, one question, or just what isn't clicking."
      >
        <Textarea
          id="capture-text"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Integration by parts — I don't know when to use it"
        />
      </Field>

      <Field label="Tags" htmlFor="capture-tags" hint="Optional. What is this for?">
        <TagPicker id="capture-tags" options={DIFFICULTY_TAGS} value={tags} onChange={setTags} />
      </Field>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="How hard is it?" htmlFor="capture-level">
            <Select id="capture-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {DIFFICULTY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l[0]?.toUpperCase()}
                  {l.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Capturing…" : "Capture"}
        </Button>
      </div>

      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-xs text-physical">{message}</p> : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- add task */

export function AddTask({ date }: { date: string }) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [category, setCategory] = useState<string>("other");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the task a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await post("/api/tasks", {
        date,
        title: title.trim(),
        category,
        estimatedMinutes: minutes,
        tags,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle("");
      setTags([]);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Add a task" htmlFor="add-task-title">
            <Input
              id="add-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Something that came up"
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Category" htmlFor="add-task-category" hint="Which of your three wins this feeds.">
            <Select
              id="add-task-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c] ?? c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-24">
          <Field label="Minutes" htmlFor="add-task-minutes">
            <Input
              id="add-task-minutes"
              type="number"
              min={5}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Add
        </Button>
      </div>
      <Field label="Tags" htmlFor="add-task-tags" hint="Optional — separate from category. What is this for?">
        <TagPicker id="add-task-tags" options={TASK_TAGS} value={tags} onChange={setTags} />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* --------------------------------------------------------- reflection */

/** One field, not four. Whatever's worth remembering about today, in your own words. */
export function ReflectionForm({
  date,
  existingReflection,
  existingInsight,
}: {
  date: string;
  existingReflection: string | null;
  existingInsight: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(existingReflection ?? "");
  const [saved, setSaved] = useState(false);
  const [insight, setInsight] = useState<string | null>(existingInsight);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await post<{ review: { aiInsight: string | null } }>("/api/review", {
        date,
        learned: text.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setInsight(res.data.review.aiInsight);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Reflection" htmlFor="reflection" hint="Optional. However today went, in a line or two.">
        <Textarea
          id="reflection"
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save reflection"}
        </Button>
        <span aria-live="polite" className="text-xs text-physical">
          {saved ? "Saved" : ""}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {insight ? (
        <div className="rounded-lg border border-line bg-canvas p-4">
          <h3 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
            Tonight&apos;s read
          </h3>
          {insight.split("\n").map((line, i) => (
            <p key={i} className="mt-1.5 text-sm text-ink-soft">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
