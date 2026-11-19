import {Router} from 'express';
import {LIBERIA_COUNTIES} from '../constants.ts';
import {getDb} from '../db.ts';
import {idempotent} from '../idempotency.ts';
import {
  type AuthedRequest, checkAndRecordRateLimit, clientAddress, hashIdentifier, hashRequesterKey, isValidOwnerKey, requireRole, writeAuditLog, writeLimit,
} from '../security.ts';
import {addVersion, cardView, findCard, getVersion, listCards, nextAdviceCode, versionHistory} from '../adviceCards.ts';
import {isPlaceholderReviewer} from '../../src/lib/adviceLabels.ts';
import {caseById} from '../../src/data/triageCases.ts';
import {evaluateTriage} from '../../src/lib/triageRules.ts';

/**
 * Phase 1A. Advice cards (public read; administrator-only changes that always create a NEW version) and crop-check ("triage") reports.
 * Mounted on /api/v1 behind the global CSRF check. Everything here is demonstration content: nothing is a diagnosis and no card is marked reviewed
 * unless an administrator records a named reviewer, organisation and date.
 */
export const adviceRouter = Router();

const err = (res: import('express').Response, status: number, code: string, message: string): void => { res.status(status).json({error: {code, message}}); };
const text = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);

// ---------------------------------------------------------------------------------------------------------------------------------- advice cards (public)
adviceRouter.get('/advice-cards', (req, res) => {
  const crop = typeof req.query.crop === 'string' && ['cassava', 'rice', 'poultry'].includes(req.query.crop) ? req.query.crop : undefined;
  res.json({cards: listCards(crop)});
});

adviceRouter.get('/advice-cards/:ref', (req, res) => {
  const card = findCard(req.params.ref);
  if (!card || !card.is_published) { err(res, 404, 'NOT_FOUND', 'Advice card not found.'); return; }
  res.json({card: {...cardView(card), versions: versionHistory(card)}});
});

adviceRouter.get('/advice-cards/:ref/versions/:n', (req, res) => {
  const card = findCard(req.params.ref);
  const n = Number(req.params.n);
  const row = card && Number.isInteger(n) ? getVersion(card.id, n) : undefined;
  if (!card || !card.is_published || !row) { err(res, 404, 'NOT_FOUND', 'Advice card version not found.'); return; }
  const shown = cardView({...card, current_version: n});
  res.json({card: {...shown, isCurrent: n === card.current_version}});
});

/** "Check this code": the same answer shape for every code; an unknown or malformed code is one identical 404. No personal data. */
adviceRouter.get('/advice/verify/:code', (req, res) => {
  const rl = checkAndRecordRateLimit(hashIdentifier(`advice-verify:${clientAddress(req)}`), 'advice_verify', 60, 10, true);
  if (!rl.allowed) { res.setHeader('Retry-After', String(rl.retryAfterSeconds ?? 600)); err(res, 429, 'RATE_LIMITED', 'Too many checks. Please wait a little.'); return; }
  const code = String(req.params.code ?? '').trim();
  const card = /^ADV-\d{4}-\d{3,6}$/i.test(code) ? findCard(code) : undefined;
  if (!card || !card.is_published) { err(res, 404, 'NOT_FOUND', 'No advice card has this code.'); return; }
  const v = cardView(card);
  res.json({found: true, code: card.advice_code, title: v.title, version: v.version, verification: v.verification, createdAt: v.createdAt});
});

