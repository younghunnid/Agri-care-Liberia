import crypto from 'node:crypto';

/**
 * Turns a raw HTTP exchange into a stable, comparable "contract" record: status, key headers, cookie attributes (never values) and a
 * normalised JSON body. Volatile values (ids, timestamps, tokens, long strings) are masked so the snapshot captures SHAPE, TYPES, STATUS CODES,
 * ERROR CODES and business values, which is exactly what a second backend (PHP) must reproduce.
 */

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;
const HEX_SECRET = /^[0-9a-f]{32,}$/i;
const ID_KEY = /(^id$|_id$|Id$)/;

function maskString(value: string): string {
  if (TIMESTAMP.test(value)) return '<timestamp>';
  if (HEX_SECRET.test(value)) return `<hex:${value.length}>`;
  if (value.startsWith('data:')) return `<data-url:${value.slice(5, value.indexOf(';')) || 'unknown'}>`;
  if (value.length > 300) {
    const sha = crypto.createHash('sha1').update(value).digest('hex').slice(0, 8);
    return `<string len=${value.length} sha=${sha}>`;
  }
  return value;
}

export function normalizeJson(value: unknown, key = ''): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return ID_KEY.test(key) ? '<id>' : value;
  if (typeof value === 'string') return key === 'csrfToken' ? '<token>' : maskString(value);
  if (Array.isArray(value)) return value.map((v) => normalizeJson(v, key));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) out[k] = normalizeJson((value as Record<string, unknown>)[k], k);
    return out;
  }
  return String(value);
}

export interface CookieShape {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string | null;
  path: string | null;
  hasMaxAge: boolean;
}

export function cookieShapes(headers: Headers): CookieShape[] {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [];
  return raw
    .map((line) => {
      const parts = line.split(';').map((p) => p.trim());
      const name = parts[0].split('=')[0];
      const attr = (n: string) => parts.find((p) => p.toLowerCase().startsWith(`${n.toLowerCase()}=`))?.split('=')[1] ?? null;
      return {
        name,
        httpOnly: parts.some((p) => p.toLowerCase() === 'httponly'),
        secure: parts.some((p) => p.toLowerCase() === 'secure'),
        sameSite: attr('SameSite'),
        path: attr('Path'),
        hasMaxAge: attr('Max-Age') !== null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const KEEP_HEADERS = ['content-type', 'idempotent-replay', 'retry-after', 'x-content-type-options', 'referrer-policy'];

export function headerShape(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of KEEP_HEADERS) {
    const v = headers.get(h);
    if (v !== null) out[h] = h === 'content-type' ? v.split(';')[0].trim().toLowerCase() : v;
  }
  return out;
}

export interface DiffEntry {
  path: string;
  expected: unknown;
  actual: unknown;
}

export function deepDiff(expected: unknown, actual: unknown, path = '$', out: DiffEntry[] = []): DiffEntry[] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return out;
  const bothObjects = expected && actual && typeof expected === 'object' && typeof actual === 'object' && Array.isArray(expected) === Array.isArray(actual);
  if (!bothObjects) {
    out.push({path, expected, actual});
    return out;
  }
  if (Array.isArray(expected)) {
    const a = actual as unknown[];
    if (expected.length !== a.length) out.push({path: `${path}.length`, expected: expected.length, actual: a.length});
    for (let i = 0; i < Math.min(expected.length, a.length); i++) deepDiff(expected[i], a[i], `${path}[${i}]`, out);
    return out;
  }
  const e = expected as Record<string, unknown>;
  const a = actual as Record<string, unknown>;
  for (const k of new Set([...Object.keys(e), ...Object.keys(a)])) {
    if (!(k in a)) out.push({path: `${path}.${k}`, expected: e[k], actual: '<missing>'});
    else if (!(k in e)) out.push({path: `${path}.${k}`, expected: '<missing>', actual: a[k]});
    else deepDiff(e[k], a[k], `${path}.${k}`, out);
  }
  return out;
}
