import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Router, type NextFunction, type Request, type Response} from 'express';
import {getDb} from '../db.ts';
import type {RuntimeConfig} from '../runtime.ts';

/**
 * Staging diagnostics (mounted only when STAGING_DIAG_TOKEN is set). They answer the open hosting questions without touching real data:
 *  - proxy:   what Express sees behind the host's proxy (secure flag, client address, forwarded headers);
 *  - storage: where the database lives, whether the journal mode works, integrity, and a marker file next to it that proves persistence across
 *             restarts and redeployments;
 *  - wal-test: a concurrent-write test on a SEPARATE scratch SQLite file in the same folder (never the real database).
 * Output contains no secrets, no tokens and no account data (only aggregate counts).
 */
export function stagingRouter(rt: RuntimeConfig): Router {
  const r = Router();
  const token = Buffer.from(crypto.createHash('sha256').update(rt.stagingDiagToken ?? '').digest());
  let hits: number[] = [];
  r.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const now = Date.now();
    hits = hits.filter((t) => t > now - 60_000);
    if (hits.length >= 60) { res.status(429).json({error: {code: 'RATE_LIMITED', message: 'Too many requests.'}}); return; }
    hits.push(now);
    const given = crypto.createHash('sha256').update(String(req.get('x-staging-token') ?? '')).digest();
    if (!crypto.timingSafeEqual(given, token)) { res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Staging token required.'}}); return; }
    next();
  });

  const dir = path.dirname(rt.dbPath);
  const markerFile = path.join(dir, 'staging-probe-marker.json');
  const startedAt = new Date().toISOString();

  r.get('/proxy', (req, res) => {
    res.json({
      secure: req.secure, protocol: req.protocol, host: req.get('host'),
      ip: req.ip, ips: req.ips, remoteAddress: req.socket.remoteAddress,
      xForwardedFor: req.get('x-forwarded-for') ?? null, xForwardedProto: req.get('x-forwarded-proto') ?? null, xRealIp: req.get('x-real-ip') ?? null, cfConnectingIp: req.get('cf-connecting-ip') ?? null,
      trustProxySetting: JSON.stringify(rt.trustProxy), trustProxyExplicit: rt.trustProxyExplicit, cookieMode: rt.cookieMode,
    });
  });

  r.get('/storage', (_req, res) => {
    const db = getDb();
    const file = rt.dbPath;
    const size = (f: string) => { try { return fs.statSync(f).size; } catch { return null; } };
    let marker: unknown = null;
    try { marker = JSON.parse(fs.readFileSync(markerFile, 'utf8')); } catch { /* none yet */ }
    const jm = (db.prepare('PRAGMA journal_mode').get() as {journal_mode: string}).journal_mode;
    const qc = (db.prepare('PRAGMA quick_check').get() as {quick_check: string}).quick_check;
    const users = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c;
    res.json({
      node: process.version, startedAt, uptimeSeconds: Math.round(process.uptime()), pid: process.pid,
      appRootName: path.basename(rt.appRoot), dbFolderName: path.basename(dir), dbFile: path.basename(file), dbInsideAppRoot: file.startsWith(rt.appRoot + path.sep),
      dbBytes: size(file), walBytes: size(`${file}-wal`), shmBytes: size(`${file}-shm`), journalMode: jm, requestedJournalMode: rt.journalMode, quickCheck: qc,
      userCount: users, marker,
    });
  });

  r.post('/marker', (_req, res) => {
    if (fs.existsSync(markerFile)) { res.json({created: false, marker: JSON.parse(fs.readFileSync(markerFile, 'utf8'))}); return; }
    const marker = {id: crypto.randomBytes(8).toString('hex'), createdAt: new Date().toISOString()};
    fs.writeFileSync(markerFile, JSON.stringify(marker), {mode: 0o600});
    res.status(201).json({created: true, marker});
  });
  r.delete('/marker', (_req, res) => { try { fs.unlinkSync(markerFile); } catch { /* absent */ } res.json({ok: true}); });

  r.post('/wal-test', (req, res) => {
    const rounds = Math.min(2000, Math.max(10, Number(req.query.rounds) || 300));
    const scratch = path.join(dir, `staging-wal-test-${process.pid}.db`);
    const t0 = Date.now();
    let a: DatabaseSync | null = null; let b: DatabaseSync | null = null;
    let result: {status: number; body: Record<string, unknown>};
    try {
      a = new DatabaseSync(scratch); b = new DatabaseSync(scratch);
      for (const d of [a, b]) { d.exec('PRAGMA busy_timeout = 5000;'); d.exec(rt.journalMode === 'delete' ? 'PRAGMA journal_mode = DELETE;' : 'PRAGMA journal_mode = WAL;'); }
      a.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT NOT NULL, v TEXT NOT NULL)');
      let errors = 0;
      for (let i = 0; i < rounds; i++) { try { (i % 2 ? a : b).prepare('INSERT INTO t (who, v) VALUES (?, ?)').run(i % 2 ? 'a' : 'b', crypto.randomBytes(16).toString('hex')); } catch { errors++; } }
      const count = (a.prepare('SELECT COUNT(*) AS c FROM t').get() as {c: number}).c;
      const ic = (b.prepare('PRAGMA integrity_check').get() as {integrity_check: string}).integrity_check;
      result = {status: 200, body: {rounds, inserted: count, errors, integrity: ic, journalMode: rt.journalMode, ms: Date.now() - t0, ok: errors === 0 && count === rounds && ic === 'ok'}};
    } catch (e) {
      result = {status: 500, body: {ok: false, error: `${(e as Error).name}: ${(e as Error).message}`.slice(0, 200)}};
    } finally {
      try { a?.close(); } catch { /* ignore */ }
      try { b?.close(); } catch { /* ignore */ }
      for (const f of [scratch, `${scratch}-wal`, `${scratch}-shm`, `${scratch}-journal`]) { try { fs.unlinkSync(f); } catch { /* absent */ } }
    }
    res.status(result.status).json(result.body); // respond only after the scratch files are gone
  });
  return r;
}
