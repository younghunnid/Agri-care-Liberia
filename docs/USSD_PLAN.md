# USSD channel — architecture and implementation plan (Milestone M11)

## Approved decisions (U1–U6) — architecture only; implementation NOT authorized
| ID | Decision (owner-approved) | Consequences recorded in this plan |
|---|---|---|
| **U1** | Use **one aggregator** capable of supporting **both MTN Liberia and Orange Liberia**. Prefer **one shared USSD short code**, subject to telecom approval. | Adapter layer targets the aggregator's single specification first (one adapter profile); the per-operator adapters in §2 become *operator profiles* of that aggregator (differences in prefixes, codes, limits), not separate integrations. No code is assumed or registered; a per-operator code remains a fallback if approval is not granted. |
| **U2** | Support **short free-text expert questions** in USSD v1, subject to **gateway input limits, abuse protection and session constraints**. | Max length = min(gateway limit, 160); category first; per-phone daily cap; content filters/rate limits (§4); question confirmation by reference; if the gateway cannot carry free text the feature degrades to category-only + callback/SMS invitation. |
| **U3** | **Consent-based phone-only farmer accounts.** Do not require a smartphone, internet connection or an existing web account. Plan appropriate verification and consent mechanisms. | See §2a below. |
| **U4** | Implement USSD **administration through React pages**, but **only in a separately approved future milestone**. | §7 admin API remains planned; no React change until that milestone is approved (decision U4 closed). |
| **U5** | **Launch with English.** Add Liberian languages **only after qualified human review** of the translations. | Only `reviewed` translations are ever served; language menu shows languages that have a recorded reviewer sign-off; English is the fallback. |
| **U6** | **Data minimisation**, configurable retention periods, scheduled deletion and documented privacy protections. Retention defaults are *proposed* for later approval — none is approved. | See §4a below. |

> M3 (PHP application foundation) is a prerequisite and deliberately contains **no** USSD endpoints, tables, adapters, menus, simulator, SMS sending or admin pages.

Status: **plan for review. Nothing implemented, no telecom service contacted or activated.** No USSD code is registered or assumed: wherever this document shows a code it is the placeholder `*SHORTCODE#`, supplied later through configuration. The React frontend, IndexedDB/PWA and the Node/SQLite reference are not changed by this plan. M2 (database migration) is independent; USSD tables arrive in a later, separate migration (`002_ussd.sql`), never by editing `001_schema.sql`.

## 1. Confirmed requirements
MTN Liberia and Orange Liberia; **one shared short code on both networks, subject to operator approval**; both networks served by the same PHP/MySQL platform with identical menus and content; English plus **reviewed** local-language translations; SMS notification of expert replies once an SMS gateway exists; local simulator needing no telecom link; one shared USSD application with separate configurable adapters; shared content and expert-request services; secure sessions, phone-number privacy, request validation, rate limiting; an administrative interface for menus and translations.