// ---------------------------------------------------------------------------------------------------------------------------------- advice cards (administrator)
adviceRouter.post('/admin/advice-cards/:ref/versions', requireRole('admin'), (req: AuthedRequest, res) => {
  const card = findCard(req.params.ref);
  if (!card) { err(res, 404, 'NOT_FOUND', 'Advice card not found.'); return; }
  const b = req.body ?? {};
  const title = text(b.title, 4, 120); const summary = text(b.summary, 10, 600); const askWhen = text(b.askWhen, 5, 300); const changeNote = text(b.changeNote, 3, 200);
  const sourceNote = b.sourceNote === undefined ? '' : text(b.sourceNote, 0, 300);
  const stepsIn: (string | null)[] = Array.isArray(b.steps) ? (b.steps as unknown[]).map((s) => text(s, 5, 300)) : [];
  if (!title || !summary || !askWhen || !changeNote || sourceNote === null || stepsIn.length < 1 || stepsIn.length > 8 || stepsIn.some((s) => s === null)) {
    err(res, 400, 'VALIDATION_ERROR', 'Title, summary, 1 to 8 steps, an "ask when" line and a change note are required (within the length limits).');
    return;
  }
  const steps = stepsIn as string[];
  const cur = cardView(card);
  if (cur.title === title && cur.summary === summary && cur.askWhen === askWhen && cur.sourceNote === sourceNote && JSON.stringify(cur.steps) === JSON.stringify(steps)) {
    err(res, 409, 'NO_CHANGE', 'Nothing changed: a new version needs different content.');
    return;
  }
  const version = addVersion(card, {title, summary, steps, askWhen, sourceNote, changeNote}, req.user!.id);
  writeAuditLog({actorUserId: req.user!.id, actorRole: 'admin', action: 'advice_card_version_created', targetType: 'advice_card', targetId: card.id, details: {code: card.advice_code, version}, ip: req.ip});
  res.status(201).json({card: {...cardView({...card, current_version: version}), versions: versionHistory({...card, current_version: version})}});
});

/** Records a review decision on ONE version. `verified` needs a named reviewer, an organisation, an explicit attestation and a real (non-placeholder) name. */
adviceRouter.post('/admin/advice-cards/:ref/review', requireRole('admin'), (req: AuthedRequest, res) => {
  const card = findCard(req.params.ref);
  if (!card) { err(res, 404, 'NOT_FOUND', 'Advice card not found.'); return; }
  const b = req.body ?? {};
  const decision = typeof b.decision === 'string' && ['team_draft', 'pending_review', 'verified'].includes(b.decision) ? b.decision : null;
  const version = b.version === undefined ? card.current_version : Number(b.version);
  if (!decision || !Number.isInteger(version) || !getVersion(card.id, version)) { err(res, 400, 'VALIDATION_ERROR', 'Choose a decision (team_draft, pending_review or verified) and an existing version.'); return; }
  let reviewerName: string | null = null; let reviewerOrg: string | null = null; let reviewerNote: string | null = null; let reviewedAt: string | null = null;
  if (decision === 'verified') {
    reviewerName = text(b.reviewerName, 3, 80); reviewerOrg = text(b.reviewerOrg, 2, 120); reviewerNote = b.reviewerNote === undefined ? '' : text(b.reviewerNote, 0, 300);
    if (!reviewerName || !reviewerOrg || reviewerNote === null) { err(res, 400, 'VALIDATION_ERROR', 'A verified review needs the reviewer\'s name, organisation and (optionally) a short note.'); return; }
    if (b.attestation !== true) { err(res, 400, 'ATTESTATION_REQUIRED', 'Confirm that this person is a qualified reviewer (attestation: true).'); return; }
    if (isPlaceholderReviewer(reviewerName) || isPlaceholderReviewer(reviewerOrg)) { err(res, 422, 'PLACEHOLDER_REVIEWER', 'The reviewer name or organisation looks like a demonstration placeholder. Only a real, named reviewer can verify a card.'); return; }
    reviewedAt = new Date().toISOString().slice(0, 10);
  }
  getDb().prepare('UPDATE advice_card_versions SET verification_level = ?, reviewer_name = ?, reviewer_org = ?, reviewer_note = ?, reviewed_at = ? WHERE card_id = ? AND version = ?')
    .run(decision, reviewerName, reviewerOrg, reviewerNote, reviewedAt, card.id, version);
  writeAuditLog({actorUserId: req.user!.id, actorRole: 'admin', action: 'advice_card_reviewed', targetType: 'advice_card', targetId: card.id, details: {code: card.advice_code, version, decision}, ip: req.ip});
  res.json({card: {...cardView(card), versions: versionHistory(card)}});
});

// ---------------------------------------------------------------------------------------------------------------------------------- crop-check reports
/** Fields a crop-check report must never carry: media, free text and contact details stay on the device. */
const FORBIDDEN_FIELDS = ['photoDataUrl', 'photo', 'image', 'imageUrl', 'voiceNoteDataUrl', 'audioDataUrl', 'description', 'notes', 'phone', 'sellerPhone', 'buyerPhone', 'name', 'farmerName', 'email'];

