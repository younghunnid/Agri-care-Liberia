import type {NextFunction, Response} from 'express';
import {getDb} from './db.ts';
import {hashOwnerKey, hashRequesterKey, isValidOwnerKey, type AuthedRequest} from './security.ts';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
const RETENTION_DAYS = 30;

/** Who is making the request: the signed-in user, else the client-held owner/requester token. */
function actorOf(req: AuthedRequest): string {
  if (req.user) return `user:${req.user.id}`;
  // The owner key is a credential: scope by its hash, never by the raw value.
  if (isValidOwnerKey(req.body?.ownerKey)) return `owner:${hashOwnerKey(req.body.ownerKey).slice(0, 32)}`;
  if (isValidOwnerKey(req.body?.requesterKey)) return `requester:${hashRequesterKey(req.body.requesterKey).slice(0, 32)}`;
  const token = req.body?.requesterToken;
  return typeof token === 'string' && token.trim() ? `anon:${token.trim().slice(0, 80)}` : `ip:${req.ip}`;
}

/**
 * Makes a POST safe to retry. Requests without an `Idempotency-Key` header behave exactly as
 * before. With a key, the first successful (2xx) response is stored and replayed for any
 * repeat by the same actor. Failed (non-2xx) responses are not stored, so a corrected retry
 * is allowed. The handler runs synchronously, so check-then-store cannot interleave.
 */
export function idempotent(kind: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const key = req.get('Idempotency-Key');
    if (!key) {
      next();
      return;
    }
    if (!KEY_PATTERN.test(key)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid Idempotency-Key header.'}});
      return;
    }
    const db = getDb();
    const actor = actorOf(req);
    const row = db
      .prepare('SELECT kind, status_code, response_json FROM sync_operations WHERE actor = ? AND op_key = ?')
      .get(actor, key) as {kind: string; status_code: number; response_json: string} | undefined;

    if (row) {
      if (row.kind !== kind) {
        res.status(422).json({error: {code: 'IDEMPOTENCY_KEY_REUSED', message: 'This key was used for a different request.'}});
        return;
      }
      res.setHeader('Idempotent-Replay', 'true');
      res.status(row.status_code).json({...JSON.parse(row.response_json), replayed: true});
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          db.prepare(
            'INSERT OR IGNORE INTO sync_operations (actor, op_key, kind, status_code, response_json) VALUES (?, ?, ?, ?, ?)'
          ).run(actor, key, kind, res.statusCode, JSON.stringify(body));
          db.prepare("DELETE FROM sync_operations WHERE created_at < datetime('now', ?)").run(`-${RETENTION_DAYS} days`);
        } catch {
          // Storing the key must never break a request that already succeeded.
        }
      }
      return originalJson(body);
    };
    next();
  };
}