## 2. Architecture
```
 MTN network ──► POST /ussd/mtn ────┐                                  ┌─► ContentService  (agricultural_guides, crops, categories, translations)
 Orange network ► POST /ussd/orange ┤  Adapter (per operator):         ├─► ExpertRequestService (advisory_questions)
 Simulator (dev/test only) ─────────┘  authenticate → parse → normalise │─► LanguageService (reviewed translations only)
                                       ▼                                ├─► SmsService (outbox → provider; disabled by default)
                          UssdRequest {operator, sessionRef, msisdn, input, serviceCode, ts}
                                       ▼
                     UssdEngine (stateless handler + DB session state machine, menu tree from DB)
                                       ▼
                          UssdResponse {text, continue|end}  ──► Adapter renders operator format
```
* **One application, thin adapters.** Everything operator-specific lives in `app/Ussd/Adapters/{Mtn,Orange}Adapter.php` behind a `GatewayAdapter` interface: `authenticate(Request)`, `parse(Request): UssdRequest`, `render(UssdResponse): Response`. The engine never sees operator formats. A compatible aggregator is just a third adapter or a config profile.
* **Provider specifications are unknown today.** Field names, authentication scheme (shared secret, HMAC signature, mTLS, IP allowlist, basic auth), response format (plain text with `CON`/`END` prefix vs XML/JSON), session semantics and timeout are *adapter configuration to be filled from each operator's documentation*, not assumptions. Until then the adapters are built against a documented internal contract and exercised by the simulator.
* **Content is never duplicated.** Menus are navigation only; leaf text is read from `agricultural_guides` / `guide_translations` through the same `ContentService` the REST API uses (M5), via a *USSD summary* projection (first N characters of the summary, not the full markdown). A guide is shown only if `is_published = 1 AND review_status = 'approved'`, exactly like the web.
* **Expert questions** reuse `advisory_questions`/`advisory_messages`; the USSD channel adds `channel='ussd'`. Because `advisory_questions.farmer_id` is NOT NULL, a farmer who asks a question is linked to a `users` row (existing account matched by phone, or a minimal phone-only farmer account created **after explicit consent in-session**, status `active`, unusable random password, no login until they set one through the web). See decision U3.
* **Hostinger fit.** Plain PHP request/response; no daemon. Session state in MySQL (no Redis). SMS dispatch and cleanup by cron (`bin/ussd-cron.php`). Latency budget: operators typically cut a USSD session after a few seconds without reply, so each request must finish in well under that: indexed queries only, no outbound HTTP inside the request path, no AI calls in USSD v1.

## 2a. Consent-based phone-only farmer accounts (U3) — proposed mechanics
* **No prerequisites:** a farmer on a basic phone can register entirely through USSD; no smartphone, data connection or web account is needed. A farmer who *already* has a web account is matched by phone number and the USSD identity is linked to it only after the verification step below.
* **Consent screen (before anything is stored):** plain-language, ≤ 160 chars per screen, in the farmer's selected language: what is stored (phone number, county, language, questions), why, that SMS replies may be sent, how to withdraw (dial → "My data" → "Delete my data") and whom to contact. Options *1 Agree / 2 No thanks*. Declining still allows anonymous browsing of public advice with nothing stored except a short-lived hashed session.
* **Verification:** the network supplies the MSISDN, which is strong evidence the caller controls the SIM, but it can be spoofed if the callback channel is compromised. Verification is therefore layered: (1) authenticated aggregator callback (§4); (2) **SMS one-time code before the first SMS is ever sent to a new number** and before linking to an existing web account (blocked until an SMS provider exists — until then the account stays *USSD-only* and cannot be linked); (3) optional 4-digit USSD PIN chosen by the farmer for sensitive actions (view/delete my data), stored hashed with a pepper and rate-limited.
* **Account shape:** a minimal `users` row (role `farmer`, status `active`, random unusable `password_hash`, no email) plus a `ussd_contacts` consent record (consent text version, timestamp, language, SMS consent flag). Web login is impossible until the farmer sets a password through a verified path.
* **Rights:** withdraw consent / delete data from the USSD menu at any time; deletion removes the contact record and anonymises the user and question rows according to §4a.
* **Open item for legal review:** consent wording and lawful basis under Liberian law and the aggregator's terms.

## 3. Menu design (consistent across operators)
Rules: ≤ 160 characters per screen (configurable `USSD_MAX_CHARS`, default 160, with a safety margin), GSM-7 characters only in v1 (accented/local-script characters force UCS-2 and halve the limit, so local-language strings are linted for it), numbered options `1–7` per page, **`0` Back, `00` Home, `99` Next page** on paginated lists, one language chosen once and remembered per phone (hashed key), invalid input re-shows the same screen once then ends politely.
```
Welcome to Agri-Advisory      (screen 1, language set from saved preference or English)
1 Crop advice
2 Pests & diseases
3 Soil improvement
4 Seeds & planting
5 Ask an expert
6 Language
0 Exit
```
`1/2/3/4` → choose crop (paged) → choose topic → paged text (`99` next, `0` back). `5` → category → short free-text question (≤ 160 chars) → consent to SMS reply → confirmation reference (e.g. `Q-1042`) → later: "check my answer" by reference. `6` → English / Bassa / Kpelle / Mano / Liberian English (only languages with `reviewed` translations are listed). All strings, including navigation words, come from the translation tables; the tree itself (nodes, order, enabled flag, linked content filter) lives in the database so the admin interface can manage it.
Pagination is computed server-side from the current state (`page`, `cursor`) so a repeated/late request re-renders the same page (idempotent).

