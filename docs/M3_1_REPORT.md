# M3.1 — Security hardening before M4 (report)

Branch `feature/offline-first`, based on `b6f2721`. Scope: the four pre-M4 items (P1–P4) from `docs/M4_READINESS.md` §2.3 plus regression protection for the already-applied httpoxy and disabled-function fixes (A1′). **No authentication, mail sending, USSD, React or Node changes.** SMTP stays inactive: configuration is validated, but no sender exists.

## 1. What changed

| # | Requirement | Change | Files |
|---|---|---|---|
| 1 | Forwarded headers | Default = **no proxy trust**. `TRUST_PROXY=1` now **requires** `TRUSTED_PROXY_CIDRS` (explicit proxy IPs/CIDRs; nothing about Hostinger is assumed). Forwarded headers are read only when the TCP peer is listed. `X-Forwarded-For` is verified **from the right**: listed proxies are skipped, the first unlisted address is the client; the client-controlled left side is never used. A malformed, oversized (>512 B) or >10-hop chain is ignored whole (peer address used). `X-Forwarded-Proto` counts only from a listed peer, only `http`/`https` tokens, rightmost value decides. Ranges wider than /8 (IPv4) or /32 (IPv6) are refused (`0.0.0.0/0`, `::/0`). Unparsable `REMOTE_ADDR` becomes `0.0.0.0`. `TRUSTED_PROXY_CIDRS` without `TRUST_PROXY=1`, or flag typos, are configuration errors. | `app/Http/TrustedProxies.php` (new), `Request.php`, `Config.php`, `Bootstrap.php` |
| 2 | M2 parity checker | New explicit allow-list `tests/php_only.php` (currently **empty**). Checks 12/14/16 subtract only listed tables. New checks: 12b (unlisted extra table still fails, listed one accepted, a Node table can never be allow-listed away), 12c (entry validation: lower-case, not a Node table, migration ≥ 002, reason required), 12d (`001_schema.sql` contains no allow-listed table and its SHA-256 equals the recorded value, i.e. unchanged). `001_schema.sql` was **not** modified. | `tests/run.php`, `tests/php_only.php`, `tests/001_schema.sha256` |
| 3 | Fail-closed config | New validated settings (names only in errors, never values): `IP_HASH_SECRET` (required in production/staging, ≥32, strong, distinct from the other secrets); `SESSION_IDLE_MINUTES` 720, `SESSION_ABSOLUTE_HOURS` 168, `SESSION_IDLE_MINUTES_ADMIN` 30, `SESSION_ABSOLUTE_HOURS_ADMIN` 8 (bounded; idle ≤ absolute; admin ≤ ordinary); `PASSWORD_HASH_SCHEME` (`legacy|argon2id|bcrypt`, explicit in production, `argon2id` refused if the build lacks it) and `PASSWORD_REHASH_ENABLED` (explicit in production; refused together with `legacy`), cost bounds; `MAIL_TRANSPORT` (`null` default; `log`/`capture` refused in production/staging; `smtp` needs host, port, `tls|starttls`, credentials, valid from-address, no localhost/IP in production; `MAIL_VERIFY_PEER` cannot be disabled; header-injection characters refused). Typos in booleans/integers are errors, never silently false/default. The summary printed by `bin/check-config.php` shows no secret and no mail host. `mailActive()` is hard-wired `false`; a hygiene warning states that `smtp` is configured but nothing will be sent. | `Config.php`, `.env.example`, `Bootstrap.php` |
| 4 | Health | `GET /api/v1/health` keeps its fields, order, status codes and messages. The database-derived part is cached privately for **15 s** (failures **3 s**) in `CACHE_DIR` (default `storage/cache`, 0700 dir / 0600 files, atomic writes, ignores the `_` buster, `timestamp` always live). One refresher at a time (non-blocking lock), others serve an entry ≤ 60 s old; a corrupt, future-dated or tampered cache is ignored and only contract fields are ever emitted; an unwritable cache falls back to live checks. Added response header `X-Health-Cache: HIT|MISS|STALE`. **Deep check** `?deep=…`: does not exist (404) unless `HEALTH_DEEP_TOKEN` is set; token only in header `X-Health-Token` (constant-time compare; a URL token is rejected); **rate-limited per client (default 10/min) before the token is checked**, so guessing is throttled and a correct token cannot bypass the limit; limiter fails closed on I/O errors and caps its table; no cache, `no-store`. Deep adds only `deep`, `dbLatencyMs`, `appliedMigrations`, `cacheDirWritable`, `logDirWritable`. No response ever contains database error text, host, paths or versions (verified by tests). In production a TTL of 0 is refused. | `HealthController.php`, `Support/FileStore.php` (new) |
| 5 | Earlier fixes preserved | httpoxy rule (`RequestHeader unset Proxy`, no `early`) and disabled-function guards are covered by the unchanged Apache assertions (28/28) and unit tests. | `tests/m3/apache-check.sh` |

