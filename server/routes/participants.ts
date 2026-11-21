import crypto from 'node:crypto';
import {Router} from 'express';
import {LIBERIA_COUNTIES} from '../constants.ts';
import {getDb} from '../db.ts';
import {getRuntimeConfig} from '../runtime.ts';
import {type AuthedRequest, checkAndRecordRateLimit, clientAddress, hashIdentifier, hashRequesterKey, isSharedDemoAccount, isStrongDeviceKey, requireRole} from '../security.ts';
import {PARTICIPANT_CATEGORIES, REGISTRY_CONSENT_TEXT, REGISTRY_CONSENT_VERSION, type Participant} from '../../src/lib/participantRegistry.ts';
import {registryAggregates} from '../participantRegistry.ts';
import {writeLimitScale} from '../limits.ts';
export const participantsRouter = Router();
interface Row {id: number; user_id: number | null; requester_hash: string; category: Participant['category']; county: string; is_synthetic: number}
const fail = (res: import('express').Response, status: number, code: string, message: string) => { res.status(status).json({error: {code, message}}); };
const projection = (r: Row): Participant => ({category: r.category, county: r.county, synthetic: r.is_synthetic === 1, channel: 'ussd-browser', identity: r.user_id === null ? 'device' : 'account', consentVersion: REGISTRY_CONSENT_VERSION});
// Reuse the existing private browser requester identity, but domain-separate its registry hash.
const registryHash = (key: string) => crypto.createHash('sha256').update('participant-registry-v1:' + hashRequesterKey(key)).digest('hex');
function own(req: AuthedRequest, hash: string): Row | undefined {
  return (req.user ? getDb().prepare('SELECT * FROM participant_registrations WHERE user_id = ?').get(req.user.id) : getDb().prepare('SELECT * FROM participant_registrations WHERE requester_hash = ? AND user_id IS NULL').get(hash)) as Row | undefined;
}
participantsRouter.get('/participants/me', (req: AuthedRequest, res) => {
  const key = req.headers['x-requester-key'];
  if (!isStrongDeviceKey(key)) { fail(res, 400, 'INVALID_IDENTITY', 'This browser cannot safely identify a demo participant.'); return; }
  const r = req.user && isSharedDemoAccount(req.user.id) ? undefined : own(req, registryHash(key));
  const consent = r && getDb().prepare('SELECT 1 FROM participant_consents WHERE participant_id = ? AND consent_version = ? AND identity_kind = ?').get(r.id, REGISTRY_CONSENT_VERSION, req.user ? 'account' : 'device');
  res.json({participant: r && consent ? projection(r) : null});
});
participantsRouter.post('/participants/enroll', (req: AuthedRequest, res) => {
  // Never introduce synthetic identities into a real production deployment.
  if (!getRuntimeConfig().demoEnvironment && process.env.APP_ENV !== 'test') { fail(res, 403, 'DEMO_ONLY', 'Enrollment requires the protected synthetic demonstration server. Public advice remains available.'); return; }
  if (req.user && isSharedDemoAccount(req.user.id)) { fail(res, 403, 'PRIVATE_IDENTITY_REQUIRED', 'Shared demo accounts cannot enroll. Sign out to use your private browser identity.'); return; }
  const limit = checkAndRecordRateLimit(hashIdentifier(`registry:${clientAddress(req)}`), 'participant_enroll', 12 * writeLimitScale(), 60);
  if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds ?? 60)); fail(res, 429, 'RATE_LIMITED', 'Too many enrollment attempts. Please wait before trying again.'); return; }
  const body = req.body ?? {}; const key = req.headers['x-requester-key'];
  if (!isStrongDeviceKey(key)) { fail(res, 400, 'INVALID_IDENTITY', 'This browser cannot safely retain its demo identity.'); return; }
  if (Object.keys(body).some((k) => !['category', 'county', 'consent', 'consentVersion'].includes(k)) || !PARTICIPANT_CATEGORIES.includes(body.category) || !LIBERIA_COUNTIES.includes(body.county) || body.consent !== true || body.consentVersion !== REGISTRY_CONSENT_VERSION) {
    fail(res, 400, 'INVALID_ENROLLMENT', 'Choose a listed category and county and explicitly accept the demo registry consent.'); return;
  }
  const db = getDb(); const hash = registryHash(key);
  db.exec('BEGIN IMMEDIATE');
  try {
    let row = own(req, hash);
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
    db.prepare('INSERT OR IGNORE INTO participant_consents (participant_id, consent_version, consent_text, identity_kind) VALUES (?, ?, ?, ?)').run(row.id, REGISTRY_CONSENT_VERSION, REGISTRY_CONSENT_TEXT, row.user_id === null ? 'device' : 'account');
    db.exec('COMMIT');
    res.json({participant: projection(row)});
  } catch (error) { db.exec('ROLLBACK'); throw error; }
});
participantsRouter.get('/ministry/participants', requireRole('admin'), (_req, res) => { res.json(registryAggregates()); });
