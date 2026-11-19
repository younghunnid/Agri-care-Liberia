import crypto from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {ADVICE_CARD_SEED} from '../src/data/adviceCardsSeed.ts';
import {cardVerification, type CardVerification} from '../src/lib/adviceLabels.ts';
import {getDb} from './db.ts';

export interface CardVersionView {
  version: number;
  title: string;
  summary: string;
  steps: string[];
  askWhen: string;
  sourceNote: string;
  changeNote: string;
  createdAt: string;
  verification: CardVerification & {reviewerName?: string; reviewerOrg?: string; reviewedAt?: string};
}
export interface CardView extends CardVersionView {
  code: string;
  slug: string;
  crop: string;
  currentVersion: number;
}
export interface CardSummary {
  code: string; slug: string; crop: string; version: number; title: string; summary: string; createdAt: string;
  verification: CardVersionView['verification'];
}

interface VersionRow {
  version: number; title: string; summary: string; steps_json: string; ask_when: string; source_note: string; change_note: string; created_at: string;
  verification_level: string; reviewer_name: string | null; reviewer_org: string | null; reviewed_at: string | null;
}
interface CardRow {id: number; advice_code: string; slug: string; crop: string; current_version: number; is_published: number}

export const contentHash = (c: {title: string; summary: string; steps: string[]; askWhen: string; sourceNote: string}): string =>
  crypto.createHash('sha256').update(JSON.stringify([c.title, c.summary, c.steps, c.askWhen, c.sourceNote])).digest('hex');

function versionView(r: VersionRow): CardVersionView {
  const v = cardVerification({level: r.verification_level, reviewerName: r.reviewer_name, reviewerOrg: r.reviewer_org, reviewedAt: r.reviewed_at});
  return {
    version: r.version, title: r.title, summary: r.summary, steps: JSON.parse(r.steps_json) as string[], askWhen: r.ask_when, sourceNote: r.source_note,
    changeNote: r.change_note, createdAt: r.created_at,
    // Reviewer details are exposed ONLY for a genuinely verified version.
    verification: v.reviewed ? {...v, reviewerName: r.reviewer_name ?? undefined, reviewerOrg: r.reviewer_org ?? undefined, reviewedAt: r.reviewed_at ?? undefined} : v,
  };
}

/** Finds a card by reference code (ADV-2026-001), slug, or numeric id. */
export function findCard(ref: string, db: DatabaseSync = getDb()): CardRow | undefined {
  const r = String(ref).trim();
  if (!r) return undefined;
  if (/^\d{1,9}$/.test(r)) return db.prepare('SELECT * FROM advice_cards WHERE id = ?').get(Number(r)) as unknown as CardRow | undefined;
  return db.prepare('SELECT * FROM advice_cards WHERE advice_code = ? OR slug = ?').get(r.toUpperCase(), r.toLowerCase()) as unknown as CardRow | undefined;
}

export function getVersion(cardId: number, version: number, db: DatabaseSync = getDb()): VersionRow | undefined {
  return db.prepare('SELECT * FROM advice_card_versions WHERE card_id = ? AND version = ?').get(cardId, version) as unknown as VersionRow | undefined;
}

export function cardView(card: CardRow, db: DatabaseSync = getDb()): CardView {
  const cur = getVersion(card.id, card.current_version, db)!;
  return {...versionView(cur), code: card.advice_code, slug: card.slug, crop: card.crop, currentVersion: card.current_version};
}

export function listCards(crop?: string, db: DatabaseSync = getDb()): CardSummary[] {
  const rows = (crop
    ? db.prepare('SELECT * FROM advice_cards WHERE is_published = 1 AND crop = ? ORDER BY advice_code').all(crop)
    : db.prepare('SELECT * FROM advice_cards WHERE is_published = 1 ORDER BY advice_code').all()) as unknown as CardRow[];
  return rows.map((c) => {
    const v = versionView(getVersion(c.id, c.current_version, db)!);
    return {code: c.advice_code, slug: c.slug, crop: c.crop, version: v.version, title: v.title, summary: v.summary, createdAt: v.createdAt, verification: v.verification};
  });
}

export function versionHistory(card: CardRow, db: DatabaseSync = getDb()): Omit<CardVersionView, 'steps' | 'summary' | 'askWhen' | 'sourceNote'>[] {
  const rows = db.prepare('SELECT * FROM advice_card_versions WHERE card_id = ? ORDER BY version DESC').all(card.id) as unknown as VersionRow[];
  return rows.map((r) => {
    const v = versionView(r);
    return {version: v.version, title: v.title, changeNote: v.changeNote, createdAt: v.createdAt, verification: v.verification};
  });
}

/** Next ADV-<year>-NNN code (never reuses a number). */
export function nextAdviceCode(db: DatabaseSync = getDb(), year = new Date().getFullYear()): string {
  const row = db.prepare("SELECT MAX(CAST(substr(advice_code, -3) AS INTEGER)) AS n FROM advice_cards WHERE advice_code GLOB 'ADV-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]'").get() as {n: number | null};
  return `ADV-${year}-${String((row.n ?? 0) + 1).padStart(3, '0')}`;
}

/** Adds a NEW version (never edits an old one). The new version starts as `team_draft`: a content change is never inherited as reviewed. */
export function addVersion(
  card: CardRow,
  c: {title: string; summary: string; steps: string[]; askWhen: string; sourceNote: string; changeNote: string},
  createdBy: number | null,
  db: DatabaseSync = getDb()
): number {
  const next = card.current_version + 1;
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO advice_card_versions (card_id, version, title, summary, steps_json, ask_when, source_note, verification_level, content_hash, change_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'team_draft', ?, ?, ?)`
    ).run(card.id, next, c.title, c.summary, JSON.stringify(c.steps), c.askWhen, c.sourceNote, contentHash(c), c.changeNote, createdBy);
    db.prepare('UPDATE advice_cards SET current_version = ? WHERE id = ?').run(next, card.id);
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
  return next;
}

/**
 * Seeds the six demonstration cards (version 1, level `demo_sample`) when the table is empty. A seed can never produce a verified card.
 * Idempotent: an existing database keeps whatever cards and versions it has.
 */
export function seedAdviceCards(db: DatabaseSync = getDb()): void {
  const n = (db.prepare('SELECT COUNT(*) AS c FROM advice_cards').get() as {c: number}).c;
  if (n > 0) return;
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const c of ADVICE_CARD_SEED) {
      const id = Number(db.prepare('INSERT INTO advice_cards (advice_code, slug, crop, current_version) VALUES (?, ?, ?, 1)').run(c.code, c.slug, c.crop).lastInsertRowid);
      db.prepare(
        `INSERT INTO advice_card_versions (card_id, version, title, summary, steps_json, ask_when, source_note, verification_level, content_hash, change_note)
         VALUES (?, 1, ?, ?, ?, ?, ?, 'demo_sample', ?, 'First version (demonstration content)')`
      ).run(id, c.title, c.summary, JSON.stringify(c.steps), c.askWhen, c.sourceNote, contentHash(c));
    }
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
}
