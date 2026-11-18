/**
 * Exports the Node reference seed into versioned JSON for the PHP seeders (M2). Reads ONLY a freshly created disposable SQLite file
 * in the OS temp directory; refuses to touch ./data. Password hashes and ownership secrets are never exported.
 * Usage: tsx scripts/export-seed.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-seed-export-'));
process.env.DB_PATH = path.join(tmp, 'export.db');
const {getDb} = await import('../server/db.ts');
const {seedInitialData} = await import('../server/seed.ts');
seedInitialData();
const db = getDb();

const dump = (table: string, drop: string[] = []) =>
  (db.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'platform_settings' ? 'key' : table === 'user_roles' ? 'user_id, role_id' : table === 'farmer_profiles' || table === 'expert_profiles' || table === 'language_preferences' ? 'user_id' : 'id'}`).all() as Record<string, unknown>[]).map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) if (!drop.includes(k)) o[k === 'key' && table === 'platform_settings' ? 'setting_key' : k] = v;
    return o;
  });

const reference = {
  roles: dump('roles'),
  crops: dump('crops'),
  guide_categories: dump('guide_categories'),
  agricultural_guides: dump('agricultural_guides'),
  guide_translations: dump('guide_translations'),
  platform_settings: dump('platform_settings'),
};
const prototype = {
  // demo accounts: passwords are NEVER exported; the PHP loader hashes them from environment-supplied values (non-production only)
  users: dump('users', ['password_hash']),
  user_roles: dump('user_roles'),
  farmer_profiles: dump('farmer_profiles'),
  expert_profiles: dump('expert_profiles'),
  language_preferences: dump('language_preferences'),
  advisory_questions: dump('advisory_questions'),
  advisory_messages: dump('advisory_messages'),
  expert_assignments: dump('expert_assignments'),
  marketplace_listings: dump('marketplace_listings', ['owner_token', 'owner_key_hash']),
  marketplace_inquiries: dump('marketplace_inquiries', ['buyer_token']),
  local_language_recordings: dump('local_language_recordings'),
  demo_expert_requests: dump('demo_expert_requests', ['requester_token', 'requester_key_hash']),
};
const out = path.resolve(process.env.SEED_OUT_DIR || 'database/seed');
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'reference.json'), JSON.stringify(reference, null, 1) + '\n');
fs.writeFileSync(path.join(out, 'prototype.json'), JSON.stringify(prototype, null, 1) + '\n');
const counts = Object.fromEntries([...Object.entries(reference), ...Object.entries(prototype)].map(([k, v]) => [k, v.length]));
fs.writeFileSync(path.join(out, 'counts.json'), JSON.stringify(counts, null, 1) + '\n');
console.log(JSON.stringify(counts));
fs.rmSync(tmp, {recursive: true, force: true});
