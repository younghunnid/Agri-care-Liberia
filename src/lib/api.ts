import {parseRetryAfter} from './retryPolicy';
export interface ApiErrorPayload {
  error?:
    | {
        code?: string;
        message?: string;
      }
    | string;
  message?: string;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(forceRefresh = false, signal?: AbortSignal | null): Promise<string> {
  if (!forceRefresh) {
    const existing = getCookie('agri_csrf');
    if (existing) return existing;
  }

  const res = await fetch('/api/v1/csrf-token', {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      'CSRF_FETCH_FAILED',
      `Security token check failed (HTTP ${res.status}). Please refresh the page and try again.`
    );
  }
  const data = (await res.json().catch(() => ({}))) as {csrfToken?: string};
  return getCookie('agri_csrf') || data.csrfToken || '';
}

export class ApiRequestError extends Error {
  status: number;
  code: string;
  /** Parsed JSON body of the failed response (for extra fields such as attemptsLeft). Never contains secrets. */
  body?: unknown;
  /** Milliseconds the server asked us to wait (HTTP Retry-After), if it sent a usable value. */
  retryAfterMs?: number | null;

  constructor(status: number, code: string, message: string, body?: unknown, retryAfterMs?: number | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

function extractErrorDetails(
  status: number,
  parsed: unknown
): {code: string; message: string} {
  const payload = (parsed && typeof parsed === 'object' ? parsed : {}) as ApiErrorPayload;
  const nestedError =
    payload.error && typeof payload.error === 'object' ? payload.error : undefined;
  const code = nestedError?.code || 'REQUEST_FAILED';

  let message =
    nestedError?.message ||
    (typeof payload.error === 'string' ? payload.error : undefined) ||
    payload.message;

  if (status === 403 && code === 'CSRF_INVALID') {
    message =
      'Security check failed (CSRF cookie was missing or blocked). Please ensure cookies are allowed for this site or refresh the page and try again.';
  } else if (!message) {
    if (status === 403) {
      message =
        'Request forbidden (HTTP 403). Please refresh the page, confirm cookies are enabled in your browser, and try again.';
    } else {
      message = `Request failed (${status})`;
    }
  }

  return {code, message};
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _csrfRetried = false
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  if (isStateChanging) {
    const csrf = await ensureCsrfToken(_csrfRetried, options.signal);
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const {code, message} = extractErrorDetails(response.status, parsed);
    if (response.status === 403 && code === 'CSRF_INVALID' && isStateChanging && !_csrfRetried) {
      return apiFetch<T>(path, options, true);
    }
    throw new ApiRequestError(response.status, code, message, parsed, parseRetryAfter(response.headers.get('Retry-After')));
  }

  return parsed as T;
}
