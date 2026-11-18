# M2 report — MySQL schema, migration runner, seeds

Branch `feature/offline-first`, from `3c7a685`. Scope: **M2 only**. Nothing deployed, pushed or merged; no existing database, XAMPP config or SQLite file was touched; the React frontend, IndexedDB/PWA code and the Node/SQLite reference are unchanged.

## Deliverables
| Path | Purpose |
|---|---|
| `backend-php/migrations/001_schema.sql` | 26 data tables (+ ledger created by the runner = **27**), 30 FKs, 5 JSON CHECKs, ENUMs for the closed sets, `DATETIME(3)` UTC, no `ON UPDATE`, `utf8mb4_unicode_ci`, MEDIUMTEXT data URLs |
| `backend-php/app/Migrations/Runner.php`, `bin/migrate.php` | forward-only runner: SHA-256 ledger, `GET_LOCK`, `--dry-run`, engine preflight (MySQL ≥ 8.0.16 / MariaDB ≥ 10.4), refuses unmanaged non-empty schemas and modified applied files, reports the failing statement |
| `backend-php/app/Migrations/Linter.php` | static portability rules (also run by the runner before executing) |
| `backend-php/app/Database/Connection.php` | PDO with identical session `sql_mode`, `time_zone='+00:00'`, utf8mb4; credentials from the environment only |
| `scripts/export-seed.ts` → `database/seed/{reference,prototype,counts}.json` | seed data **generated from the Node seed** in a temp SQLite file; no password hashes or ownership secrets exported |
| `backend-php/app/Seed/Seeder.php`, `bin/seed.php` | `reference` (safe everywhere), `prototype` (APP_ENV must be exactly `test`/`development`; demo passwords from env only), `admin` (env-supplied credentials) |
| `backend-php/tests/run.php` | 44-check validation matrix, run per engine in fresh scratch databases |

Usage: `DB_USER=… DB_PASS=… DB_NAME=… php backend-php/bin/migrate.php status|up [--dry-run]|lint`; `php backend-php/bin/seed.php reference|prototype|admin`.

## Results (disposable MySQL 8.0.44 on :3307 and MariaDB 10.4.28 on :3308)
**44 checks × 2 engines: 88 passed, 0 failed.** Highlights: install twice (second run no-op, 27 tables); dry run creates nothing; tampered migration refused; concurrent runner blocked by the lock; failed migration reports statement 2 and records nothing; table/column/nullability/30-FK delete-rule/UNIQUE/index/ENUM parity against a SQLite database built in memory from the Node migrations; every FK indexed; zero `TIMESTAMP`, zero `ON UPDATE`, all 32 `*_at` columns `DATETIME(3)`; D1 verified (view-count update leaves `updated_at`, an edit changes it, milliseconds round-trip); 2.5 MB data URL round-trips byte-identical in all 4 large columns; emoji/Unicode; JSON valid/invalid/NULL behaviour (D12); case-variant duplicate email rejected (D16); reference seed row counts and every value equal the Node export, idempotent; prototype seed refused for `production`, `staging`, `prod`, empty and unset APP_ENV (class and CLI), refused without env-supplied demo passwords; demo hashes verify in PHP **and** Node (scrypt format interchangeable both ways); admin bootstrap validated, audited, password never logged; seed JSON contains no secrets; scratch databases dropped.
Also re-run and green: `test:api` 31/31, `test:harness` 4/4, `test:contract` (63 requests match golden), `test:offline` 22+6+3. Seed drift check: regenerating the export from the Node seed gives identical data (timestamps excluded).

## Notes and findings
* Date-only values (`last_reviewed_at = '2026-10-15'`) are stored as midnight UTC; M8 must apply the same rule.
* `platform_settings.key` → `setting_key`; the PHP API must map it back where responses expose `key`.
* `lower_case_table_names=2` locally vs `0` on Hostinger: caught by the lowercase lint rule, not by the engines.
* `max_allowed_packet`: scratch engines run at 64 MB; XAMPP's own MariaDB (1 MB, untouched per instruction) cannot store 2.5 MB data URLs. The runner warns below 16 MB.
* Unique emails become case-insensitive: M8 must pre-check SQLite for case-variant duplicates and **stop and report** (D16).
* Prototype seed excludes owner/requester secrets, so seeded listings have no owner key (they remain "demo" rows nobody can edit as owner).

## Not done / outstanding
Hostinger engine, version, `max_allowed_packet` and cron/SSH availability still unconfirmed (D5). Seeds do not yet carry `audit_logs`/`saved_advice` demo rows (the Node seed creates none). Runtime access layer starts in M3.

## M3 scope (proposed, not started)
PHP core: front controller, router, request/response, error handler, config loader (fail-closed secrets), logging, security headers, CORS, `/api/health` and `/api/csrf-token` parity tests.
