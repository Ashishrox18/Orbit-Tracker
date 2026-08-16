"use client";

/**
 * Browser-side fetch wrapper. Returns a discriminated result rather than
 * throwing, so every caller is forced to render the error path — the brief
 * requires that no failure ever breaks the UI.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function post<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return send<T>("POST", url, body);
}

export async function patch<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return send<T>("PATCH", url, body);
}

async function send<T>(method: string, url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await res.json().catch(() => null)) as
      | (T & { error?: string })
      | null;

    if (!res.ok) {
      return {
        ok: false,
        error: payload?.error ?? `Request failed (${res.status}).`,
      };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

export async function put<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return send<T>("PUT", url, body);
}

export async function del<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return send<T>("DELETE", url, body);
}
