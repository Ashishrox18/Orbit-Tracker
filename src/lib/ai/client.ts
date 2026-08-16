import "server-only";

import Groq from "groq-sdk";
import type { ZodType } from "zod";

import { AI_MAX_INPUT_CHARS, AI_TIMEOUT_MS, DEFAULT_GROQ_MODEL } from "../constants";

/**
 * The single point at which this application talks to Groq.
 *
 * Three guarantees the rest of the codebase relies on:
 *   1. It never throws. Every failure path returns a typed fallback, because
 *      the brief requires the app to stay usable with no AI at all.
 *   2. It never returns unvalidated model output. Everything passes a Zod
 *      schema first — the model is untrusted input.
 *   3. It never runs in the browser. `server-only` makes an accidental client
 *      import a build error rather than a leaked key.
 */

export type AiSource = "ai" | "fallback";

export interface AiResult<T> {
  data: T;
  source: AiSource;
  /** Populated on failure so callers can surface an honest reason. */
  reason?: string;
}

let client: Groq | null = null;

function getClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith("gsk_PASTE")) return null;
  if (!client) client = new Groq({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export function aiConfigured(): boolean {
  return getClient() !== null;
}

export function activeModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

/** Strip fences and prose a smaller model sometimes wraps around its JSON. */
function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export interface StructuredRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  fallback: T;
  maxTokens?: number;
}

/**
 * Ask Groq for JSON matching `schema`. One retry, and only for a malformed
 * response — a rate limit or a timeout falls straight through to the
 * fallback rather than spending more of a limited quota.
 */
export async function requestStructured<T>({
  system,
  user,
  schema,
  fallback,
  maxTokens = 900,
}: StructuredRequest<T>): Promise<AiResult<T>> {
  const groq = getClient();
  if (!groq) return { data: fallback, source: "fallback", reason: "not-configured" };

  const trimmedUser = user.slice(0, AI_MAX_INPUT_CHARS);
  let lastReason = "unknown";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const completion = await groq.chat.completions.create({
        model: activeModel(),
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              attempt === 0
                ? trimmedUser
                : `${trimmedUser}\n\nYour previous reply did not match the required JSON shape. Reply with valid JSON only, no prose.`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return { data: parsed.data, source: "ai" };

      lastReason = "invalid-shape";
      continue; // malformed output is the only thing worth retrying
    } catch (error) {
      // Deliberately coarse: the caller only needs to know it fell back, and
      // the error may carry request details that shouldn't reach a log.
      const status = (error as { status?: number }).status;
      const code = (error as { error?: { error?: { code?: string } } }).error?.error?.code;

      // Groq validates JSON mode server-side and rejects malformed generations
      // with a 400 rather than returning them. That is the same failure as a
      // local parse error, so it must retry — not fall through to the
      // fallback on the first attempt.
      if (code === "json_validate_failed" && attempt === 0) {
        lastReason = "invalid-shape";
        continue;
      }

      lastReason =
        status === 429 ? "rate-limited" : code ? code : status ? `http-${status}` : "network";
      break;
    }
  }

  return { data: fallback, source: "fallback", reason: lastReason };
}

/** Free-text variant for the assistant, where JSON adds nothing. */
export async function requestText(
  system: string,
  user: string,
  fallback: string,
  maxTokens = 500,
): Promise<AiResult<string>> {
  const groq = getClient();
  if (!groq) return { data: fallback, source: "fallback", reason: "not-configured" };

  try {
    const completion = await groq.chat.completions.create({
      model: activeModel(),
      temperature: 0.5,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user.slice(0, AI_MAX_INPUT_CHARS) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return { data: fallback, source: "fallback", reason: "empty" };
    return { data: text, source: "ai" };
  } catch (error) {
    const status = (error as { status?: number }).status;
    return {
      data: fallback,
      source: "fallback",
      reason: status === 429 ? "rate-limited" : "network",
    };
  }
}
