"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { post, patch } from "@/lib/client-api";
import { TrainingLinks, type TrainingLinkView } from "./training";

type Layer = "vocab" | "concept" | "memory";

const LAYERS: { id: Layer; label: string; tone: string }[] = [
  { id: "vocab", label: "Vocabulary", tone: "text-vocab border-vocab bg-vocab-soft" },
  { id: "concept", label: "Concept", tone: "text-concept border-concept bg-concept-soft" },
  { id: "memory", label: "Training", tone: "text-drill border-drill bg-drill-soft" },
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

export interface Node {
  id: string;
  title: string;
  domain: string;
  summary: string | null;
  notes: string | null;
}

export interface Edge {
  id: string;
  fromId: string;
  toId: string;
  relationship: string;
  suggested: boolean;
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
            <button
              key={l.id}
              role="tab"
              aria-selected={active}
              onClick={() => setLayer(l.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                active ? l.tone : "border-line bg-surface text-ink-soft hover:border-accent"
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {layer === "vocab" ? <VocabLayer date={props.date} words={props.words} /> : null}
      {layer === "concept" ? <ConceptLayer date={props.date} concept={props.concept} /> : null}
      {layer === "memory" ? <TrainingLinks links={props.trainingLinks} /> : null}

      <Card>
        <CardTitle>Mind map</CardTitle>
        <p className="mb-4 text-sm text-ink-soft">
          The web lives on its own canvas — drag the cards where they make sense and they stay
          there. Spatial stability is most of why a map helps you remember.
        </p>
        <LinkButton href="/map">Open the canvas</LinkButton>
      </Card>

      <WeeklySession weekEnding={props.weekEnding} isSunday={props.isSunday} />
    </div>
  );
}

/* ------------------------------------------------------------ review queue */

function ReviewQueue({
  due,
  queue,
  retention,
}: {
  due: ReviewCard[];
  queue: Props["queue"];
  retention: number | null;
}) {
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
      <CardTitle
        hint={
          <span className="flex gap-2">
            <Badge tone="accent">{queue.due} due</Badge>
            <Badge>{queue.mature} mature</Badge>
            {retention !== null ? <Badge>{Math.round(retention * 100)}% retained</Badge> : null}
          </span>
        }
      >
        Review
      </CardTitle>

      {!card ? (
        <EmptyState title="Nothing due right now.">
          {queue.total === 0
            ? "Learn some words or a concept and they'll schedule themselves here."
            : "Everything is scheduled forward. Come back tomorrow."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-faint">
            Card {index + 1} of {due.length} · {card.kind}
          </p>
          <p className="text-lg font-medium">{card.prompt}</p>

          {revealed ? (
            <>
              <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink-soft">
                {card.answer}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" onClick={() => grade("again")}>
                  Again
                </Button>
                <Button size="sm" variant="secondary" onClick={() => grade("hard")}>
                  Hard
                </Button>
                <Button size="sm" onClick={() => grade("good")}>
                  Good
                </Button>
                <Button size="sm" variant="secondary" onClick={() => grade("easy")}>
                  Easy
                </Button>
              </div>
            </>
          ) : (
            <div>
              <p className="mb-3 text-xs text-ink-faint">
                Answer it in your head first. Retrieving before you check is what builds the memory.
              </p>
              <Button onClick={() => setRevealed(true)}>Show answer</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------- layer 1: vocab */

function VocabLayer({ date, words }: { date: string; words: Word[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const res = await post("/api/learn/vocab", { date, count: 10 });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {words.length === 0 ? (
        <Card>
          <CardTitle>Today&apos;s words</CardTitle>
          <EmptyState title="No words yet today.">
            <span className="mt-3 block">Ten words, with real etymologies and example sentences.</span>
          </EmptyState>
          <div className="mt-4 flex justify-center">
            <Button onClick={generate} disabled={pending}>
              {pending ? "Finding words…" : "Get today's ten words"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger text-center">
              {error} — check your Groq API key in settings.
            </p>
          ) : null}
        </Card>
      ) : (
        words.map((word) => <WordCard key={word.id} word={word} />)
      )}
    </div>
  );
}

function WordCard({ word }: { word: Word }) {
  const router = useRouter();
  const [sentence, setSentence] = useState(word.userSentence ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (sentence.trim().length < 3) {
      setError("Write a full sentence using the word.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await patch("/api/learn/vocab", { id: word.id, sentence: sentence.trim() });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const tone =
    word.sentenceVerdict === "correct"
      ? "physical"
      : word.sentenceVerdict === "misused"
        ? "danger"
        : "accent";

  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-lg font-semibold">{word.word}</h3>
        {word.partOfSpeech ? <span className="text-xs text-ink-faint">{word.partOfSpeech}</span> : null}
        {word.sentenceVerdict ? <Badge tone={tone}>{word.sentenceVerdict}</Badge> : null}
      </div>

      <p className="mt-2 text-sm">{word.meaning}</p>
      {word.etymology ? (
        <p className="mt-1 text-xs text-ink-faint">{word.etymology}</p>
      ) : null}

      {word.examples.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {word.examples.map((ex) => (
            <li key={ex} className="text-sm text-ink-soft">
              &ldquo;{ex}&rdquo;
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={submit} className="mt-4 border-t border-line pt-4">
        <Field label="Use it in your own sentence" htmlFor={`sentence-${word.id}`}>
          <Textarea
            id={`sentence-${word.id}`}
            rows={2}
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
          />
        </Field>
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="mt-2">
          {pending ? "Checking…" : word.userSentence ? "Check again" : "Check my sentence"}
        </Button>
      </form>

      <div aria-live="polite">
        {word.sentenceFeedback ? (
          <p className="mt-3 rounded-lg border border-line bg-canvas p-3 text-sm whitespace-pre-line text-ink-soft">
            {word.sentenceFeedback}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------- layer 2: concept */

function ConceptLayer({ date, concept }: { date: string; concept: Props["concept"] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [pending, startTransition] = useTransition();
  const [explanation, setExplanation] = useState("");
  const [judgement, setJudgement] = useState<null | {
    clarityScore: number;
    accuracyScore: number;
    jargonFound: string[];
    strongestPart: string;
    weakestPart: string;
    oneThingToFix: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = (own: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await post("/api/learn/concept", {
        date,
        force: true,  // always regenerate when user explicitly clicks
        ...(own && topic.trim() ? { topic: topic.trim() } : {}),
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const runFeynman = (event: React.FormEvent) => {
    event.preventDefault();
    if (explanation.trim().length < 20) {
      setError("Write at least a couple of sentences.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await post<{ judgement: NonNullable<typeof judgement> }>("/api/learn/feynman", {
        date,
        explanation: explanation.trim(),
      });
      if (!res.ok) setError(res.error);
      else setJudgement(res.data.judgement);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle hint={concept && !concept.generatedByAi ? <Badge>offline card</Badge> : undefined}>
          Today&apos;s concept
        </CardTitle>

        {concept ? (
          <article>
            <h3 className="text-lg font-semibold">{concept.topic}</h3>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
              {concept.explanation}
            </p>

            <h4 className="mt-5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
              Connections
            </h4>
            <ul className="mt-2 flex flex-col gap-2">
              {concept.connections.map((c) => (
                <li key={c.domain} className="text-sm">
                  <span className="font-medium">{c.domain}</span>{" "}
                  <span className="text-ink-soft">— {c.insight}</span>
                </li>
              ))}
            </ul>
          </article>
        ) : (
          <EmptyState title="No concept card yet today." />
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Choose a topic" htmlFor="concept-topic" hint="Blank lets Orbit pick.">
              <Input id="concept-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => generate(true)} disabled={pending}>
              Use my topic
            </Button>
            <Button onClick={() => generate(false)} disabled={pending}>
              {pending ? "Writing…" : "Choose for me"}
            </Button>
          </div>
        </div>
      </Card>

      {concept ? (
        <Card>
          <CardTitle>Explain it to a five-year-old</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            If you can&apos;t explain it simply, you don&apos;t understand it yet. Write it without
            jargon and Orbit will mark it honestly.
          </p>
          <form onSubmit={runFeynman} className="flex flex-col gap-3">
            <Field label="Your explanation" htmlFor="feynman">
              <Textarea
                id="feynman"
                rows={5}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? "Marking…" : "Mark it"}
            </Button>
          </form>

          <div aria-live="polite">
            {judgement ? (
              <div className="mt-4 rounded-lg border border-line bg-canvas p-4">
                <div className="flex gap-3">
                  <Badge tone="accent">Clarity {judgement.clarityScore}/10</Badge>
                  <Badge tone="accent">Accuracy {judgement.accuracyScore}/10</Badge>
                </div>
                {judgement.jargonFound.length > 0 ? (
                  <p className="mt-3 text-sm text-ink-soft">
                    <span className="font-medium">Jargon a child wouldn&apos;t know:</span>{" "}
                    {judgement.jargonFound.join(", ")}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-ink-soft">
                  <span className="font-medium">Strongest:</span> {judgement.strongestPart}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  <span className="font-medium">Weakest:</span> {judgement.weakestPart}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">Fix this one thing:</span> {judgement.oneThingToFix}
                </p>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- Sunday session */

function WeeklySession({ weekEnding, isSunday }: { weekEnding: string; isSunday: boolean }) {
  const [pending, startTransition] = useTransition();
  const [review, setReview] = useState<null | {
    synthesis: string | null;
    questions: { prompt: string; answer: string; source: string }[];
  }>(null);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const build = () => {
    setError(null);
    startTransition(async () => {
      const res = await post<{ review: NonNullable<typeof review> }>("/api/learn/weekly", {
        weekEnding,
      });
      if (!res.ok) setError(res.error);
      else setReview(res.data.review);
    });
  };

  return (
    <Card>
      <CardTitle hint={isSunday ? <Badge tone="accent">today</Badge> : `week ending ${weekEnding}`}>
        Weekly consolidation
      </CardTitle>

      {!review ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            {isSunday
              ? "It's Sunday. Pull the week's words, concepts and map additions into one recall session."
              : "Available any time, but Sunday is when spacing does the most work."}
          </p>
          <Button onClick={build} disabled={pending} className="self-start">
            {pending ? "Assembling…" : "Build this week's session"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {review.synthesis ? (
            <p className="rounded-lg border border-line bg-canvas p-4 text-sm leading-relaxed text-ink-soft">
              {review.synthesis}
            </p>
          ) : null}
          <ol className="flex flex-col gap-3">
            {review.questions.map((q, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <p className="text-sm font-medium">{q.prompt}</p>
                {shown[i] ? (
                  <p className="mt-2 text-sm text-ink-soft">{q.answer}</p>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => setShown({ ...shown, [i]: true })}
                  >
                    Reveal
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div aria-live="polite">
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
