import "server-only";

import {
  feynmanJudgement,
  linkSuggestions,
  nodeSeed,
  richConcept,
  sentenceJudgement,
  vocabularySet,
  weeklyConsolidation,
  type FeynmanJudgement,
  type LinkSuggestions,
  type NodeSeed,
  type RichConcept,
  type SentenceJudgement,
  type VocabularySet,
  type WeeklyConsolidation,
} from "../contracts";
import { cached } from "./cache";
import { requestStructured } from "./client";
import { BASE_RULES } from "./context";

/**
 * AI for the four Learn layers.
 *
 * Same contract as everywhere else: never throws, never returns unvalidated
 * output, and every function degrades to something the user can still work
 * with. Prompts specify the exact JSON shape by example — brace-notation key
 * lists made the model emit unquoted values.
 */

/* --------------------------------------------------- layer 1: vocabulary */

/** Offline set. Real words with real etymologies — a placeholder that teaches. */
const FALLBACK_WORDS: VocabularySet["words"] = [
  {
    word: "obdurate",
    partOfSpeech: "adjective",
    meaning: "Stubbornly refusing to change an opinion or course of action.",
    etymology: "Latin obduratus, from ob- (against) + durare (to harden).",
    examples: ["The committee remained obdurate despite three rounds of evidence."],
  },
  {
    word: "ephemeral",
    partOfSpeech: "adjective",
    meaning: "Lasting for a very short time.",
    etymology: "Greek ephemeros, 'lasting only a day'.",
    examples: ["Mayflies are the standard example of an ephemeral life."],
  },
  {
    word: "salient",
    partOfSpeech: "adjective",
    meaning: "Most noticeable or important; standing out from its surroundings.",
    etymology: "Latin salire, 'to leap' — a salient point leaps out at you.",
    examples: ["Strip the report to its salient findings before the meeting."],
  },
  {
    word: "tractable",
    partOfSpeech: "adjective",
    meaning: "Easy to control, manage, or solve.",
    etymology: "Latin tractare, 'to handle'.",
    examples: ["Breaking the proof into lemmas made an intractable problem tractable."],
  },
  {
    word: "sanguine",
    partOfSpeech: "adjective",
    meaning: "Optimistic, especially in a difficult situation.",
    etymology: "Latin sanguineus, 'of blood' — from medieval humour theory.",
    examples: ["She stayed sanguine about the deadline even after the third setback."],
  },
];

export async function generateVocabulary(
  userId: string,
  day: string,
  count: number,
  subjects: string[],
  known: string[],
): Promise<{ data: VocabularySet; source: "ai" | "fallback" | "cache" }> {
  const fallback: VocabularySet = { words: FALLBACK_WORDS.slice(0, Math.min(count, 5)) };

  return cached(userId, "vocab", day, { count, subjects }, vocabularySet, () =>
    requestStructured({
      system: `${BASE_RULES} You teach vocabulary. Reply with JSON in exactly this shape, every value a quoted string:
{"words":[{"word":"obdurate","partOfSpeech":"adjective","meaning":"...","etymology":"...","examples":["...","..."]}]}
Choose words that are genuinely useful in writing and argument — not obscure trivia. Etymology must be real. Each example must be a full sentence showing the word in natural use.`,
      user:
        `Give exactly ${count} words for an ambitious adult learner.\n` +
        `Their fields: ${subjects.join(", ") || "general"}.\n` +
        (known.length ? `Do NOT repeat any of these: ${known.slice(0, 60).join(", ")}.\n` : "") +
        `Return only JSON.`,
      schema: vocabularySet,
      fallback,
      maxTokens: 2_000,
    }),
  );
}

/** Not cached — every attempt is different text and deserves a fresh read. */
export async function judgeSentence(
  word: string,
  meaning: string,
  sentence: string,
): Promise<{ data: SentenceJudgement; source: "ai" | "fallback" }> {
  const fallback: SentenceJudgement = {
    verdict: "close",
    feedback: "AI is unavailable, so this wasn't checked. Compare your sentence with the meaning above.",
    improved: "",
  };

  const result = await requestStructured({
    system: `${BASE_RULES} You mark one sentence for correct word use. Reply with JSON in exactly this shape:
{"verdict":"correct","feedback":"one or two sentences","improved":"a better sentence, or empty string if theirs is already good"}
verdict must be exactly "correct", "close", or "misused". Judge only whether the word is used correctly — not style.`,
    user: `Word: ${word}\nMeaning: ${meaning}\nTheir sentence: "${sentence}"\n\nReturn only JSON.`,
    schema: sentenceJudgement,
    fallback,
    maxTokens: 400,
  });
  return { data: result.data, source: result.source };
}

