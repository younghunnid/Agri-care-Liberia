# Black-box test harness and contract snapshots (Milestone M1)

The API suite no longer imports the Node server or SQLite. It talks to a backend **only over HTTP**, plus a small **test-only fixture contract**.
That lets the identical 31 tests (and the 63-request contract script) run against the Node reference now and against the PHP backend later.

## Commands
| Command | What it does |
|---|---|
| `npm run test:api` | 31 black-box API tests. Boots the Node reference **in-process** on a random port with a disposable SQLite file in the OS temp dir |
| `API_BASE_URL=http://host:port TEST_FIXTURE_TOKEN=<token> npm run test:api` | Same tests against **any** server implementing this contract (external mode) |
| `npm run test:contract` | Runs the 63-request contract script on a fresh backend and compares it with `tests/contract/golden/node.v1.json` |
| `npm run test:contract:update` | Regenerates the golden snapshot. **Only from the Node reference backend on a fresh database**, and only when Node behaviour is changed deliberately |
| `npm run test:harness` | Unit tests of the snapshot normaliser/differ |

## Requirements for a backend under test (external mode)
1. A **fresh, disposable** instance (tests create fixed phone numbers and rely on 11 seeded listings, 7 guides, the demo expert `+231770000201`, quotas).
2. Environment: `APP_ENV=test`, `TEST_FIXTURE_TOKEN=<>=16 chars>`, `AI_ANON_DAILY_LIMIT=3`, no Gemini key (`GEMINI_API_KEY` empty).
3. It must expose the fixture routes below **only** when `APP_ENV=test`, require the `X-Test-Fixture-Token` header (constant-time compare), and **refuse to start with `APP_ENV=test` on anything but an explicitly chosen disposable database**. Node does this in `server/testGuard.ts` before any database is opened (verified: it refuses, listens on nothing, and leaves the default `data/agri_advisory.db*` byte-for-byte unchanged).
4. No raw SQL: every fixture is a fixed, parameterised operation.

## Fixture contract (`/__test__/*`, JSON, outside `/api`)
| Method + path | Body / query | Response |
|---|---|---|
| `POST /users` | `{displayName, phone, password, roles:['farmer'|'expert'|'admin'], expertStatus?, county?}` | `201 {id}` (creates user, role rows, farmer/expert profile) |
| `GET /count/:table` | table ∈ users, marketplace_listings, marketplace_inquiries, demo_expert_requests, local_language_recordings, audit_logs, sync_operations | `{count}` |
| `GET /listings/:id` | | `{listing:{id, price_lrd, seller_phone, phone_consent, moderation_status, seller_user_id, owner_key_hash, owner_token}}` or 404 |
| `GET /listings/by-legacy-token/:token` | | `{id}` or 404 (seeded `demo-seed-0`) |
| `POST /listings/:id/moderation` | `{status}` | `{ok:true}` |
| `POST /listings/:id/updated-at` | `{value}` | `{ok:true}` (forces a stale `updated_at` to test conflicts) |
| `POST /listings/key-matches` | `{id, key}` | `{matches:boolean}` (HMAC computed inside the backend) |
| `GET /expert-requests/:id` | | `{request:{id, status, expert_reply, assigned_expert_name, requester_key_hash, requester_token, user_id}}` |
| `POST /expert-requests/count-by-key` | `{key}` | `{count}` |
| `GET /recordings/:id` | | `{recording:{id, review_status}}` |
| `GET /audit-count?action=&targetId=` | | `{count}` |
| `GET /sync-operations/:opKey` | | `{rows:[{actor, kind, status_code, response_json}]}` |
The tests deliberately assert **structure** of stored secrets (64-char hash, raw key absent) and **behaviour** (`key-matches`), never a backend-specific HMAC value, so PHP may use its own hashing as long as it honours the same semantics.

## Contract snapshots
`tests/contract/script.ts` defines 63 ordered requests across every endpoint family (platform, reference data, auth, farmer, advisor, feedback, marketplace, idempotency, expert requests, language lab, management, admin, role/CSRF failures, logout). `normalize.ts` records, per request: status, selected headers (`content-type`, `idempotent-replay`, `retry-after`, `x-content-type-options`, `referrer-policy`), cookie **attributes** (never values), and a normalised body (ids → `<id>`, timestamps → `<timestamp>`, hex secrets, data URLs and long strings masked; keys sorted). The golden file contains no secrets or personal data (checked for hashes, tokens, passwords, cookie values).
Verified: the snapshot is deterministic across independent fresh runs, and a tampered golden fails on exactly the altered requests. A new backend passes when its normalised exchange equals the golden for all 63 requests.