## 4. Security and privacy
* **Request authentication** per adapter: constant-time verification of the operator mechanism (HMAC over canonical request, shared secret, or Basic/Bearer, **plus** source-IP allowlist where the operator publishes ranges and Hostinger permits enforcing it in `.htaccess`/application). Unauthenticated requests get a generic 403 and are logged without the MSISDN.
* **Validation:** strict length/charset on every field; MSISDN normalised to E.164 (`+231…`); only the configured operator's MCC/MNC or prefix pattern accepted for that route; `Content-Type` and body-size caps; service-code must equal the configured shared code.
* **Replay and duplicate delivery:** operator `sessionRef` + request sequence/timestamp stored in `ussd_request_log` with a unique key; an identical retry returns the stored response without re-executing side effects (same idea as `sync_operations`); timestamps outside ± `USSD_CLOCK_SKEW` (default 120 s) are rejected where the operator supplies one; where the operator offers no nonce, replay protection falls back to session binding (session id + monotonically increasing step) and short TTL.
* **Rate limits** (reuse `rate_limit_attempts`): per MSISDN-hash (e.g. 30 requests/minute, 5 new sessions/minute), per source IP, per operator route, and a daily cap on expert questions per phone (default 3). Over-limit → short "Try again later" END screen.
* **Phone-number privacy.** The raw MSISDN is not stored in USSD tables or logs. `msisdn_hash = HMAC-SHA256(USSD_MSISDN_PEPPER, E.164)` is used for sessions, rate limits, preferences and lookups. The number is stored encrypted (libsodium secretbox, key `USSD_ENCRYPTION_KEY`, never defaulted) **only** where it is operationally required — the SMS outbox and the consented farmer account — with an expiry. Admin screens show masked numbers (`+231 77• ••• 12`). Pepper/key absent in production → the USSD module refuses to start (fail closed, like the other secrets). Audit entries use the hash only.
* **Content-injection safety:** user free text is stored as plain text, length-capped, control characters stripped; never executed or interpolated into SQL (prepared statements) or into menu templates.
* **Simulator is not a production surface:** its routes and signing key exist only when `APP_ENV` is `test` or `development` (same guard as the demo seeds).
* **Short code and callbacks:** nothing in the repository contains a real code, operator credential or callback secret; they are environment configuration.

## 4a. Data minimisation and retention (U6) — PROPOSED defaults, not approved
Principles: collect only the MSISDN (hashed for lookups; encrypted only where SMS needs it), selected language, county (optional) and the question text; no names or location are requested over USSD; no raw MSISDN in logs, sessions or rate-limit keys; question text is treated as potentially personal; everything below is a **configuration value** (`platform_settings` / environment), enforced by a scheduled purge job (`bin/ussd-cron.php`, Hostinger cron) that writes an audit summary (counts only).
| Data | Proposed default (needs owner approval) | Mechanism |
|---|---|---|
| USSD session state | 24 hours after last activity | purge job |
| Request/replay log | 7 days | purge job |
| Rate-limit counters | 2 days | purge job (existing) |
| Raw callback payload copies | not stored | — |
| SMS outbox rows (content) | 30 days after delivery/failure, then body blanked, metadata 90 days | purge job |
| Consent record + encrypted MSISDN | until withdrawal, or 12 months without activity (then deleted after an SMS/USSD reminder where possible) | purge job + user-initiated delete |
| Expert questions/answers from phone-only accounts | 24 months, then de-identified (user link removed) | purge job |
| Audit entries about USSD | 12 months (hashes only) | purge job |
Documented protections: encryption key and pepper outside the repository and the web root, key rotation procedure, least-privilege DB user, masked display in admin screens, access logging for any admin view of a number, breach-response contact, and a data-protection impact note kept with this plan.