/* ------------------------------------------------------ layer 2: concept */

export async function generateRichConcept(
  userId: string,
  day: string,
  seed: string,
  subjects: string[],
  mode: "normal" | "exam",
): Promise<{ data: RichConcept; source: "ai" | "fallback" | "cache" }> {
  const fallback: RichConcept = {
    topic: seed,
    summary: `A working definition of ${seed}, to be filled in from your own reading today.`,
    explanation:
      `AI is unavailable, so this card is a scaffold rather than a lesson. Write two paragraphs on ` +
      `${seed} from memory, then check them against a source. Note precisely where your version was ` +
      `wrong — the gap between what you believed and what is true is the part worth keeping.`,
    workedExample: {
      setup: `Find one concrete instance of ${seed}.`,
      walkthrough: "Work it through end to end, writing each step before you check it.",
      result: "Compare against a worked source and mark every divergence.",
    },
    facts: [
      { claim: "Fill in one verified figure from your own source.", figure: "", source: "" },
      { claim: "Fill in a second, from a different source.", figure: "", source: "" },
    ],
    connections: [
      { domain: "Your subject", insight: `Where does ${seed} already appear in what you study?` },
      { domain: "Daily life", insight: `Name a decision this week ${seed} would have improved.` },
      { domain: "Another field", insight: `Which unrelated field uses the same structure?` },
    ],
    applicationPrompt: `Where could you use ${seed} before the end of today?`,
  };

  return cached(userId, "concept", day, { seed, mode }, richConcept, () =>
    requestStructured({
      system: `${BASE_RULES} You write a professional-grade concept card for an ambitious adult. Reply with JSON in exactly this shape:
{"topic":"...","summary":"2 sentences","explanation":"250-350 words","workedExample":{"setup":"...","walkthrough":"...","result":"..."},"facts":[{"claim":"...","figure":"...","source":"..."}],"connections":[{"domain":"...","insight":"..."}],"applicationPrompt":"..."}
Requirements: the explanation must be precise and concrete, no filler and no motivational tone. The worked example must contain actual numbers worked through step by step. Every fact must carry a real figure and name its source. Connections must be from genuinely different fields.`,
      user:
        `Topic: ${seed}\nLearner's fields: ${subjects.join(", ") || "general"}\nMode: ${mode}\n\n` +
        `If you are not confident a figure is accurate, say so in the source field rather than inventing one. Return only JSON.`,
      schema: richConcept,
      fallback,
      maxTokens: 3_500,
    }),
  );
}

export async function judgeFeynman(
  topic: string,
  explanation: string,
): Promise<{ data: FeynmanJudgement; source: "ai" | "fallback" }> {
  const jargon = explanation
    .split(/\s+/)
    .filter((w) => w.length > 12)
    .slice(0, 5);

  const fallback: FeynmanJudgement = {
    clarityScore: 5,
    accuracyScore: 5,
    jargonFound: jargon,
    strongestPart: "Not assessed — AI is unavailable.",
    weakestPart: "Not assessed.",
    oneThingToFix: jargon.length
      ? `Replace the longest words you used (${jargon.slice(0, 3).join(", ")}) with plain ones.`
      : "Read it aloud. Anywhere you hesitate is the part that isn't clear yet.",
  };

  const result = await requestStructured({
    system: `${BASE_RULES} You mark an explanation given to a five-year-old (the Feynman technique). Reply with JSON in exactly this shape:
{"clarityScore":7,"accuracyScore":8,"jargonFound":["word"],"strongestPart":"...","weakestPart":"...","oneThingToFix":"..."}
Scores are integers 1-10. clarityScore judges whether a child would follow it. accuracyScore judges whether simplifying broke the truth. jargonFound lists words a five-year-old would not know. Be exacting — a generous score teaches nothing.`,
    user: `Topic: ${topic}\n\nTheir explanation:\n"${explanation}"\n\nReturn only JSON.`,
    schema: feynmanJudgement,
    fallback,
    maxTokens: 700,
  });
  return { data: result.data, source: result.source };
}

/* ----------------------------------------------------- layer 3: mind map */

