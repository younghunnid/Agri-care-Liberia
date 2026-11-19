/** Minimal cookie-aware JSON HTTP client used by every black-box test. Backend-neutral: it only needs a base URL. */

let baseUrl = '';
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}
export function getBaseUrl(): string {
  return baseUrl;
}

export class CookieJar {
  cookies = new Map<string, string>();

  updateFromHeaders(headers: Headers): void {
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  headerValue(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  getCsrf(): string {
    return decodeURIComponent(this.cookies.get('agri_csrf') || '');
  }
}

export interface ReqOptions {
  method?: string;
  body?: unknown;
  skipCsrf?: boolean;
  headers?: Record<string, string>;
}

export interface ReqResult {
  status: number;
  data: any;
  headers: Headers;
}

export async function req(jar: CookieJar, urlPath: string, opts: ReqOptions = {}): Promise<ReqResult> {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {...(opts.headers || {})};
  const cookieHeader = jar.headerValue();
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !opts.skipCsrf) {
    if (!jar.getCsrf()) {
      const csrfRes = await fetch(`${baseUrl}/api/v1/csrf-token`, {headers});
      jar.updateFromHeaders(csrfRes.headers);
      const updatedCookie = jar.headerValue();
      if (updatedCookie) headers['Cookie'] = updatedCookie;
    }
    headers['X-CSRF-Token'] = jar.getCsrf();
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  jar.updateFromHeaders(res.headers);
  const data = await res.json().catch(() => ({}));
  return {status: res.status, data, headers: res.headers};
}