adviceRouter.post('/triage/reports', idempotent('triage.report.create'), writeLimit('triage.report'), (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  const forbidden = FORBIDDEN_FIELDS.find((f) => b[f] !== undefined);
  if (forbidden) { err(res, 400, 'FIELD_NOT_ACCEPTED', `"${forbidden}" is never sent with a crop-check report. Photos, names and phone numbers stay on the device.`); return; }
  // Anonymous callers prove ownership of their own reports with a device secret (stored only as a keyed hash), like expert requests.
  if (!req.user && !isValidOwnerKey(b.requesterKey)) { err(res, 400, 'VALIDATION_ERROR', 'A device requester key (32 to 128 letters, digits, - or _) is required to send a report without signing in.'); return; }
  const county = typeof b.county === 'string' && (LIBERIA_COUNTIES as readonly string[]).includes(b.county) ? b.county : null;
  if (!county) { err(res, 400, 'VALIDATION_ERROR', 'Select a valid Liberian county.'); return; }
  const result = evaluateTriage(b.caseId, b.answers);
  if (!result.ok) { err(res, 400, 'VALIDATION_ERROR', result.error); return; }
  const c = caseById(result.caseId)!;
  const card = findCard(c.cardSlug);
  if (!card) { err(res, 409, 'CARD_MISSING', 'The advice card for this situation is not available.'); return; }
  let capturedAt: string | null = null;
  if (b.capturedAt !== undefined) {
    const t = typeof b.capturedAt === 'string' ? Date.parse(b.capturedAt) : NaN;
    if (Number.isNaN(t)) { err(res, 400, 'VALIDATION_ERROR', 'capturedAt must be a date and time.'); return; }
    const now = Date.now();
    if (t >= now - 35 * 86_400_000 && t <= now + 5 * 60_000) capturedAt = new Date(t).toISOString();
  }
  const db = getDb();
  const next = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM triage_reports').get() as {n: number}).n; // this handler is synchronous: no gap between read and insert
  const ref = `TRG-${new Date().getFullYear()}-${String(next).padStart(6, '0')}`;
  const ins = db.prepare(
    `INSERT INTO triage_reports (report_ref, user_id, requester_key_hash, case_id, crop, county, answers_json, score, band, advice_code, advice_version, escalated, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ref, req.user?.id ?? null, req.user ? '' : hashRequesterKey(b.requesterKey), result.caseId, result.crop, county, JSON.stringify(b.answers), result.score, result.band, card.advice_code, card.current_version, b.escalated === true ? 1 : 0, capturedAt);
  const created = db.prepare('SELECT created_at FROM triage_reports WHERE id = ?').get(Number(ins.lastInsertRowid)) as {created_at: string};
  writeAuditLog({actorUserId: req.user?.id ?? null, actorRole: req.user ? 'user' : 'anonymous', action: 'triage_report_created', targetType: 'triage_report', targetId: Number(ins.lastInsertRowid), details: {band: result.band, crop: result.crop}, ip: req.ip});
  res.status(201).json({
    report: {ref, caseId: result.caseId, crop: result.crop, county, band: result.band, score: result.score, adviceCode: card.advice_code, adviceVersion: card.current_version, simulated: true, escalated: b.escalated === true, createdAt: created.created_at},
    receipt: {opId: req.get('Idempotency-Key') ?? null, status: 'APPLIED', serverTime: new Date().toISOString(), note: 'Simulated crop check. Not a diagnosis.'},
  });
});

/** The caller's OWN reports only (signed-in account, or the device that holds the requester key). */
adviceRouter.get('/triage/reports', (req: AuthedRequest, res) => {
  const key = req.get('X-Requester-Key');
  const keyHash = isValidOwnerKey(key) ? hashRequesterKey(key) : '';
  if (!req.user && !keyHash) { res.json({reports: []}); return; }
  const rows = getDb().prepare(
    `SELECT report_ref, case_id, crop, county, band, score, advice_code, advice_version, escalated, created_at FROM triage_reports
     WHERE (? IS NOT NULL AND user_id = ?) OR (? <> '' AND requester_key_hash = ?) ORDER BY id DESC LIMIT 50`
  ).all(req.user?.id ?? null, req.user?.id ?? null, keyHash, keyHash) as {report_ref: string; case_id: string; crop: string; county: string; band: string; score: number; advice_code: string; advice_version: number; escalated: number; created_at: string}[];
  res.json({reports: rows.map((r) => ({ref: r.report_ref, caseId: r.case_id, crop: r.crop, county: r.county, band: r.band, score: r.score, adviceCode: r.advice_code, adviceVersion: r.advice_version, simulated: true, escalated: r.escalated === 1, createdAt: r.created_at}))});
});