export async function seedNodeSummary(
  title: string,
): Promise<{ data: NodeSeed; source: "ai" | "fallback" }> {
  const fallback: NodeSeed = {
    summary: `${title} — write your own summary here. The note is yours; the point is that you author it.`,
    domain: "abstract",
  };

  const result = await requestStructured({
    system: `${BASE_RULES} You write one short neutral summary of a concept for a personal knowledge map. Reply with JSON in exactly this shape:
{"summary":"3-4 sentences","domain":"science"}
domain must be exactly one of: cosmology, history, science, mathematics, technology, politics, economics, philosophy, psychology, emotion, art, abstract.`,
    user: `Concept: ${title}\n\nReturn only JSON.`,
    schema: nodeSeed,
    fallback,
    maxTokens: 500,
  });
  return { data: result.data, source: result.source };
}

/**
 * Suggests links between existing nodes. Suggestions are stored flagged and
 * are not part of the web until the user accepts them — an AI-authored graph
 * would not be the user's own map.
 */
export async function suggestLinks(
  userId: string,
  day: string,
  nodes: { title: string; domain: string }[],
): Promise<{ data: LinkSuggestions; source: "ai" | "fallback" | "cache" }> {
  const fallback: LinkSuggestions = { links: [] };
  if (nodes.length < 2) return { data: fallback, source: "fallback" };

  const titles = nodes.map((n) => `${n.title} (${n.domain})`).join("; ");

  return cached(userId, "links", day, { count: nodes.length, titles }, linkSuggestions, () =>
    requestStructured({
      system: `${BASE_RULES} You propose connections between concepts in someone's knowledge map. Reply with JSON in exactly this shape:
{"links":[{"from":"exact node title","to":"exact node title","relationship":"short verb phrase","why":"one sentence"}]}
Use ONLY titles from the list given, spelled exactly. Prefer non-obvious links across different domains — a link between two science nodes is worth less than one between physics and economics. Return an empty array rather than a weak link.`,
      user: `Nodes:\n${titles}\n\nPropose up to 5 links. Return only JSON.`,
      schema: linkSuggestions,
      fallback,
      maxTokens: 1_200,
    }),
  );
}

/* ------------------------------------------------- Sunday consolidation */

export async function consolidateWeek(
  userId: string,
  weekEnding: string,
  material: { words: string[]; concepts: string[]; nodes: string[]; resolved: string[] },
): Promise<{ data: WeeklyConsolidation; source: "ai" | "fallback" | "cache" }> {
  const all = [
    ...material.words.map((w) => ({ prompt: `What does "${w}" mean?`, answer: w, source: "vocabulary" })),
    ...material.concepts.map((c) => ({ prompt: `Explain ${c} in two sentences.`, answer: c, source: "concept" })),
    ...material.nodes.map((n) => ({ prompt: `What did you record about ${n}?`, answer: n, source: "mind map" })),
  ];

  const fallback: WeeklyConsolidation = {
    synthesis:
      `This week you added ${material.words.length} words, ${material.concepts.length} concepts, ` +
      `${material.nodes.length} map nodes and resolved ${material.resolved.length} difficulties. ` +
      `AI is unavailable, so work through the recall questions below unaided and mark yourself honestly.`,
    questions: all.slice(0, 12).length >= 3 ? all.slice(0, 12) : [
      { prompt: "What is the single most useful thing you learned this week?", answer: "Your answer", source: "reflection" },
      { prompt: "What did you fail to retain, and why?", answer: "Your answer", source: "reflection" },
      { prompt: "What will you do differently next week?", answer: "Your answer", source: "reflection" },
    ],
  };

  return cached(userId, "weekly", weekEnding, material, weeklyConsolidation, () =>
    requestStructured({
      system: `${BASE_RULES} You run a weekly consolidation session. Reply with JSON in exactly this shape:
{"synthesis":"...","questions":[{"prompt":"...","answer":"...","source":"vocabulary"}]}
synthesis must find the actual through-line connecting this week's material — where two items reinforce or contradict each other. Do not list the items back. Questions must require retrieval from memory, not recognition.`,
      user:
        `Words: ${material.words.join(", ") || "none"}\n` +
        `Concepts: ${material.concepts.join(", ") || "none"}\n` +
        `Map nodes: ${material.nodes.join(", ") || "none"}\n` +
        `Difficulties resolved: ${material.resolved.join(", ") || "none"}\n\n` +
        `Write the synthesis and 5-10 recall questions. Return only JSON.`,
      schema: weeklyConsolidation,
      fallback,
      maxTokens: 2_200,
    }),
  );
}
