import crypto from 'node:crypto';
import path from 'node:path';
import express, {type Express, type NextFunction, type Request, type Response} from 'express';
import {getDb, getDbPath} from './db.ts';
import {hashOwnerKey, hashPassword, hashRequesterKey} from './security.ts';

/**
 * TEST-ONLY fixture API ("adapter contract") used by the black-box test harness (tests/harness).
 * It lets a test seed users and inspect server-side state WITHOUT the tests importing the database, so the very same test suite can run
 * against any backend that implements this contract (Node today, PHP in a later milestone). Contract: docs/TEST_HARNESS.md.
 *
 * It is mounted ONLY when APP_ENV=test, and then:
 *  - TEST_FIXTURE_TOKEN (>= 16 chars) must be set and is required in the `X-Test-Fixture-Token` header on every call;
 *  - the database must be an explicitly chosen disposable file, never the default `./data/agri_advisory.db`.
 * It exposes no raw SQL: every operation is a fixed, parameterised query.
 */

const COUNTABLE = new Set([
  'users',
  'marketplace_listings',
  'marketplace_inquiries',
  'demo_expert_requests',
  'local_language_recordings',
  'audit_logs',
  'sync_operations',
  'verification_challenges',
  'trusted_devices',
]);

function tokenGuard(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const given = Buffer.from(String(req.get('X-Test-Fixture-Token') ?? ''));
    const want = Buffer.from(expected);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      res.status(403).json({error: {code: 'FIXTURE_FORBIDDEN', message: 'Missing or wrong fixture token.'}});
      return;
    }
    next();
  };
}

