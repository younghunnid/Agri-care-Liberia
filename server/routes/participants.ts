import crypto from 'node:crypto';
import {Router} from 'express';
import {LIBERIA_COUNTIES} from '../constants.ts';
import {getDb} from '../db.ts';
import {type AuthedRequest, checkAndRecordRateLimit, clientAddress, hashIdentifier, hashRequesterKey, isSharedDemoAccount, isStrongDeviceKey, isSyntheticAccount, requireRole} from '../security.ts';
import {PARTICIPANT_CATEGORIES, REGISTRY_CONSENT_TEXT, REGISTRY_CONSENT_VERSION, REAL_REGISTRY_CONSENT_VERSION, REAL_REGISTRY_CONSENT_TEXT, type Participant} from '../../src/lib/participantRegistry.ts';
import {registryAggregates} from '../participantRegistry.ts';
import {writeLimitScale} from '../limits.ts';
import {registryMode} from '../registryMode.ts';
export const participantsRouter = Router();
interface Row {id: number; user_id: number | null; requester_hash: string; category: Participant['category']; county: string; is_synthetic: number}
const fail = (res: import('express').Response, status: number, code: string, message: string) => { res.status(status).json({error: {code, message}}); };
const projection = (r: Row): Participant => ({category: r.category, county: r.county, synthetic: r.is_synthetic === 1, phoneVerified: false, channel: 'ussd-browser', identity: r.user_id === null ? 'device' : 'account', consentVersion: r.is_synthetic === 1 ? REGISTRY_CONSENT_VERSION : REAL_REGISTRY_CONSENT_VERSION});
// Reuse the existing private browser requester identity, but domain-separate its registry hash.
const registryHash = (key: string) => crypto.createHash('sha256').update('participant-registry-v1:' + hashRequesterKey(key)).digest('hex');
// A real account's registry identity does not depend on any browser key (one row per account, whatever device it uses).
const accountHash = (userId: number) => crypto.createHash('sha256').update('participant-registry-v1:account:' + userId).digest('hex');
const consentVersionFor = (synthetic: boolean) => (synthetic ? REGISTRY_CONSENT_VERSION : REAL_REGISTRY_CONSENT_VERSION);
function own(req: AuthedRequest, hash: string): Row | undefined {
  return (req.user ? getDb().prepare('SELECT * FROM participant_registrations WHERE user_id = ?').get(req.user.id) : getDb().prepare('SELECT * FROM participant_registrations WHERE requester_hash = ? AND user_id IS NULL').get(hash)) as Row | undefined;
}
participantsRouter.get('/participants/me', (req: AuthedRequest, res) => {
  const mode = registryMode();
  if (mode === 'real') {
    // Real deployment: ONLY a signed-in, non-synthetic account can be a participant. A browser key alone identifies nobody.
    if (!req.user || isSharedDemoAccount(req.user.id) || isSyntheticAccount(req.user.id)) { res.json({participant: null, signInRequired: !req.user}); return; }
    const r = getDb().prepare('SELECT * FROM participant_registrations WHERE user_id = ? AND is_synthetic = 0').get(req.user.id) as Row | undefined;
    const consent = r && getDb().prepare('SELECT 1 FROM participant_consents WHERE participant_id = ? AND consent_version = ? AND identity_kind = ?').get(r.id, REAL_REGISTRY_CONSENT_VERSION, 'account');
    res.json({participant: r && consent ? projection(r) : null});
    return;
  }
  const key = req.headers['x-requester-key'];
  if (!isStrongDeviceKey(key)) { fail(res, 400, 'INVALID_IDENTITY', 'This browser cannot safely identify a demo participant.'); return; }
  const r = req.user && isSharedDemoAccount(req.user.id) ? undefined : own(req, registryHash(key));
  const consent = r && getDb().prepare('SELECT 1 FROM participant_consents WHERE participant_id = ? AND consent_version = ? AND identity_kind = ?').get(r.id, REGISTRY_CONSENT_VERSION, req.user ? 'account' : 'device');
  res.json({participant: r && consent ? projection(r) : null});
});
participantsRouter.post('/participants/enroll', (req: AuthedRequest, res) => {
  const mode = registryMode();
  if (mode === 'closed') { fail(res, 403, 'DEMO_ONLY', 'Enrollment requires the protected synthetic demonstration server or a real-user deployment. Public advice remains available.'); return; }
  const real = mode === 'real';
  if (req.user && isSharedDemoAccount(req.user.id)) { fail(res, 403, 'PRIVATE_IDENTITY_REQUIRED', 'Shared demo accounts cannot enroll. Sign out to use your private browser identity.'); return; }
  if (real) {
    // A phone number or a browser alone is not a person: the participant must be a signed-in account, and demonstration accounts never count as genuine.
    if (!req.user) { fail(res, 401, 'SIGN_IN_REQUIRED', 'Sign in or create an account with your phone number and password to register as a participant. Public advice needs no account.'); return; }
    if (isSyntheticAccount(req.user.id)) { fail(res, 403, 'SYNTHETIC_ACCOUNT', 'Demonstration accounts cannot register as genuine participants.'); return; }
  }
  const limit = checkAndRecordRateLimit(hashIdentifier(`registry:${clientAddress(req)}`), 'participant_enroll', 12 * writeLimitScale(), 60);
  if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds ?? 60)); fail(res, 429, 'RATE_LIMITED', 'Too many enrollment attempts. Please wait before trying again.'); return; }
  const body = req.body ?? {}; const key = req.headers['x-requester-key'];
  if (!real && !isStrongDeviceKey(key)) { fail(res, 400, 'INVALID_IDENTITY', 'This browser cannot safely retain its demo identity.'); return; }
  const version = consentVersionFor(!real);
  if (Object.keys(body).some((k) => !['category', 'county', 'consent', 'consentVersion'].includes(k)) || !PARTICIPANT_CATEGORIES.includes(body.category) || !LIBERIA_COUNTIES.includes(body.county) || body.consent !== true || body.consentVersion !== version) {
    fail(res, 400, 'INVALID_ENROLLMENT', 'Choose a listed category and county and explicitly accept the registry consent.'); return;
  }
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    let row: Row | undefined;
    if (real) {
      // One participant per account; created non-synthetic. A browser key is never consulted, so a leftover synthetic device record can never be turned into a genuine one.
      row = db.prepare('SELECT * FROM participant_registrations WHERE user_id = ?').get(req.user!.id) as Row | undefined;
      if (row && row.is_synthetic === 1) { db.exec('ROLLBACK'); fail(res, 403, 'IDENTITY_UNAVAILABLE', 'Enrollment could not be completed for this identity.'); return; }
      if (!row) {
        const id = db.prepare('INSERT INTO participant_registrations (user_id, requester_hash, category, county, is_synthetic) VALUES (?, ?, ?, ?, 0)').run(req.user!.id, accountHash(req.user!.id), body.category, body.county).lastInsertRowid;
        row = db.prepare('SELECT * FROM participant_registrations WHERE id = ?').get(id) as unknown as Row;
      }
    } else {
      const hash = registryHash(key as string);
      row = own(req, hash);
      if (!row) {
        const device = db.prepare('SELECT * FROM participant_registrations WHERE requester_hash = ?').get(hash) as Row | undefined;
        if (device && device.user_id !== null) { db.exec('ROLLBACK'); fail(res, 403, 'IDENTITY_UNAVAILABLE', 'Enrollment could not be completed for this identity. Use your own signed-in account or browser profile.'); return; }
        if (device && req.user) {
          db.prepare('UPDATE participant_registrations SET user_id = ? WHERE id = ? AND user_id IS NULL').run(req.user.id, device.id);
          row = {...device, user_id: req.user.id};
        } else {
          const id = db.prepare('INSERT INTO participant_registrations (user_id, requester_hash, category, county) VALUES (?, ?, ?, ?)').run(req.user?.id ?? null, hash, body.category, body.county).lastInsertRowid;
          row = db.prepare('SELECT * FROM participant_registrations WHERE id = ?').get(id) as unknown as Row;
        }
      }
    }
    db.prepare('INSERT OR IGNORE INTO participant_consents (participant_id, consent_version, consent_text, identity_kind) VALUES (?, ?, ?, ?)').run(row!.id, version, real ? REAL_REGISTRY_CONSENT_TEXT : REGISTRY_CONSENT_TEXT, row!.user_id === null ? 'device' : 'account');
    db.exec('COMMIT');
    res.json({participant: projection(row!)});
  } catch (error) { db.exec('ROLLBACK'); throw error; }
});
participantsRouter.get('/ministry/participants', requireRole('admin'), (_req, res) => { res.json(registryAggregates()); });