Existing tests were adapted only where the API necessarily changed (`fromGlobals` takes a `TrustedProxies` object instead of a boolean; production fixtures include the new required settings; dev servers in the HTTP suite set `HEALTH_CACHE_TTL_SECONDS=0` so older tests still observe live behaviour).

## 2. Test evidence (all run in this session on disposable engines MySQL 8.0.44 :3307 and MariaDB 10.4.28 :3308; no existing database touched)

| Suite | Result |
|---|---|
| `php backend-php/tests/m3_unit.php` (PHP 8.5.5, 8.4.17, 8.3.30) | **107 passed, 0 failed** (75 before; +32 for M3.1: proxy chains/CIDR/IPv6/proto, config fail-closed matrix, health cache/deep/rate limiter/file store) |
| `npm run test:m3` HTTP (PHP 8.5.5 final run; 8.3.30 and 8.4.17 ran before a last test-fixture-only change that moved the production server's cache into a temp dir) | **48 / 48** (37 before; +11: forged `X-Forwarded-*` behaviour end to end via the IP-keyed deep-check limiter and the `Secure` cookie decision, 200 parallel pollers → ≤ 8 live checks, outage cached ≤ fail TTL with no leak, cache file permissions, production fail-closed matrix, complete smtp block validates but sends nothing) |
| `tests/m3/apache-check.sh` under private Apache 2.4.56 + php-cgi (8.5.5, 8.4.17, 8.3.30) | **28 / 28 each** (httpoxy behavioural test with positive control, bootstrap env-clear, disabled-functions) |
| M2 matrix `backend-php/tests/run.php` on both engines | **47 checks × 2 engines = 94 passed, 0 failed** (44 before; +12b, 12c, 12d) |
| Node reference `test:api` / `test:harness` / `test:offline` / `test:contract` | 31 / 4 / 22+6+3 pass; contract: all 63 requests match golden |
| `git diff HEAD -- src server`, `001_schema.sql` | empty / unchanged (SHA-256 asserted by check 12d) |

A pre-existing `SyntaxError … JSON` line printed by the HTTP suite comes from a deliberately malformed-JSON test; it appears on the previous commit as well.

## 3. Behavioural notes / compatibility
* `TRUST_PROXY=1` alone is now a configuration error. Any existing `.env` that used it must add `TRUSTED_PROXY_CIDRS`. No deployment exists yet, so nothing breaks.
* Production now additionally requires `IP_HASH_SECRET`, `PASSWORD_HASH_SCHEME`, `PASSWORD_REHASH_ENABLED` (see `.env.example`); the values are not used until M4.
* Session/password defaults are the *proposed* values from the readiness report, not decisions: S1, D4a and D4b are still open and only bound the allowed range here.

## 4. Remaining risks and blockers (none of them blocks reviewing M3.1; items 1–3 block M4)
1. **IP-1 (decision/host fact):** the real proxy address(es) and header used by Hostinger/LiteSpeed are unknown. Until `TRUSTED_PROXY_CIDRS` is set from verified facts, every visitor shares the proxy's address, so per-IP limits (deep health now, login/register/reset in M4) would be one global bucket (safe, but it can lock out everyone). Must be measured on staging (readiness S-L3) — **not verified**.
2. S1 / D4a / D4b / D6a / R-1 / E-1 / F1 / L1 / LR-* from `docs/M4_READINESS.md` §18 remain undecided.
3. PHP 8.2 itself was not available locally (8.3, 8.4, 8.5 tested). LiteSpeed behaviour not verified.
4. The deep-check limiter uses a file under `CACHE_DIR`; on a host with a read-only or non-locking filesystem it fails closed (deep check unusable, public health unaffected). M4's limiter will use the database.
5. A cached `database: connected` can be up to 15 s old (documented trade-off, H1).
6. Cached health relies on filesystem time; a large clock step only causes an early refresh (future-dated entries are discarded).
