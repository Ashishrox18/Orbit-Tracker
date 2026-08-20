"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { post, patch, del } from "@/lib/client-api";
import { TrainingLinks, type TrainingLinkView } from "./training";

type Layer = "vocab" | "concept" | "memory";

const LAYERS: { id: Layer; label: string; tone: string }[] = [
  { id: "vocab",   label: "Vocabulary", tone: "text-vocab border-vocab bg-vocab-soft" },
  { id: "concept", label: "Concept",    tone: "text-concept border-concept bg-concept-soft" },
  { id: "memory",  label: "Training",   tone: "text-drill border-drill bg-drill-soft" },
];

export interface Word {
  id: string;
  word: string;
  partOfSpeech: string | null;
  meaning: string;
  etymology: string | null;
  examples: string[];
  userSentence: string | null;
  sentenceVerdict: string | null;
  sentenceFeedback: string | null;
}

export interface ReviewCard {
  id: string;
  kind: string;
  prompt: string;
  answer: string;
}

interface Props {
  date: string;
  weekEnding: string;
  isSunday: boolean;
  words: Word[];
  concept: { topic: string; explanation: string; connections: { domain: string; insight: string }[]; applicationPrompt: string | null; generatedByAi: boolean } | null;
  due: ReviewCard[];
  queue: { due: number; learning: number; mature: number; total: number };
  retention: number | null;
  trainingLinks: TrainingLinkView[];
}

