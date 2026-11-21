import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PUBLISHED_DEMO_ACCOUNTS, verifyPassword} from '../server/security.ts';

/**
 * Preparation of an EXISTING demonstration database for real-user operation. Never deletes anything and never runs migrations.
 *
 *   DB_PATH=/home/<user>/agricare-data/agri.db node real-mode-prep.js --check
 *   DB_PATH=...                                node real-mode-prep.js --suspend-demo --confirm
 *
 * --check          read-only report: published-password accounts (production refuses to start with them), demonstration accounts and their roles, synthetic records,
 *                  applied migrations, platform name. Exit code 3 when something blocks real-user mode.
 * --suspend-demo   sets status = 'suspended' on demonstration accounts (reserved range +23177000xxxx and shared demo accounts) and ends their sessions. Administrator
 *                  accounts are NEVER touched (a lock-out would be unrecoverable): they are listed so a person can replace them. Rows and data are kept; an
 *                  administrator can reactivate an account in Admin > Farmer & User Management. Take a backup first (backup-db.js).
 */
const has = (f: string) => process.argv.includes(f);
const fail = (m: string): never => { console.error(`real-mode-prep: ${m}`); process.exit(1); };
if (!process.env.DB_PATH) fail('set DB_PATH to the database file');
const dbPath = path.resolve(process.env.DB_PATH!);
if (!fs.existsSync(dbPath)) fail('the database file does not exist');
if (!has('--check') && !has('--suspend-demo')) fail('usage: node real-mode-prep.js --check | --suspend-demo --confirm');
const suspend = has('--suspend-demo');
if (suspend && !has('--confirm')) fail('refusing --suspend-demo without --confirm (take a backup first)');
const db = new DatabaseSync(dbPath, suspend ? {} : {readOnly: true});
if (suspend) db.exec('PRAGMA busy_timeout = 10000;');
const one = <T>(sql: string, ...a: (string | number)[]): T | undefined => db.prepare(sql).get(...a) as T | undefined;
const all = <T>(sql: string, ...a: (string | number)[]): T[] => db.prepare(sql).all(...a) as T[];
const tableExists = (t: string): boolean => Boolean(one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", t));
const count = (sql: string): number | string => { try { return (one<{c: number}>(sql))!.c; } catch { return 'n/a'; } };

interface U {id: number; phone: string; display_name: string; status: string; is_shared_demo: number; password_hash: string; roles: string | null; phone_verified_at: string | null}
const users = all<U>(`SELECT u.id, u.phone, u.display_name, u.status, u.is_shared_demo, u.password_hash, u.phone_verified_at, GROUP_CONCAT(r.name) AS roles
  FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id GROUP BY u.id ORDER BY u.id`);
const isDemo = (u: U) => u.is_shared_demo === 1 || u.phone.startsWith('+23177000');
const roleList = (u: U) => (u.roles ?? '').split(',').filter(Boolean);
const demo = users.filter(isDemo);
const published = PUBLISHED_DEMO_ACCOUNTS.flatMap(({phone, password}) => { const u = users.find((x) => x.phone === phone); return u && verifyPassword(password, u.password_hash) ? [u] : []; });
const demoAdmins = demo.filter((u) => roleList(u).includes('admin'));
const genuineAdmins = users.filter((u) => !isDemo(u) && roleList(u).includes('admin') && u.status === 'active');

if (suspend) {
  let changed = 0;
  for (const u of demo) {
    if (roleList(u).includes('admin')) { console.log(`KEPT   ${u.phone} (${u.display_name}): administrator accounts are never changed by this tool`); continue; }
    if (u.status === 'suspended') { console.log(`already suspended ${u.phone}`); continue; }
    db.prepare("UPDATE users SET status = 'suspended', session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?").run(u.id);
    console.log(`suspended ${u.phone} (${u.display_name}; roles: ${roleList(u).join(',') || 'none'}); data kept`); changed++;
  }
  console.log(`${changed} demonstration account(s) suspended. Nothing was deleted.`);
  db.close(); process.exit(0);
}

const lines: string[] = []; const blockers: string[] = [];
const say = (s: string) => lines.push(s);
say('== Real-user readiness check (read-only) ==');
say(`database: ${path.basename(dbPath)}; accounts: ${users.length}`);
if (published.length) { blockers.push('published demo passwords'); say(`BLOCKER: ${published.length} account(s) still use a PUBLISHED demo password (${published.map((u) => u.phone).join(', ')}). The production server REFUSES TO START with them. Change those passwords or use a fresh database.`); }
else say('ok: no account uses a published demo password');
say(`demonstration accounts (reserved +23177000 range or shared-demo flag): ${demo.length}`);
for (const u of demo) say(`  ${u.phone}  ${u.display_name}  status=${u.status}  roles=${roleList(u).join(',') || 'none'}  phoneVerified=${u.phone_verified_at ? 'yes (synthetic range)' : 'no'}`);
const active = demo.filter((u) => u.status === 'active' && !roleList(u).includes('admin'));
if (active.length) { blockers.push('active demonstration accounts'); say(`ACTION: ${active.length} active demonstration account(s). Run --suspend-demo --confirm (or suspend them in Admin) before real users register. In real mode they are already blocked from genuine users' records, but a demo expert should not stay active.`); }
if (demoAdmins.length) { blockers.push('administrator on the demo number range'); say(`ACTION: administrator account(s) on the reserved demo range (${demoAdmins.map((u) => u.phone).join(', ')}). In real mode such an account is treated as a demonstration account and may not act on genuine users' records. Create an administrator on a real number with bootstrap-admin.js, then retire this one by hand.`); }
say(`active administrators on real numbers: ${genuineAdmins.length}`);
if (!genuineAdmins.length) { if (!blockers.includes('administrator on the demo number range')) blockers.push('no real administrator'); say('ACTION: there is no active administrator on a real phone number (needed for assisted recovery and the Ministry view).'); }
say('synthetic records (kept, flagged, hidden from real USSD listings):');
say(`  marketplace listings flagged fictional: ${count('SELECT COUNT(*) AS c FROM marketplace_listings WHERE is_fictional_seller = 1')} of ${count('SELECT COUNT(*) AS c FROM marketplace_listings')}`);
say(`  crop-check reports flagged synthetic: ${count('SELECT COUNT(*) AS c FROM triage_reports WHERE is_synthetic = 1')}`);
if (tableExists('participant_registrations')) say(`  participant registrations flagged synthetic: ${count('SELECT COUNT(*) AS c FROM participant_registrations WHERE is_synthetic = 1')}; genuine account participants: ${count('SELECT COUNT(*) AS c FROM participant_registrations WHERE is_synthetic = 0 AND user_id IS NOT NULL')}`);
const migs = tableExists('schema_migrations') ? all<{version: string}>('SELECT version FROM schema_migrations ORDER BY version').map((m) => m.version) : [];
const dir = path.join(process.env.APP_ROOT || process.cwd(), 'server', 'migrations');
const pending = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).filter((f) => !migs.includes(f)).sort() : null;
say(`migrations applied: ${migs.length}${migs.length ? ` (latest ${migs[migs.length - 1]})` : ''}${pending ? `; pending (applied automatically at the next start, additive): ${pending.join(', ') || 'none'}` : ''}`);
const pn = tableExists('platform_settings') ? one<{value: string}>("SELECT value FROM platform_settings WHERE key = 'platform_name'")?.value : undefined;
say(`platform name setting: ${pn ?? 'not set'}${pn && pn !== 'Agricare Liberia' ? '  (change it in Admin > Settings)' : ''}`);
say(blockers.length ? `RESULT: NOT READY (${blockers.join('; ')})` : 'RESULT: READY for real-user mode (still follow the deployment checklist).');
console.log(lines.join('\n'));
db.close();
process.exit(blockers.length ? 3 : 0);
