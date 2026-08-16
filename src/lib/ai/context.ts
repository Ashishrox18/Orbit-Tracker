import type { Insight } from "../behavior";
import { formatDuration } from "../time";

/**
 * The concise context builder.
 *
 * Everything Groq ever sees about the user passes through here, and it is
 * deliberately a summary rather than a database dump: fewer tokens on a small
 * free tier, and a much smaller privacy surface. Reflections, journal text and
 * raw review answers are never included.
 *
 * What is sent: first name, today's mode, energy, available time, the three
 * win titles, up to three open difficulty topics, and up to three
 * already-computed insight sentences. Nothing else.
 */

export interface AssistantContext {
  name: string;
  date: string;
  mode: "normal" | "exam";
  energyLevel: number;
  availableMinutes: number;
  wins: { winType: string; title: string; status: string }[];
  pendingTaskTitles: string[];
  openDifficulties: { topic: string; subject: string; difficulty: string }[];
  insights: Insight[];
}

export function renderContext(ctx: AssistantContext): string {
  const lines: string[] = [];

  lines.push(`User: ${ctx.name}`);
  lines.push(`Date: ${ctx.date}`);
  lines.push(`Mode: ${ctx.mode === "exam" ? "EXAM MODE" : "normal"}`);
  lines.push(`Energy today: ${ctx.energyLevel}/5`);
  lines.push(`Time available: ${formatDuration(ctx.availableMinutes)}`);

  if (ctx.wins.length > 0) {
    lines.push("Three wins:");
    for (const win of ctx.wins) {
      const mark = win.status === "completed" ? "done" : "not yet";
      lines.push(`  - ${win.winType}: ${win.title} (${mark})`);
    }
  }

  if (ctx.pendingTaskTitles.length > 0) {
    lines.push(`Still pending: ${ctx.pendingTaskTitles.slice(0, 6).join("; ")}`);
  }

  if (ctx.openDifficulties.length > 0) {
    lines.push("Open difficulties:");
    for (const d of ctx.openDifficulties.slice(0, 3)) {
      lines.push(`  - ${d.topic} (${d.subject}, ${d.difficulty})`);
    }
  }

  const reliable = ctx.insights.filter((i) => i.reliable).slice(0, 3);
  if (reliable.length > 0) {
    lines.push("Measured behaviour:");
    for (const insight of reliable) lines.push(`  - ${insight.text}`);
  } else {
    lines.push("Measured behaviour: not enough history yet — do not invent statistics.");
  }

  return lines.join("\n");
}

/** Shared guardrails prepended to every prompt. */
export const BASE_RULES = [
  "You are Orbit, a personal chief-of-staff and learning coach.",
  "Be specific and brief. No motivational filler, no emoji, no preamble.",
  "Never invent statistics. Only reference numbers that appear in the context you were given.",
  "If the context says there is not enough history, say so plainly instead of guessing.",
].join(" ");