export function mountTestFixtures(app: Express): void {
  if (process.env.APP_ENV !== 'test') return;
  const token = process.env.TEST_FIXTURE_TOKEN ?? '';
  if (token.length < 16) throw new Error('APP_ENV=test requires TEST_FIXTURE_TOKEN of at least 16 characters.');
  const defaultDb = path.resolve(process.cwd(), './data/agri_advisory.db');
  if (path.resolve(getDbPath()) === defaultDb) {
    throw new Error('Refusing to mount test fixtures on the default database. Set DB_PATH to a disposable file.');
  }

  const router = express.Router();
  router.use(express.json({limit: '1mb'}));
  router.use(tokenGuard(token));

  router.post('/users', (req, res) => {
    const {displayName, phone, password, roles, expertStatus, county, phoneVerified} = req.body ?? {};
    if (typeof displayName !== 'string' || typeof phone !== 'string' || typeof password !== 'string' || !Array.isArray(roles)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'displayName, phone, password and roles[] are required.'}});
      return;
    }
    const db = getDb();
    const id = Number(
      db
        .prepare(`INSERT INTO users (display_name, phone, password_hash, status, phone_verified_at, phone_claim_expires_at)
                  VALUES (?, ?, ?, 'active', CASE WHEN ? = 1 THEN datetime('now') END, CASE WHEN ? = 1 THEN NULL ELSE datetime('now', '+72 hours') END)`)
        .run(displayName, phone, hashPassword(password), phoneVerified === false ? 0 : 1, phoneVerified === false ? 0 : 1).lastInsertRowid
    );
    for (const roleName of roles as string[]) {
      const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as {id: number} | undefined;
      if (!role) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `Unknown role ${roleName}.`}});
        return;
      }
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, role.id);
    }
    if ((roles as string[]).includes('farmer')) {
      db.prepare("INSERT INTO farmer_profiles (user_id, county, preferred_language, crops_of_interest) VALUES (?, ?, 'en', '[]')").run(
        id,
        typeof county === 'string' ? county : 'Bong'
      );
    }
    if ((roles as string[]).includes('expert')) {
      db.prepare("INSERT INTO expert_profiles (user_id, specialty, county, bio, approval_status) VALUES (?, 'General', 'Bong', '', ?)").run(
        id,
        typeof expertStatus === 'string' ? expertStatus : 'approved'
      );
    }
    res.status(201).json({id});
  });

  /** Gives an existing user a new (private) password, e.g. to take a seeded demo account off its PUBLISHED password. Test-only. */
  router.post('/users/set-password', (req, res) => {
    const {phone, password} = req.body ?? {};
    if (typeof phone !== 'string' || typeof password !== 'string' || password.length < 10) { res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'phone and a password of 10+ characters are required.'}}); return; }
    const r = getDb().prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE phone = ?").run(hashPassword(password), phone);
    if (!r.changes) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such user.'}}); return; }
    res.json({ok: true});
  });

  // ---- test-only authentication adapters (narrow and explicit; mounted only with APP_ENV=test and the fixture token) ----
  /** Creates a REAL trusted-device row for an existing user and returns the raw cookie value, so a test can sign in through the normal login path. */
  router.post('/trusted-devices', async (req, res) => {
    const {phone} = req.body ?? {};
    const u = getDb().prepare('SELECT id FROM users WHERE phone = ?').get(String(phone)) as {id: number} | undefined;
    if (!u) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such user.'}}); return; }
    const {createTrustedDevice} = await import('./authSecurity.ts');
    const d = createTrustedDevice(u.id, 'Test fixture');
    res.status(201).json({token: d.token, id: d.id});
  });
  router.get('/users/by-phone/:phone', (req, res) => {
    const u = getDb().prepare('SELECT id, phone, phone_verified_at, session_version FROM users WHERE phone = ?').get(String(req.params.phone));
    if (!u) { res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such user.'}}); return; }
    res.json({user: u});
  });
  /** Makes a user's unverified-claim window end `hours` ago-from-now offset (negative = already expired). */
  router.post('/users/claim-expiry', (req, res) => {
    const {phone, hoursFromNow} = req.body ?? {};
    getDb().prepare("UPDATE users SET phone_claim_expires_at = datetime('now', ?) WHERE phone = ?").run(`${Number(hoursFromNow) >= 0 ? '+' : ''}${Number(hoursFromNow)} hours`, String(phone));
    res.json({ok: true});
  });
  /** Moves the clock of challenges for a user/purpose back by `ms` (to test expiry and resend cooldown without waiting). Never exposes secrets. */
  router.post('/challenges/age', (req, res) => {
    const {userId, phone, purpose, ms} = req.body ?? {};
    const n = Number(ms);
    const where = userId ? 'user_id = ?' : 'phone = ?';
    const r = getDb().prepare(`UPDATE verification_challenges SET created_ms = created_ms - ?, expires_ms = expires_ms - ?, last_sent_ms = last_sent_ms - ?, verified_ms = CASE WHEN verified_ms IS NULL THEN NULL ELSE verified_ms - ? END WHERE ${where} AND purpose = ?`)
      .run(n, n, n, n, userId ?? String(phone), String(purpose));
    res.json({changed: Number(r.changes)});
  });
  router.get('/challenges', (req, res) => {
    const userId = Number(req.query.userId);
    const rows = getDb().prepare('SELECT purpose, status, attempts, send_count, phone FROM verification_challenges WHERE user_id = ? ORDER BY id DESC').all(userId);
    res.json({challenges: rows});
  });
  router.delete('/otp-rate-events', (_req, res) => { getDb().prepare('DELETE FROM otp_rate_events').run(); getDb().prepare('DELETE FROM rate_limit_attempts').run(); res.json({ok: true}); });
  router.get('/audit-text', (_req, res) => {
    // Everything the audit log and challenge table contain, flattened, so tests can scan it for secrets/codes.
    const a = getDb().prepare('SELECT action, details_json, ip_hash FROM audit_logs').all();
    const c = getDb().prepare('SELECT public_id, purpose, phone, status FROM verification_challenges').all();
    res.json({text: JSON.stringify([a, c])});
  });

  router.get('/count/:table', (req, res) => {
    const table = String(req.params.table);
    if (!COUNTABLE.has(table)) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Table is not countable.'}});
      return;
    }
    const row = getDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {c: number};
    res.json({count: row.c});
  });

  router.get('/listings/:id', (req, res) => {
    const row = getDb()
      .prepare('SELECT id, price_lrd, seller_phone, phone_consent, moderation_status, seller_user_id, owner_key_hash, owner_token FROM marketplace_listings WHERE id = ?')
      .get(Number(req.params.id));
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such listing.'}});
      return;
    }
    res.json({listing: row});
  });

  router.get('/listings/by-legacy-token/:token', (req, res) => {
    const row = getDb().prepare('SELECT id FROM marketplace_listings WHERE owner_token = ?').get(String(req.params.token)) as {id: number} | undefined;
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such listing.'}});
      return;
    }
    res.json({id: row.id});
  });

  router.post('/listings/:id/moderation', (req, res) => {
    getDb().prepare('UPDATE marketplace_listings SET moderation_status = ? WHERE id = ?').run(String(req.body?.status), Number(req.params.id));
    res.json({ok: true});
  });

  router.post('/listings/:id/updated-at', (req, res) => {
    getDb().prepare('UPDATE marketplace_listings SET updated_at = ? WHERE id = ?').run(String(req.body?.value), Number(req.params.id));
    res.json({ok: true});
  });

  router.get('/expert-requests/:id', (req, res) => {
    const row = getDb()
      .prepare('SELECT id, status, expert_reply, assigned_expert_name, requester_key_hash, requester_token, user_id FROM demo_expert_requests WHERE id = ?')
      .get(Number(req.params.id));
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such request.'}});
      return;
    }
    res.json({request: row});
  });

  // The HMAC is backend-specific, so the backend computes it: tests only learn "how many rows belong to this key".
  router.post('/expert-requests/count-by-key', (req, res) => {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS c FROM demo_expert_requests WHERE requester_key_hash = ?')
      .get(hashRequesterKey(String(req.body?.key))) as {c: number};
    res.json({count: row.c});
  });

  router.post('/listings/key-matches', (req, res) => {
    const row = getDb().prepare('SELECT owner_key_hash FROM marketplace_listings WHERE id = ?').get(Number(req.body?.id)) as
      | {owner_key_hash: string}
      | undefined;
    res.json({matches: Boolean(row && row.owner_key_hash === hashOwnerKey(String(req.body?.key)))});
  });

  router.get('/recordings/:id', (req, res) => {
    const row = getDb().prepare('SELECT id, review_status FROM local_language_recordings WHERE id = ?').get(Number(req.params.id));
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'No such recording.'}});
      return;
    }
    res.json({recording: row});
  });

  router.get('/audit-count', (req, res) => {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS c FROM audit_logs WHERE action = ? AND (? = \'\' OR target_id = ?)')
      .get(String(req.query.action ?? ''), String(req.query.targetId ?? ''), String(req.query.targetId ?? '')) as {c: number};
    res.json({count: row.c});
  });

  router.get('/sync-operations/:opKey', (req, res) => {
    const rows = getDb()
      .prepare('SELECT actor, kind, status_code, response_json FROM sync_operations WHERE op_key = ?')
      .all(String(req.params.opKey));
    res.json({rows});
  });

  app.use('/__test__', router);
  console.warn('[test-fixtures] mounted /__test__ (APP_ENV=test). Never enable this in production.');
}
