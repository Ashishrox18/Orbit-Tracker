import "server-only";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Shared API boundary: body-size cap, schema validation, rate limiting and
 * error shaping. Every route goes through `handle` so no endpoint can
 * accidentally skip one of them.
 */

const MAX_BODY_BYTES = 32_000;

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Fixed-window limiter held in module memory. Adequate for a single-user app
 * on one instance, and deliberately not Redis — the brief rules it out and the
 * threat here is an accidental refresh loop, not a botnet.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

/** Test seam — the limiter is module state, so suites must be able to clear it. */
export function resetRateLimits(): void {
  buckets.clear();
}

export interface HandlerOptions {
  /** Requests allowed per window. Omit for unlimited (read-only routes). */
  limit?: number;
  windowMs?: number;
  rateKey?: string;
}

/**
 * Wrap a route handler. Validates the JSON body against `schema`, enforces the
 * rate limit, and converts anything thrown into a safe message — internal
 * errors and database text never reach the client.
 */
export async function handle<T, R>(
  request: Request,
  schema: ZodType<T>,
  options: HandlerOptions,
  run: (input: T) => Promise<R>,
): Promise<NextResponse> {
  const { limit, windowMs = 60_000, rateKey } = options;

  if (limit !== undefined) {
    const key = rateKey ?? new URL(request.url).pathname;
    if (!rateLimit(key, limit, windowMs)) {
      return fail("Too many requests. Wait a moment and try again.", 429);
    }
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return fail("Request body is too large.", 413);
  }

  let parsedJson: unknown;
  try {
    parsedJson = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    return fail(
      first ? `${path ? `${path}: ` : ""}${first.message}` : "Invalid request.",
      400,
    );
  }

  try {
    return ok(await run(result.data));
  } catch (error) {
    // Log the type only. Messages can carry connection strings and user text.
    console.error(`[api] ${new URL(request.url).pathname} failed:`, (error as Error).name);
    const message = error instanceof UserFacingError ? error.message : "Something went wrong.";
    return fail(message, error instanceof UserFacingError ? error.status : 500);
  }
}

/** Errors whose message is safe to show. Everything else becomes generic. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}
