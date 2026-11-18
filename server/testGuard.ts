import path from 'node:path';

/**
 * Called at the very start of createApp(), BEFORE any database is opened. When APP_ENV=test the process must be configured with an
 * explicit disposable database; otherwise it could migrate/seed the project's real default database. No side effects.
 */
export function assertSafeTestEnvironment(): void {
  if (process.env.APP_ENV !== 'test') return;
  const configured = process.env.DB_PATH;
  const defaultDb = path.resolve(process.cwd(), './data/agri_advisory.db');
  if (!configured || path.resolve(configured) === defaultDb) {
    throw new Error('APP_ENV=test refuses to start without an explicit, disposable DB_PATH (never the default ./data/agri_advisory.db).');
  }
  if ((process.env.TEST_FIXTURE_TOKEN ?? '').length < 16) {
    throw new Error('APP_ENV=test requires TEST_FIXTURE_TOKEN of at least 16 characters.');
  }
}
