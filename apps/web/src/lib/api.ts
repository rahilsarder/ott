export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent
 * callers share one request so a page with several queries does not rotate the
 * refresh token multiple times in parallel (which would trip reuse detection).
 */
export function refreshSession(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false for calls that must not trigger a refresh retry (login, refresh). */
  retryOnUnauthorized?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, retryOnUnauthorized = true, headers, ...rest } = options;

  const send = async (token: string | null): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let res = await send(accessToken);

  if (res.status === 401 && retryOnUnauthorized) {
    const fresh = await refreshSession();
    if (fresh) res = await send(fresh);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, messageOf(payload) ?? `Request failed (${res.status})`, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function messageOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.errors) && record.errors.length) {
    const first = record.errors[0] as { message?: string };
    if (first?.message) return first.message;
  }
  if (typeof record.message === 'string') return record.message;
  if (Array.isArray(record.message) && typeof record.message[0] === 'string') return record.message[0];
  return null;
}

/**
 * Multipart upload from a caller-built FormData. Kept separate from `api`
 * because the body must stay a FormData instance and the browser must set the
 * multipart boundary itself — setting Content-Type by hand corrupts the
 * request.
 */
export async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const send = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

  let res = await send(accessToken);
  if (res.status === 401) {
    const fresh = await refreshSession();
    if (fresh) res = await send(fresh);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, messageOf(payload) ?? `Upload failed (${res.status})`, payload);
  }
  return (await res.json()) as T;
}

/** Single-file convenience wrapper around {@link uploadForm}. */
export async function uploadFile<T>(path: string, file: File, field = 'file'): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  return uploadForm<T>(path, form);
}

/** Server-side fetch for React Server Components — no token, public data only. */
export async function apiPublic<T>(path: string, revalidateSec = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: revalidateSec } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
