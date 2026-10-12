// Клиент API. Запросы идут на тот же домен (/api → NestJS через rewrites), cookie сессии — httpOnly.
// Изменяющие запросы несут CSRF-токен из cookie ain_csrf (double-submit).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : undefined;
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrf() {
  if (readCookie('ain_csrf')) return;
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(() => undefined).finally(() => (csrfPromise = null));
  await csrfPromise;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') {
    await ensureCsrf();
    headers['x-csrf-token'] = readCookie('ain_csrf') ?? '';
  }
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'network');
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; details?: Record<string, unknown> };
    const code = d.code ?? (res.status === 429 ? 'RATE_LIMITED' : res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN');
    throw new ApiError(res.status, code, d.message ?? res.statusText, d.details);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const fetcher = <T>(path: string) => api<T>(path);