## 5. Database requirements (migration `002_ussd.sql`, planned; same portability rules as M2: `DATETIME(3)` UTC, `utf8mb4_unicode_ci`, no `ON UPDATE`, JSON as `LONGTEXT`+CHECK)
| Table | Purpose / key columns |
|---|---|
| `ussd_menu_nodes` | `id`, `parent_id` (self-FK), `node_key` (UNIQUE), `node_type` ENUM(menu, content_list, content_item, ask_expert, language, text), `content_filter_json` (e.g. category slug), `sort_order`, `is_enabled`, `updated_by`, `updated_at` |
| `ussd_menu_translations` | `node_id` FK, `language_code`, `title`, `body`, `review_status` ENUM(draft, reviewed, rejected), `reviewed_by`, `reviewed_at`, UNIQUE(`node_id`,`language_code`); served only when `reviewed` (English fallback) |
| `ussd_strings` | system strings (errors, navigation words, consent text) with the same translation/review columns |
| `ussd_sessions` | `id`, `operator`, `provider_session_ref`, `msisdn_hash`, `state_json` (node, page, cursor, pending question draft), `language_code`, `step`, `created_at`, `last_seen_at`, `expires_at`, UNIQUE(`operator`,`provider_session_ref`), index on `expires_at` |
| `ussd_request_log` | replay/idempotency: UNIQUE(`operator`,`provider_session_ref`,`step`), `response_text` (short, no MSISDN), `created_at`; purged after 7 days |
| `ussd_contacts` | consented phone store: `msisdn_hash` UNIQUE, `msisdn_encrypted`, `user_id` FK SET NULL, `sms_consent`, `consented_at`, `expires_at`, `preferred_language` |
| `sms_outbox` | `id`, `contact_id` FK, `template_key`, `body` (rendered text, no PII beyond the reply), `status` ENUM(queued, sending, sent, failed, cancelled), `attempts`, `provider_ref`, `scheduled_at`, `sent_at`, `last_error` (sanitised) |
| `ussd_admin_audit` | menu/translation changes (who, what, before/after hash) — or reuse `audit_logs` with new action names |
| *(existing)* `advisory_questions` | add nullable `channel` ENUM(web, ussd, sms) default `web`, `external_ref` (the "Q-1042" reference) in the same migration |
| *(existing)* `rate_limit_attempts`, `platform_settings` | reused (settings: `ussd_enabled`, `ussd_max_chars`, `ussd_session_ttl`, per-operator enable flags — all default **off**) |

## 6. SMS notification of expert replies
`SmsService` interface (`send(to, text, ref)`), drivers: `null` (default; logs "would send" without the number), `log` (dev), and one real provider chosen later. Flow: expert answers → `advisory_messages` row → if the question's channel is `ussd` and the contact has `sms_consent` → one `sms_outbox` row (template `expert_reply`, body = reference + first ~120 chars + "reply on web/USSD for full text") → cron worker sends with retry/backoff, marks `sent/failed`, honours quiet hours, and never sends without consent. **Blocked until an SMS provider is approved**; until then the farmer is told on the USSD screen to dial back and choose "My answers". Delivery receipts (if the provider offers callbacks) use the same authentication/replay rules as §4.

## 7. Administrative interface
Scope: manage menu tree (add/reorder/enable nodes), edit translations with the draft → reviewed workflow (reviewer must be a different admin than the editor for local languages), preview any screen with character counter and GSM-7 check, view masked usage statistics, toggle operators on/off, and view SMS outbox status. Delivered as **admin-only PHP JSON endpoints under `/api/admin/ussd/*`** (RBAC + CSRF + audit like the existing admin API). The UI itself requires new screens in the React app, which this plan does not touch: **decision U4** — (a) new React admin pages in a later, explicitly approved frontend change (recommended), or (b) a minimal server-rendered admin page isolated from the SPA.

