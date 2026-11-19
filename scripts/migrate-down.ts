import fs from 'node:fs';
import path from 'node:path';
import {getDb, getDbPath, closeDb} from '../server/db.ts';

/**
 * Applies ONE down-migration to the database in DB_PATH (default ./data/agri_advisory.db).
 *   DB_PATH=/tmp/x.db tsx scripts/migrate-down.ts 007_sms_verification --confirm
 * Refuses without --confirm. Back up the database first; this drops tables.
 */
const name = process.argv[2];
if (!name || !process.argv.includes('--confirm')) {
  console.error('usage: tsx scripts/migrate-down.ts <migration name, e.g. 007_sms_verification> --confirm');
  process.exit(2);
}
const file = path.resolve('server/migrations/down', `${name.replace(/\.sql$/, '')}.down.sql`);
if (!/^[0-9a-z_]+$/.test(name.replace(/\.sql$/, '')) || !fs.existsSync(file)) {
  console.error(`No down-migration found for "${name}".`);
  process.exit(2);
}
const db = getDb();
console.log(`Applying ${path.basename(file)} to ${getDbPath()}`);
db.exec('BEGIN IMMEDIATE;');
try {
  db.exec(fs.readFileSync(file, 'utf8'));
  db.exec('COMMIT;');
  console.log('Done.');
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('Down-migration failed and was rolled back:', (err as Error).message);
  process.exitCode = 1;
} finally {
  closeDb();
}
