# M2 preparation report — MySQL schema, migration runner, seeds

Status: **findings and approach only. No migration has been applied, no existing database was modified, no M2 code has been written.**
Based on commit `cb263db` (M1 accepted). Decisions received: **D1** UTC `DATETIME(3)`, modification timestamps must not change for view-count-only updates; **D2** keep data-URL uploads working through the migration, protected file storage later; **D5** local XAMPP engine is MariaDB 10.4.28, Hostinger engine still unconfirmed.

## 1. Environment findings (this Mac: macOS 12.7.6, x86_64)

| Item | Result |
|---|---|
| Docker | **Not installed** (and Docker Hub is unreachable from this environment). Not needed — see next row |
| MySQL 8 | **Available:** MAMP ships **MySQL 8.0.44** (`/Applications/MAMP/Library/bin/mysql80`, native x86_64) and 5.7.44. It was not running and MAMP's own data was **not touched** |
| Local MariaDB | XAMPP **10.4.28-MariaDB** on 3306 (running; only server variables were read). Default `sql_mode=STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION`, `collation_server=utf8mb4_general_ci`, `lower_case_table_names=2` |
| Disposable test servers | I created **two throwaway servers in the session scratch folder** (own data dirs, loopback only, short sockets, no project data): MySQL 8.0.44 on **3307** and MariaDB 10.4.28 on **3308**, driven by `database/validation/scratch-engines.sh start|stop|status|reset`. Both were verified reachable from **PHP 8.5.5 via PDO (mysqlnd 8.5.5)**; both are now **stopped** |
| PHP | `/usr/local/bin/php` 8.5.5 with `pdo_mysql`, `pdo_sqlite`, `sqlite3`, `sodium`, `mbstring`, `openssl`, `curl`, `fileinfo`, `gd`. (XAMPP's own PHP 8.0.28 is too old and is not used.) |
| Real MySQL defaults seen | `sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`, `collation_server=utf8mb4_0900_ai_ci`, `default_authentication_plugin=caching_sha2_password`, `max_allowed_packet=64M` |
| Hostinger | **Cannot be verified from here.** Needs the owner to read the values listed in §7 |

### Environment requirements discovered
1. **`max_allowed_packet` (blocking for XAMPP):** XAMPP's MariaDB is set to **1 MB**, but the app must keep storing data URLs up to **2.5 MB per field** (D2) inside a 4 MB request. MySQL 8 defaults to 64 MB. Local development needs `max_allowed_packet≥16M` in `xamppfiles/etc/my.cnf` (`[mysqld]`), and the **Hostinger value must be checked**; if it is small the plan's file-storage phase must be pulled forward or the data-URL cap lowered.
2. **Case-sensitive table names:** both local engines run with `lower_case_table_names=2` (macOS, case-insensitive); Hostinger (Linux) is `0` (case-sensitive). A wrong-case table name would pass locally and fail in production, so M2 adds a lint rule (all identifiers lowercase) and the runner warns on mismatch.
3. **sql_mode must be set by the application** on every connection (not left to the server default), identically on both engines (§4).
4. No Docker, Composer or extra packages are required for M2.

## 2. Exact M2 scope and exit criteria (from the approved plan, §13)
**Deliverable:** *MySQL schema `M001` + migration runner; seed scripts (reference + prototype data).* **Exit criteria:** *Schema applies cleanly on MySQL 8 (and MariaDB if applicable); FK/index checks pass.*
Also binding on M2 (plan §7, §8, §9.2, §17 and your decisions): `DATETIME(3)` UTC; **no `ON UPDATE CURRENT_TIMESTAMP` on modification timestamps** (view-count increments must not change `updated_at`); data-URL columns kept as large text; `platform_settings.key` → `setting_key`; the 8 tables missing from `database/mysql/001_initial_schema.sql`; explicit primary keys preserved for later migration; sessions/logins not carried over; secrets never defaulted.
Source of truth being mapped: **27 SQLite tables, 30 foreign keys (rules CASCADE / RESTRICT / SET NULL), 15 CHECK constraints, 7 UNIQUE declarations, 6 explicit indexes, 158 TEXT columns (34 timestamp-like)**, 11 large-payload columns (data URLs, markdown, `*_json`).
The existing `database/mysql/001_initial_schema.sql` (19 tables) is **not** reusable as-is: it uses `TIMESTAMP` (19 columns), `ON UPDATE CURRENT_TIMESTAMP` on many `updated_at` columns (the exact D1 hazard) and the native `JSON` type. It is superseded, not edited or deleted.

## 3. MySQL 8 vs MariaDB — measured differences
I ran 31 identical SQL experiments on both throwaway engines (`database/validation/compat-probe.php`). Results that affect our schema and code (`≠` = engines differ):

| Experiment | MySQL 8.0.44 | MariaDB 10.4.28 | Consequence for M2 |
|---|---|---|---|
| `DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)`, ms round trip | OK | OK | Use it everywhere (D1) |
| Unrelated `UPDATE` with no `ON UPDATE` clause leaves `updated_at` unchanged | OK | OK | **D1 verified on both**: set `updated_at` only on real edits |
| `TIMESTAMP … ON UPDATE CURRENT_TIMESTAMP` bumps on **any** row change | bumps | bumps | Confirms why it must not be used (view counter would break offline conflict detection) |
| ≠ `TEXT NOT NULL DEFAULT ''` (literal default) | **ERR 1101** | OK | Never give TEXT a literal default; use `VARCHAR(n) DEFAULT ''` or `TEXT NOT NULL` with the app supplying `''` |
| `TEXT DEFAULT ('')` expression default | OK | OK | Allowed but unnecessary |
| ≠ native `JSON` / `CHECK(JSON_VALID())` | rejects bad JSON (3140 / 3819) | rejects bad JSON (4025) | Both reject; error **codes differ** → app/tests must not depend on engine error codes |
| ≠ `CREATE INDEX IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS` | **syntax error** | OK | Forbidden: use the versioned migration runner instead |
| ≠ collation `utf8mb4_0900_ai_ci` | OK | **ERR 1273** | Always specify `utf8mb4_unicode_ci` (works on both) |
| `key` as an unquoted identifier | ERR 1064 | ERR 1064 | Rename `platform_settings.key` → `setting_key` (confirmed) |
| ≠ `rank`, `groups`, `system` unquoted | **ERR 1064** | OK | MariaDB would hide MySQL-8 reserved-word bugs: forbid them/quote them. **Our 162 table/column names were all tested unquoted on both engines: only `key` fails** |
| `ONLY_FULL_GROUP_BY` (set explicitly) | ERR 1055 | ERR 1055 | Both enforce it **only if set**; the app must set the same `sql_mode` on every connection and write full-group-by-safe SQL |
| 4-byte emoji, composite 2×VARCHAR(100) PK (800-byte key), `ENUM` strict rejection, `ON DELETE SET NULL`, `ON DUPLICATE KEY UPDATE`, `GET_LOCK`, `SET time_zone='+00:00'`, `AUTO_INCREMENT` reset after explicit ids | identical | identical | Safe to rely on |
| UNIQUE under `utf8mb4_unicode_ci` is **case-insensitive** (`A@x.com` vs `a@x.com`) | ERR 1062 | ERR 1062 | **Behaviour change vs SQLite**, where UNIQUE is case-sensitive → migration pre-check for case-variant duplicate emails (§5.4) |
| `LIKE` is accent-insensitive (`café` matches `cafe`) | match | match | Differs from SQLite (ASCII-only case folding): marketplace search results may include accent variants; accepted and covered by a parity test |
| ≠ `SELECT … FOR UPDATE SKIP LOCKED` | OK | ERR 1064 | Do not use |
| `INSERT … RETURNING` | ERR 1064 | ERR 1064 (needs 10.5+) | Do not use; use `lastInsertId()` |
| ≠ `information_schema.COLUMN_DEFAULT` format | `x` | `'x'` | The structure validator must normalise defaults |
| ≠ error codes for CHECK/JSON violations | 3819/3140 | 4025 | Assert “rejected”, or SQLSTATE class, never the vendor code |

## 4. Design rules for schema `M001` (derived from the findings)
1. **Types:** `BIGINT UNSIGNED AUTO_INCREMENT` ids; `DATETIME(3)` UTC for all timestamps (no `TIMESTAMP` anywhere); `TINYINT(1)` booleans; `ENUM` for the closed sets that SQLite `CHECK`s enforce; `VARCHAR(n)` sized from the application's validation limits; `MEDIUMTEXT`/`LONGTEXT` for data URLs, markdown and `*_json`; `CHAR(64)` for hashes.
2. **JSON (new decision D12):** use `LONGTEXT NOT NULL` + `CHECK (JSON_VALID(col))`. It behaves identically on both engines and the app never queries inside JSON. (Native `JSON` is allowed only if the Hostinger engine is confirmed MySQL 8.)
3. **Timestamps (D1):** `created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`; `updated_at` set **explicitly by application code only on real edits**; no `ON UPDATE`. Connection init: `SET time_zone='+00:00'`. API strings keep the format the client already round-trips (`YYYY-MM-DD HH:MM:SS`), and the conflict check compares parsed instants and accepts both second and millisecond precision.
4. **Defaults:** no literal defaults on TEXT; defaults only on VARCHAR/numeric/enum/datetime.
5. **Collation/charset:** every table `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, specified explicitly (works on both engines).
6. **Constraints:** keep all 30 FKs with the same delete rules, add an index on every FK column, translate the 15 CHECKs (enums or `CHECK`), keep the 7 UNIQUEs.
7. **Portability lint (CI-style, runs on every `.sql` file):** forbid `IF NOT EXISTS` on index/column DDL, `TIMESTAMP`, `ON UPDATE`, native `JSON`, collations other than `utf8mb4_unicode_ci`, literal TEXT defaults, `RETURNING`, `SKIP LOCKED`, unquoted `key/rank/groups/system/...`, and any non-lowercase identifier.
8. **Connection `sql_mode`** (set by the app, identical on both): `STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY`.
9. **Minimum engine versions** enforced by the runner: MySQL ≥ 8.0.16 (CHECKs enforced) or MariaDB ≥ 10.4.

## 5. Validation approach (planned; nothing run yet)
### 5.1 Layers
1. **Static lint** of `database/migrations/*.sql` against the rules in §4.7 (no database needed).
2. **Apply on scratch servers:** a fresh scratch database on **both** MySQL 8.0.44 (3307) and MariaDB 10.4.28 (3308) via the scratch-engine script; run twice to prove idempotency of the runner (second run = no-op); tamper a file to prove checksum detection.
3. **Structure parity (automated):** a PHP validator builds a disposable SQLite DB from the **Node migrations** (read-only reference), then compares it with `information_schema` of each MySQL-family engine: same 27 tables (+ `sync_operations`), same column names and nullability, mapped types, defaults normalised, 30 FKs with equal delete rules, every FK indexed, UNIQUE set equal, enum values equal to the SQLite `CHECK` sets, all charsets/collations `utf8mb4`/`utf8mb4_unicode_ci`, all engines InnoDB, **zero `TIMESTAMP` columns**, and **no `ON UPDATE` on any `updated_at`**.
4. **Behavioural tests on both engines:** NOT NULL/ENUM/CHECK/FK/UNIQUE enforcement; cascade and set-null rules; `updated_at` unchanged by a view-count update and changed by an edit (D1); emoji round trip; a 2.5 MB data URL insert and read-back (requires §1.1); max-length boundaries; duplicate-key race on `sync_operations(actor, op_key)`; session `sql_mode` and `time_zone` applied.
5. **Seed parity:** after seeding, row counts and key business values equal the Node reference seed (7 guides, 11 listings, 6 language recordings, simulated expert requests, roles, settings); a normalised dump of reference tables from MySQL equals a normalised dump from the Node seed.
6. Matrix and reporting: one command runs everything on every configured engine and prints a table (engine × check). **Hostinger is added as a third target as soon as its engine/version is known** (the same checks run against a scratch database there only after explicit approval).
### 5.2 Migration runner (design)
PHP CLI `bin/migrate.php` (`status | up | verify | --dry-run`): preflight (engine/version gate, `max_allowed_packet≥16M`, `lower_case_table_names`, charset/collation availability, privileges); `GET_LOCK('agri_migrate')` so two runs cannot overlap; forward-only numbered files with **SHA-256 checksums** stored in `schema_migrations`; files executed statement by statement (MySQL DDL is not transactional, so a failure stops and is reported with the exact statement; recovery = restore the pre-migration dump); refuses to run against a non-empty schema that lacks a baseline record; `--dry-run` prints what would run; no `DROP` of data tables without an explicit flag; the migration user is separate from the runtime user. Credentials come only from `.env`/environment, never from the command line history or the repository.
### 5.3 Seeds (design)
- **Reference seed** (roles, crops, categories, guides + translations, platform settings): generated *from the Node seed itself* into versioned JSON (`database/seed/*.json`) by an export script that reads a **disposable** SQLite DB, so there is no hand-copied content; a PHP loader inserts with explicit ids. Idempotent (`INSERT … ON DUPLICATE KEY UPDATE`).
- **Prototype/demo seed** (11 listings, language recordings, simulated expert requests, demo accounts): loaded **only when `APP_ENV` ∈ {test, development}**; the loader refuses in production. Demo account passwords are never stored in the JSON: they are hashed at load time from values supplied by the environment (non-production only).
- **Production:** reference seed only + an admin created by `bootstrap-admin` from environment-supplied credentials.
### 5.4 Data-semantics checks to build into the later data migration (recorded now)
Case-variant duplicate emails (SQLite allows, MySQL UNIQUE rejects) → report and require an owner decision, never auto-merge; unparsable timestamps; invalid JSON; enum values outside the allowed sets; orphan foreign keys; oversize fields vs column limits.

## 6. Decisions needed from you before M2 starts
| ID | Question | Recommendation |
|---|---|---|
| D12 | JSON columns: portable `LONGTEXT + CHECK(JSON_VALID)` or native `JSON` | Portable `LONGTEXT + CHECK` (identical on both engines) |
| D13 | Engine policy: keep DDL/SQL portable for **both** MySQL 8 and MariaDB until Hostinger is confirmed (min MySQL 8.0.16 / MariaDB 10.4) | Yes |
| D14 | Seeds: demo accounts and prototype data **never** in production; production = reference seed + env-supplied admin | Yes |
| D15 | If Hostinger's `max_allowed_packet` is below 16 MB: lower the data-URL cap now, or pull the file-storage phase forward | Decide after you read the value |
| D16 | Case-variant duplicate emails found at migration time: stop and report for a manual decision (no auto-merge) | Yes |
| — | Allow me to raise `max_allowed_packet` to 16M in XAMPP's `my.cnf` (a local config change + MariaDB restart) for data-URL tests | Needed only for the *XAMPP* instance; the scratch MariaDB already runs with 64M |

## 7. What I need you to check on Hostinger (hPanel) — read-only
1. Databases → the engine and version shown for your database (MySQL 8.x or MariaDB 10.x).
2. PHP Configuration → PHP version available (8.2/8.3) and extensions: `pdo_mysql`, `sodium`, `mbstring`, `fileinfo`, `gd`.
3. If phpMyAdmin is available, run `SHOW VARIABLES LIKE 'max_allowed_packet'; SHOW VARIABLES LIKE 'sql_mode'; SELECT VERSION();` and send the three results (no credentials).
4. Whether you can create a **second** database user (migration vs runtime) and whether cron jobs and SSH are available on your plan.

## 8. Proposed M2 work breakdown (after your answers)
1. `database/migrations/001_schema.sql` … (the full schema, ordered by FK dependency) + portability lint. 2. Runner `bin/migrate.php` with preflight/checksums/locking. 3. Structure-parity validator + behavioural tests (engine matrix). 4. Seed export script + PHP loader + seed-parity test. 5. Docs and an evidence report (engine × check table). **Exit:** the matrix is green on MySQL 8.0.44 **and** MariaDB 10.4.28 and the lint passes; Node/SQLite and the frontend remain untouched.

## 9. What was and was not done in this preparation
Done (all on throwaway servers or read-only): inventory of local engines; two disposable servers created/started/stopped; 31 compatibility probes; 162-identifier reserved-word test; schema statistics derived from the SQLite migrations **in memory**; added `database/validation/scratch-engines.sh` and `compat-probe.php` (the probe refuses to run unless `AGRI_DISPOSABLE_DB_OK=1`).
**Not done:** no migration applied; no project database or XAMPP/MAMP data directory touched; `data/agri_advisory.db*` not opened; no M2 schema, runner or seed code written; nothing deployed, pushed or merged.
