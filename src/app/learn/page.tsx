import { redirect } from "next/navigation";

import { getLocalUser } from "@/db";
import { LearnTabs } from "@/features/learn/learn-tabs";
import { todayISO, weekdayIndex } from "@/lib/time";
import {
  currentWeekEnding,
  dueReviews,
  reviewSummary,
  todaysWords,
} from "@/services/learn";
import { getLearningSession } from "@/services/learning";
import { listTrainingLinks, trainingHistory } from "@/services/evidence";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const user = await getLocalUser();
  if (!user.onboardedAt) redirect("/onboarding");

  const date      = todayISO();
  const weekEnding = currentWeekEnding(date);

  const [words, concept, due, summary, links, history] = await Promise.all([
    todaysWords(user.id, date),
    getLearningSession(user.id, date),
    dueReviews(user.id, date),
    reviewSummary(user.id, date),
    listTrainingLinks(user.id),
    trainingHistory(user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-8 lg:py-10 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Learn</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Add words and concepts manually. Review them with spaced repetition.
        </p>
      </header>

      <LearnTabs
        date={date}
        weekEnding={weekEnding}
        isSunday={weekdayIndex(date) === 0}
        words={words.map((w) => ({
          id:              w.id,
          word:            w.word,
          partOfSpeech:    w.partOfSpeech,
          meaning:         w.meaning,
          etymology:       w.etymology,
          examples:        w.examples,
          userSentence:    w.userSentence,
          sentenceVerdict: w.sentenceVerdict,
          sentenceFeedback: w.sentenceFeedback,
        }))}
        concept={
          concept
            ? {
                topic:           concept.topic,
                explanation:     concept.explanation,
                connections:     concept.connections,
                applicationPrompt: concept.applicationPrompt,
                generatedByAi:   concept.generatedByAi,
              }
            : null
        }
        due={due.map((d) => ({ id: d.id, kind: d.kind, prompt: d.prompt, answer: d.answer }))}
        queue={summary.stats}
        retention={summary.retention}
        trainingLinks={links.map((l) => ({
          id:           l.id,
          name:         l.name,
          url:          l.url,
          trains:       l.trains,
          sessions:     history[l.id]?.sessions    ?? 0,
          best:         history[l.id]?.best        ?? 0,
          last:         history[l.id]?.last        ?? 0,
          lastPlayedOn: history[l.id]?.lastPlayedOn ?? null,
        }))}
      />
    </div>
  );
}
