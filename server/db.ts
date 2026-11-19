import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

let dbInstance: DatabaseSync | null = null;

/** Application root: where `server/migrations` and `dist` live. The server entry sets APP_ROOT from its own location; otherwise the working directory. */
export function appRoot(): string {
  return path.resolve(process.env.APP_ROOT || process.cwd());
}

export function getDbPath(): string {
  const configured = process.env.DB_PATH || './data/agri_advisory.db';
  return path.isAbsolute(configured) ? configured : path.resolve(appRoot(), configured);
}

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  // WAL is the default. SQLITE_JOURNAL_MODE=delete is the fallback for file systems where WAL's shared-memory file is unreliable (decided at staging).
  db.exec(process.env.SQLITE_JOURNAL_MODE === 'delete' ? 'PRAGMA journal_mode = DELETE;' : 'PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db);
  dbInstance = db;
  return db;
}

export function runMigrations(db: DatabaseSync): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.resolve(appRoot(), 'server/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migration folder not found: ${migrationsDir}. The application folder must contain server/migrations.`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const checkStmt = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const markStmt = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');

  for (const file of files) {
    const existing = checkStmt.get(file);
    if (existing) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(sql);
      markStmt.run(file);
      db.exec('COMMIT;');
      applied.push(file);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
  return applied;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