export function LearnTabs(props: Props) {
  const [layer, setLayer] = useState<Layer>("vocab");

  return (
    <div className="flex flex-col gap-6">
      <ReviewQueue due={props.due} queue={props.queue} retention={props.retention} />

      <div role="tablist" aria-label="Learning layers" className="flex flex-wrap gap-2">
        {LAYERS.map((l) => {
          const active = layer === l.id;
          return (
            <button key={l.id} role="tab" aria-selected={active} onClick={() => setLayer(l.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                active ? l.tone : "border-line bg-surface text-ink-soft hover:border-accent"
              }`}>
              {l.label}
            </button>
          );
        })}
      </div>

      {layer === "vocab"   ? <VocabLayer   date={props.date} words={props.words} /> : null}
      {layer === "concept" ? <ConceptLayer date={props.date} concept={props.concept} /> : null}
      {layer === "memory"  ? <TrainingLinks links={props.trainingLinks} /> : null}

      <Card>
        <CardTitle>Mind map</CardTitle>
        <p className="mb-4 text-sm text-ink-soft">
          The web lives on its own canvas — drag cards where they make sense and they stay there.
        </p>
        <LinkButton href="/map">Open the canvas</LinkButton>
      </Card>

      <WeeklySession weekEnding={props.weekEnding} isSunday={props.isSunday} />
    </div>
  );
}

/* ------------------------------------------------------------ review queue */

function ReviewQueue({ due, queue, retention }: { due: ReviewCard[]; queue: Props["queue"]; retention: number | null }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [, startTransition] = useTransition();

  const card = due[index];

  const grade = (g: string) => {
    if (!card) return;
    startTransition(async () => {
      await post("/api/learn/review", { id: card.id, grade: g });
      setRevealed(false);
      if (index + 1 >= due.length) router.refresh();
      else setIndex(index + 1);
    });
  };

  return (
    <Card>
      <CardTitle hint={
        <span className="flex gap-2">
          <Badge tone="accent">{queue.due} due</Badge>
          <Badge>{queue.mature} mature</Badge>
          {retention !== null ? <Badge>{Math.round(retention * 100)}% retained</Badge> : null}
        </span>
      }>
        Review
      </CardTitle>

      {!card ? (
        <EmptyState title="Nothing due right now.">
          {queue.total === 0
            ? "Add words or a concept topic — they'll schedule themselves here."
            : "Everything is scheduled forward. Come back tomorrow."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-faint">Card {index + 1} of {due.length} · {card.kind}</p>
          <p className="text-lg font-medium">{card.prompt}</p>
          {revealed ? (
            <>
              <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink-soft">{card.answer}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger"    onClick={() => grade("again")}>Again</Button>
                <Button size="sm" variant="secondary" onClick={() => grade("hard")}>Hard</Button>
                <Button size="sm"                     onClick={() => grade("good")}>Good</Button>
                <Button size="sm" variant="secondary" onClick={() => grade("easy")}>Easy</Button>
              </div>
            </>
          ) : (
            <div>
              <p className="mb-3 text-xs text-ink-faint">Answer it in your head first, then check.</p>
              <Button onClick={() => setRevealed(true)}>Show answer</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- vocab layer */

function VocabLayer({ date, words }: { date: string; words: Word[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [word,         setWord]         = useState("");
  const [meaning,      setMeaning]      = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [etymology,    setEtymology]    = useState("");
  const [example,      setExample]      = useState("");
  const [error,        setError]        = useState<string | null>(null);
  const [pending,      startTransition] = useTransition();

  const reset = () => { setWord(""); setMeaning(""); setPartOfSpeech(""); setEtymology(""); setExample(""); setError(null); setShowForm(false); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim())    { setError("Enter the word."); return; }
    if (!meaning.trim()) { setError("Enter the meaning."); return; }
    setError(null);
    startTransition(async () => {
      const res = await post("/api/learn/vocab", {
        date,
        word:         word.trim(),
        meaning:      meaning.trim(),
        partOfSpeech: partOfSpeech.trim() || undefined,
        etymology:    etymology.trim()    || undefined,
        example:      example.trim()      || undefined,
      });
      if (!res.ok) { setError(res.error); return; }
      reset();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Today&apos;s words — {words.length} added</CardTitle>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add word"}
          </Button>
        </div>

        {showForm && (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Word *" htmlFor="vw-word">
                <Input id="vw-word" value={word} onChange={(e) => setWord(e.target.value)} placeholder="ephemeral" autoFocus />
              </Field>
              <Field label="Part of speech" htmlFor="vw-pos">
                <Input id="vw-pos" value={partOfSpeech} onChange={(e) => setPartOfSpeech(e.target.value)} placeholder="adjective" />
              </Field>
            </div>
            <Field label="Meaning *" htmlFor="vw-meaning">
              <Textarea id="vw-meaning" rows={2} value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Lasting for a very short time." />
            </Field>
            <Field label="Etymology (optional)" htmlFor="vw-etym">
              <Input id="vw-etym" value={etymology} onChange={(e) => setEtymology(e.target.value)} placeholder="Greek ephemeros — lasting only a day" />
            </Field>
            <Field label="Example sentence (optional)" htmlFor="vw-ex">
              <Input id="vw-ex" value={example} onChange={(e) => setExample(e.target.value)} placeholder="The mayfly's beauty is ephemeral." />
            </Field>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save word"}</Button>
              <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </form>
        )}

        {!showForm && words.length === 0 && (
          <EmptyState title="No words added today yet.">
            Click &quot;+ Add word&quot; to add your first word for today.
          </EmptyState>
        )}
      </Card>

      {words.map((w) => <WordCard key={w.id} word={w} />)}
    </div>
  );
}

function WordCard({ word }: { word: Word }) {
  const router = useRouter();
  const [sentence, setSentence] = useState(word.userSentence ?? "");
  const [pending, startTransition] = useTransition();
  const [error,   setError]        = useState<string | null>(null);
  const [deleted, setDeleted]      = useState(false);

  const saveSentence = (e: React.FormEvent) => {
    e.preventDefault();
    if (sentence.trim().length < 3) { setError("Write a full sentence."); return; }
    setError(null);
    startTransition(async () => {
      const res = await patch("/api/learn/vocab", { id: word.id, sentence: sentence.trim() });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const remove = () => {
    setDeleted(true);
    startTransition(async () => {
      await del("/api/learn/vocab", { id: word.id });
      router.refresh();
    });
  };

  if (deleted) return null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-lg font-semibold">{word.word}</h3>
          {word.partOfSpeech ? <span className="text-xs text-ink-faint">{word.partOfSpeech}</span> : null}
        </div>
        <Button size="sm" variant="ghost" onClick={remove} aria-label={`Delete ${word.word}`}>Delete</Button>
      </div>

      <p className="mt-2 text-sm">{word.meaning}</p>
      {word.etymology ? <p className="mt-1 text-xs text-ink-faint">{word.etymology}</p> : null}

      {word.examples.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {word.examples.map((ex) => (
            <li key={ex} className="text-sm text-ink-soft">&ldquo;{ex}&rdquo;</li>
          ))}
        </ul>
      )}

      <form onSubmit={saveSentence} className="mt-4 border-t border-line pt-4">
        <Field label="Use it in your own sentence" htmlFor={`sentence-${word.id}`}>
          <Textarea id={`sentence-${word.id}`} rows={2} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="Write a sentence using this word…" />
        </Field>
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="mt-2">
          {pending ? "Saving…" : word.userSentence ? "Update sentence" : "Save sentence"}
        </Button>
        {word.userSentence && !pending && (
          <span className="ml-3 text-xs text-ink-faint">Saved</span>
        )}
      </form>

      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

/* --------------------------------------------------------- concept layer */

function ConceptLayer({ date, concept }: { date: string; concept: Props["concept"] }) {
  const router = useRouter();
  const [topic,       setTopic]       = useState(concept?.topic ?? "");
  const [explanation, setExplanation] = useState(concept?.explanation ?? "");
  const [savedExp,    setSavedExp]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [pending,     startTransition] = useTransition();

  const saveTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) { setError("Enter a topic."); return; }
    setError(null);
    startTransition(async () => {
      const res = await post("/api/learn/concept", { date, topic: topic.trim() });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const saveExplanation = (e: React.FormEvent) => {
    e.preventDefault();
    if (explanation.trim().length < 5) { setError("Write at least a few words."); return; }
    setError(null);
    startTransition(async () => {
      const res = await patch("/api/learn/concept", { date, explanation: explanation.trim() });
      if (!res.ok) setError(res.error);
      else { setSavedExp(true); router.refresh(); }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Today&apos;s concept</CardTitle>

        {concept ? (
          <article>
            <h3 className="text-lg font-semibold">{concept.topic}</h3>
            {concept.explanation && (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                {concept.explanation}
              </p>
            )}
            {concept.connections.length > 0 && (
              <>
                <h4 className="mt-5 text-xs font-semibold tracking-wide text-ink-faint uppercase">Connections</h4>
                <ul className="mt-2 flex flex-col gap-2">
                  {concept.connections.map((c) => (
                    <li key={c.domain} className="text-sm">
                      <span className="font-medium">{c.domain}</span>{" "}
                      <span className="text-ink-soft">— {c.insight}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ) : (
          <EmptyState title="No topic set for today." />
        )}

        <form onSubmit={saveTopic} className="mt-5 flex gap-2 border-t border-line pt-5 items-end">
          <div className="flex-1">
            <Field label="Set today's topic" htmlFor="concept-topic" hint="What do you want to study today?">
              <Input id="concept-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Compound interest, Newton's laws…" />
            </Field>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : concept ? "Update topic" : "Set topic"}
          </Button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      {concept && (
        <Card>
          <CardTitle>Explain it in your own words</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            Write your explanation without looking at notes. This is the Feynman technique —
            if you can&apos;t explain it simply, you don&apos;t understand it yet.
          </p>
          <form onSubmit={saveExplanation} className="flex flex-col gap-3">
            <Field label="Your explanation" htmlFor="feynman">
              <Textarea id="feynman" rows={6} value={explanation}
                onChange={(e) => { setExplanation(e.target.value); setSavedExp(false); }}
                placeholder="Explain the concept as if teaching someone who has never heard of it…"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending} className="self-start">
                {pending ? "Saving…" : "Save explanation"}
              </Button>
              {savedExp && <span className="text-xs text-ink-faint">Saved</span>}
            </div>
          </form>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </Card>
      )}
    </div>
  );
}

/* --------------------------------------------------------- weekly review */

function WeeklySession({ weekEnding, isSunday }: { weekEnding: string; isSunday: boolean }) {
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<null | { questions: { prompt: string; answer: string; source: string }[]; wordCount: number; conceptCount: number }>(null);
  const [shown,  setShown]  = useState<Record<number, boolean>>({});
  const [error,  setError]  = useState<string | null>(null);

  const build = () => {
    setError(null);
    startTransition(async () => {
      const res = await post<{ review: NonNullable<typeof review> }>("/api/learn/weekly", { weekEnding });
      if (!res.ok) setError(res.error);
      else setReview(res.data.review);
    });
  };

  return (
    <Card>
      <CardTitle hint={isSunday ? <Badge tone="accent">today</Badge> : `week ending ${weekEnding}`}>
        Weekly review
      </CardTitle>

      {!review ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            {isSunday
              ? "It's Sunday — go through this week's words and concepts from memory."
              : "Review this week's material any time."}
          </p>
          <Button onClick={build} disabled={pending} className="self-start">
            {pending ? "Loading…" : "Show this week's material"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            {review.wordCount} words · {review.conceptCount} concepts this week.
            Answer each from memory, then reveal to check.
          </p>
          <ol className="flex flex-col gap-3">
            {review.questions.length === 0 ? (
              <li className="text-sm text-ink-faint">No words or concepts added this week yet.</li>
            ) : (
              review.questions.map((q, i) => (
                <li key={i} className="rounded-lg border border-line p-3">
                  <p className="text-sm font-medium">{q.prompt}</p>
                  <Badge>{q.source}</Badge>
                  {shown[i] ? (
                    <p className="mt-2 text-sm text-ink-soft">{q.answer || "(no answer saved yet)"}</p>
                  ) : (
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShown({ ...shown, [i]: true })}>
                      Reveal
                    </Button>
                  )}
                </li>
              ))
            )}
          </ol>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