## 8. Simulator (works with no telecom)
`bin/ussd-sim.php` (terminal) and a development-only page `/dev/ussd-sim` (not routed in production): choose operator profile (MTN/Orange), phone number (fictional `+231 000 …` test numbers only), session id; it builds correctly authenticated requests using the test secret and calls the real adapters, so adapter parsing, authentication, replay, rate-limit and rendering code are all exercised. Features: number-by-number navigation, session timeout simulation, delayed/duplicated/replayed request injection, bad-signature and wrong-IP cases, 160-character counter, language switching, scripted scenario files (`tests/ussd/scenarios/*.yaml`) used by the automated suite.

## 9. Testing strategy
1. **Unit:** state machine transitions, pagination boundaries (exactly 160 chars, 161, empty list, last page), GSM-7 lint, MSISDN normalisation/hashing, translation fallback, review-status filtering.
2. **Adapter contract tests** per operator with recorded sample payloads from the operator's documentation (added when received): authentication pass/fail, malformed/oversized input, wrong content type, wrong service code, wrong operator prefix.
3. **Security tests:** replay of a captured request, duplicate delivery, clock skew, rate-limit trip and recovery, log inspection proving no raw MSISDN/secret appears, SQL-injection/control-character free text, unauthenticated simulator route absent when `APP_ENV=production`, fail-closed when pepper/key missing.
4. **Integration:** complete journeys on MySQL 8 **and** MariaDB (the M2 engine matrix): browse each menu, ask an expert question → row visible to experts in the web app (`channel='ussd'`) → expert reply → SMS outbox row (null driver) → "my answers" shows it; guide content equals the REST API's content for the same guide (no duplication).
5. **Parity:** the same scripted scenario run through MTN and Orange adapters yields identical screen text.
6. **Load/latency:** p95 request < 300 ms locally at 50 concurrent sessions; session purge job safe under load.
7. **Field (blocked until operator test access):** real-handset checks on both networks, timeout behaviour, special characters, multi-session; results recorded separately from simulator results.

## 10. Telecom integration checklist (all items require external action; none started)
- [ ] Decide commercial route: direct operator agreements vs a licensed aggregator that serves both MTN Liberia and Orange Liberia.
- [ ] Contact the national regulator (Liberia Telecommunications Authority) and each operator to confirm eligibility, application procedure and any content/registration obligations for a USSD application; confirm the legal entity applying (organisation registration documents, tax ID, authorised signatory).
- [ ] Request a **shared short code on both networks**; confirm whether the operators will provision the same code, whether the code is allocated per operator, and the allocation/renewal terms. **Do not advertise or print any code until written approval.**
- [ ] Obtain each operator's technical specification: protocol (HTTP/XML/SMPP/other), request/response field names, session and timeout semantics, character set and maximum length, authentication method, callback IP ranges, TLS requirements, test/sandbox access and test numbers.
- [ ] Confirm network/hosting requirements: fixed public HTTPS endpoint, certificate requirements, whether operators require IP allowlisting of *our* server (Hostinger shared hosting may not provide a dedicated IP or firewall control — see risk R1), expected availability/SLA, latency limit.
- [ ] Agree test plan, UAT sign-off and go-live process with each operator; obtain test shortcode/sandbox first.
- [ ] Data-protection review: lawful basis and notice for processing phone numbers, consent wording for SMS, retention periods, cross-border processing (Hostinger region), breach contact.
- [ ] SMS provider approval (aggregator or operator bulk SMS), sender-ID registration, template approval, delivery-receipt callbacks.
- [ ] Content governance: named reviewers for English and each local-language translation; sign-off recorded before a language is enabled.
- [ ] Support and billing model decided (who pays session charges — free-to-end-user "zero-rated" vs charged; revenue-share), and customer-support contact for farmers.
- [ ] Monitoring/alerting and an operator contact for incidents.

