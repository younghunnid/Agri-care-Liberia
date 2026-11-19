-- Reverses 008_shared_demo_accounts.sql. After this, the application must also be rolled back (it reads users.is_shared_demo).
DROP INDEX IF EXISTS idx_rate_limit_created;
ALTER TABLE users DROP COLUMN is_shared_demo;
DELETE FROM schema_migrations WHERE version = '008_shared_demo_accounts.sql';
