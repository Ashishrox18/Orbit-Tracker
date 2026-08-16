import "server-only";

import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { ZodType } from "zod";

import { db } from "@/db";
import { aiCache } from "@/db/schema";

/**
 * Persistent cache for Groq responses.
 *
 * The free tier is small and a page refresh must never cost a request, so
 * every AI call is keyed by (user, kind, day, input fingerprint) and stored in
 * Postgres rather than memory — serverless instances don't survive long enough
 * for an in-process cache to help.
 */

export function cacheKey(kind: string, day: string, input: unknown): string {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input ?? null))
    .digest("hex")
    .slice(0, 16);
  return `${kind}:${day}:${fingerprint}`;
}

export async function readCache<T>(
  userId: string,
  key: string,
  schema: ZodType<T>,
): Promise<T | null> {
  const rows = await db
    .select()
    .from(aiCache)
    .where(and(eq(aiCache.userId, userId), eq(aiCache.cacheKey, key)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // A schema change can leave stale rows that no longer parse. Treat those as
  // a miss rather than serving something the app can't render.
  const parsed = schema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

/**
 * Cached answers are keyed by day, so anything older than this can never be
 * read again — it is pure storage cost. Swept opportunistically on write
 * rather than on a schedule, because this app has no cron.
 */
const CACHE_TTL_DAYS = 45;

async function sweep(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000);
  await db
    .delete(aiCache)
    .where(and(eq(aiCache.userId, userId), lt(aiCache.createdAt, cutoff)));
}

export async function writeCache(
  userId: string,
  key: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  await db
    .insert(aiCache)
    .values({ userId, cacheKey: key, kind, payload })
    .onConflictDoUpdate({
      target: [aiCache.userId, aiCache.cacheKey],
      set: { payload, createdAt: new Date() },
    });

  // Cheap on an indexed column, and only runs when we were writing anyway.
  await sweep(userId);
}

/**
 * Cache-through wrapper. `produce` is only invoked on a miss, and only a
 * genuine AI result is stored — caching a fallback would pin the degraded
 * answer for the rest of the day.
 */
export async function cached<T>(
  userId: string,
  kind: string,
  day: string,
  input: unknown,
  schema: ZodType<T>,
  produce: () => Promise<{ data: T; source: "ai" | "fallback"; reason?: string }>,
): Promise<{ data: T; source: "ai" | "fallback" | "cache"; reason?: string }> {
  const key = cacheKey(kind, day, input);

  const hit = await readCache(userId, key, schema);
  if (hit !== null) return { data: hit, source: "cache" };

  const result = await produce();
  if (result.source === "ai") {
    await writeCache(userId, key, kind, result.data);
  }
  return result;
}