## 11. Cost categories (no figures: all must be quoted by the providers)
One-time: short-code application/registration fee; operator/aggregator onboarding and integration/testing fee; legal/regulatory filing; translation review honoraria; handset test devices and SIMs. Recurring: short-code rental/licence; per-session or per-message USSD charges, or a bundled aggregator fee, and who bears them (zero-rating negotiation); SMS per-message cost; hosting (Hostinger plan, possibly an upgrade/static IP/VPS if operators require a fixed IP or private connectivity); monitoring; content-review and farmer-support staffing; periodic security review. Variable: traffic growth (sessions × screens per session), SMS reply volume, failed-delivery retries.

## 12. Deployment steps (after approval; none performed)
1. Land migration `002_ussd.sql` through the M2 runner on staging (MySQL 8 and MariaDB matrix green). 2. Configure secrets (`USSD_MSISDN_PEPPER`, `USSD_ENCRYPTION_KEY`, per-operator credentials, `USSD_SHORT_CODE`) in the server `.env` — never in the repository. 3. Deploy adapters disabled (`ussd_enabled=false`, each operator flag off). 4. Run simulator suite on staging. 5. Share the staging HTTPS callback URL with each operator for sandbox testing; execute operator UAT; record results. 6. Load reviewed content and translations through the admin interface; reviewers sign off per language. 7. Enable one operator for a pilot group; monitor errors, latency, rate-limit hits; then enable the second. 8. Enable SMS only after provider approval and a consent-flow review. 9. Rollback = flip the operator flag off (USSD route returns a polite END message); no impact on web/PWA.

## 13. Milestone breakdown (separate roadmap item **M11**)
Depends on: M2 (schema runner), M3 (PHP core), M5 (content read services), M6 (expert requests). Live activation additionally depends on M10 and the operator approvals above.
| Phase | Deliverable | Exit criteria |
|---|---|---|
| U0 | Plan approval; decisions U1–U6; operator/aggregator contact started by the owner | Written sign-off |
| U1 | `002_ussd.sql`, models, MSISDN hashing/encryption, config fail-closed | Migration matrix green on MySQL 8 + MariaDB; no raw MSISDN stored (test) |
| U2 | Engine, menu loader, pagination, content projection, language service | Unit + journey tests green; content equals REST output |
| U3 | Adapter interface, generic simulator-profile adapter, security layer (auth, validation, replay, rate limit) | Security tests green |
| U4 | Simulator (CLI + dev page) and scenario suite | Both operator profiles pass identical scenarios |
| U5 | Expert question flow + reference lookup + SMS outbox (null driver) | End-to-end question → reply → outbox row |
| U6 | Admin API (menus, translations, review workflow, stats) and chosen admin UI | RBAC/CSRF/audit tests green |
| U7 | MTN and Orange adapters finalised against the real specifications; operator sandbox UAT | Operator sign-off *(external)* |
| U8 | Pilot and go-live | Monitoring thresholds met *(external)* |

## 14. Decisions requested
| ID | Question | Recommendation |
|---|---|---|
| U1 | ~~Direct operator integrations or one aggregator?~~ **Approved: one aggregator for both networks** | closed |
| U2 | **Approved:** short free-text questions in v1 (subject to gateway limits, abuse protection) | closed |
| U3 | **Approved:** consent-based phone-only accounts | closed (mechanics in §2a) |
| U4 | **Approved:** React admin pages in a separately approved future milestone | closed |
| U5 | **Approved:** launch with English; add languages only after qualified human review | closed |
| U6 | **Approved:** minimisation + configurable retention + scheduled deletion; **default durations in §4a are proposals awaiting approval** | open (durations only) |

## 15. Risks
R1 Hostinger shared hosting may not offer a fixed IP, IP allowlisting or the uptime an operator demands → may need an upgrade or intermediary. R2 Operator timeouts vs shared-hosting latency. R3 Operators may not provision one identical short code on both networks → per-operator codes behind the same app (design already supports). R4 Character-set limits make faithful local-language rendering hard → GSM-7 lint, transliteration guidance, reviewed strings only. R5 Phone numbers are personal data → hashing/encryption/retention design above. R6 Scope creep into AI answers via USSD → excluded from v1 (latency and unverified model). R7 Specs unknown until operators respond → adapters are configuration-driven and proved with the simulator first.
