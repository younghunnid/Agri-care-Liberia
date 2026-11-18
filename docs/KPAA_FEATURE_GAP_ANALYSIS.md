# KPAA concepts vs. Agri-Advisory Liberia — feature gap analysis

Status: **analysis for approval. Nothing implemented.** No database touched, no architecture change (React + TypeScript + Tailwind, PHP 8.2+ REST API, MySQL 8 / MariaDB, IndexedDB offline-first PWA, future USSD). M3 (PHP foundation) continues independently and is not affected by this document.

## 0. Method and limits
* **No KPAA source document exists in this repository** (searched the whole tree). The eight concepts below are taken exactly as listed in the request; where a concept is ambiguous the interpretation is stated. If a KPAA paper/slide deck exists, share it and this analysis should be re-checked against it.
* "Already implemented" is judged from the code in this branch (`feature/offline-first`, Node/SQLite reference + React frontend) and from the M2 schema, with file references. Nothing was run against a browser for this analysis beyond existing test evidence (31 API tests, 63-request contract snapshot, offline unit tests).
* **Runtime reality to keep in mind:** the live app today is the Node/SQLite reference; the PHP backend is at M3 (health + CSRF only). Every enhancement below must therefore be specified once and delivered in two places: the Node reference (for the demo) and PHP (M5/M6 parity). Section 5 proposes how to avoid doing the work twice.
* Complexity scale (one developer, includes tests and docs, excludes external approvals): **S** ≤ 2 days, **M** 3–6 days, **L** 7–15 days, **XL** > 15 days.

## 1. Summary

| # | KPAA concept | Already in our app | Verdict | Target milestone | Complexity |
|---|---|---|---|---|---|
| 1 | Verified advice cards (unique code, approval status, version history, audio) | **Partial** — approval workflow, `version` counter, reviewer name/date, reviewed translations, one demo audio lesson | **Enhance** | New **M12 Verified Advice Cards** (spec now; PHP data layer with M5) | **M–L** |
| 2 | Offline harvest listing creation + reliable sync | **Largely done** — drafts in IndexedDB, queue, `Idempotency-Key`, conflict check, consent-gated phone, retries | **Keep + polish** (visible sync receipt, remaining gaps) | M6 (PHP parity); demo polish now | **S** (polish) |
| 3 | Crop photo triage + preliminary-diagnosis warnings + expert escalation | **Partial** — photo + voice note on expert requests, static "photo cannot give a diagnosis" note in AI fallback, expert reply queue | **Enhance** | New **M13 Guided Photo Triage** (after M6) | **M** |
| 4 | Public verification codes for marketplace listings | **Missing** (only a boolean `phone_verified`; no code, no verification levels) | **Enhance (new)** | M12 (same code service as #1), PHP with M6 | **M** |
| 5 | USSD access to verified advice + selected marketplace info | **Planned only** (`docs/USSD_PLAN.md`; a browser IVR *voice* simulator exists, not USSD) | **Keep plan; add marketplace lookup and verified-card lookup to scope; postpone build** | **M11** (not authorised) | **XL** (live), **M** for simulator-only slice |
| 6 | Privacy-preserving analytics for authorised institutions | **Prototype only** — Ministry dashboard runs on *synthetic* data; `management-summary` returns raw counts | **Postpone** (design now, build after real data volume) | New **M14 Institutional Analytics** (after M10) | **L** |
| 7 | RBAC, audit logging, duplicate-sync protection | **Mostly done** — roles/guards, 20 audit actions, `sync_operations`, rate limits, owner keys | **Keep; close 6 specific gaps** | M4 (auth/audit), M6 (sync) | **S–M** |
| 8 | Realistic hackathon demo with simulated integrations | **Partial** — 14-step demo flow, demo mode, phone IVR simulator, synthetic Ministry data, all labelled as simulated | **Enhance** (scripted scenario + honest "simulated" labelling) | Now (demo-only slice) | **S–M** |

## 2. Concept-by-concept

### 2.1 Verified agricultural advice cards
**Exists**
* Approval workflow: `agricultural_guides.review_status` (`draft | pending_review | approved | changes_requested`), `is_published`, `reviewed_by_name`, `reviewed_by_user_id`, `last_reviewed_at`; `guide_reviews` decisions table; the review endpoint bumps `version` on approval (`server/routes/v1.ts` ≈ line 1416); admin page `AdvisoryContentReviewPage`.
* Only reviewed content is public; translations have their own `translation_status`/`reviewed_by` (`guide_translations`); source attribution and `is_sample_demo` flags.
* Audio: downloadable lesson registry (`src/data/audioLessons.ts`) with honesty rules; exactly **one** synthetic English demo file; no Liberian-language recordings; audio is *not* linked to a specific guide version.
**Missing**
1. **Public verification code** per approved advice (none exists).
2. **Version history**: only a counter; the content of v1/v2 is overwritten, so a reader cannot see what changed or prove which text a code referred to.
3. **Public verify page/endpoint** ("Is this advice real and current?") including *superseded/withdrawn* states.
4. **Card presentation**: shareable/printable card with code, reviewer, date, version, language, audio link, QR.
5. **Audio ↔ advice binding** (which recording belongs to which version/language; reviewer for the recording).
6. Separation of duties (author ≠ approver) and an explicit **withdrawn** state.
**Security / privacy / dependencies**
* The code is a *public identifier*, never an authorisation secret. Use ≥ 40 random bits in Crockford base32 with a check character (e.g. `AAL-7K3Q-9XM2-F`), unique index, generated server-side; lookup endpoint rate-limited and returns only public fields; unknown vs withdrawn distinguished; no enumeration of drafts.
* Version snapshots store content immutably (append-only table); approving creates a snapshot with a content hash so the code → text mapping is tamper-evident.
* Audio files need the protected-storage path planned for PHP (D2/D15), and a human reviewer record; never mark synthetic audio as "verified".
* Dependencies: M2 schema (additive migration `002`), M5 content services, existing review workflow; QR needs a small client library (no backend dependency).
**Recommendation: ENHANCE.** **Milestone:** specification now; build as **M12 "Verified Advice Cards"** (data layer lands with M5 content services). A demo-only slice can run on the Node reference first. **Complexity: M–L** (L if audio recording workflow is included; M without).
**Avoid duplicating:** reuse `agricultural_guides`, `review_status`, `guide_reviews`, `version`, translations; add only the code, snapshot table and verify endpoint/page.

### 2.2 Offline harvest listing creation and reliable synchronisation
**Exists (substantial)**
* IndexedDB stores `drafts`, `syncQueue` (`src/lib/offlineDrafts.ts`, `syncEngine.ts`); statuses Draft → Pending Sync → Published / Sync Failed; automatic retry/back-off with the same `Idempotency-Key` (opId); `POST /marketplace/listings` is idempotent (`sync_operations`, atomic reservation planned for PHP); edit conflicts detected with `baseUpdatedAt` → 409 `CONFLICT` with a user choice; image compression and offline picture handling; consent-gated phone numbers (server drops phone for synced writes without consent); per-listing owner keys; per-device requester keys; documented in `docs/OFFLINE_SYNC_API.md`; tests 15–19 cover idempotency/conflict.
**Missing / weak**
1. `POST /marketplace/listings/:id/inquiries` and `PATCH …/inquiries/:id` are **not** idempotency-keyed (a retried offline inquiry can duplicate).
2. No **sync receipt** the farmer can see (when, which server id, public code) — important for trust and for the demo.
3. No user-visible, deterministic **demo of duplicate protection** (the tests prove it, the UI does not show it).
4. `view` counter and listing delete are fire-and-forget (acceptable, noted).
5. Physical-Android validation still outstanding (not an implementation gap).
**Security/privacy:** keep consent-gated phone; idempotency keys must stay scoped to actor (already hashed); do not echo owner keys in receipts.
**Recommendation: KEEP, polish.** Add the receipt UI and idempotency for inquiries as small changes. **Milestone:** polish now (demo), inquiry idempotency + parity in **M6**. **Complexity: S** (polish), **S** (inquiry idempotency).
**Avoid duplicating:** do not rebuild the queue/engine; only surface what exists.

### 2.3 Crop photo triage with preliminary-diagnosis warnings and expert escalation
**Exists**
* Expert request form with compressed photo and voice note (`ExpertSupportPage`, `demo_expert_requests`), simulated expert queue with reply; AI advisor accepts an image flag and appends *"An uploaded photo cannot give a definitive … diagnosis"* (`server/ai.ts`); pest/disease guides (`is_pest_disease`) and `PestsDiseasesPage`; AI live model unverified (`gemini-4-hydrogen`), so today's advisor is a labelled fallback.
**Missing**
1. A **guided triage flow**: photo → 3–5 symptom questions (plant part, spread, weather, age) → ranked *possible* matches from **approved pest/disease guides only** → prominent "preliminary — not a diagnosis" banner → one-tap escalation that pre-fills the expert request with photo + answers.
2. Structured triage record (what was shown, which guides were suggested, whether escalated) and expert-side view of it.
3. Escalation SLA/status visible to the farmer; offline support (capture offline, triage rules offline, escalate on sync).
**Security/privacy/dependencies**
* **No ML claim.** Rule-based matching against reviewed guides is honest and works offline; any future image model needs validation data, bias/accuracy reporting and a separate approval.
* Photos can contain faces/locations: strip EXIF (the PHP upload pipeline plans re-encoding), store privately, restrict to the requester + responders (already the model for expert requests), retention policy.
* Mandatory wording: preliminary, may be wrong, do not apply chemicals/destroy crops based on this alone, contact an expert; escalate by default for severe-symptom answers.
* Dependencies: reviewed pest/disease guide set (content team), M6 expert-request endpoints, protected upload storage (M7).
**Recommendation: ENHANCE.** **Milestone:** new **M13 "Guided Photo Triage"** after M6/M7; a rule-based demo slice is feasible earlier. **Complexity: M.**
**Avoid duplicating:** reuse the expert-request photo/voice pipeline, guides and escalation queue.

### 2.4 Public verification codes for marketplace listings
**Exists:** listings with `is_fictional_seller`, `phone_verified` (boolean, no verification mechanism), moderation status, view count, owner-key hashing. Listing IDs are sequential integers (guessable, not designed as public references).
**Missing**
1. **Public listing code** (same generator as 2.1) shown on the card, searchable, and usable on USSD/SMS later.
2. **Verification levels** with honest meanings, e.g. *Unverified → Phone consented → Phone verified by SMS/USSD code → Admin/extension-officer verified*, each with who/when; today the single boolean is misleading.
3. A **lookup page/endpoint** ("check this seller/listing") returning only already-public fields and the verification level; reporting/flagging of suspicious listings feeding the existing moderation.
**Security/privacy/dependencies**
* The code identifies; it never authorises edits (owner key remains the secret). Rate-limit lookups; do not reveal hidden/flagged listings or phone numbers (consent rules unchanged).
* "Phone verified" must not be shown until a real verification path exists (SMS gateway or USSD session proof) — until then use the label "Phone number provided (not verified)". Simulated demo verification must be labelled **simulated**.
* Dependencies: shared code service (M12), SMS provider/USSD for true phone verification (M11), moderation workflow (exists).
**Recommendation: ENHANCE (new, small).** **Milestone:** **M12** (code + levels + lookup), phone verification with **M11/SMS**. **Complexity: M.**

### 2.5 USSD access to verified advice and selected marketplace information
**Exists:** `docs/USSD_PLAN.md` with approved decisions U1–U6 (one aggregator, shared code subject to approval, free-text questions, consent-based phone-only accounts, React admin in a later milestone, English at launch, minimised retention); `PhoneSimulatorPage` is a browser *voice/IVR* simulation (keypad tones + speech) — not a USSD simulator and no backend.
**Missing:** everything implementational (explicitly not authorised): adapters, engine, tables, simulator, SMS, admin.
**Scope additions this analysis recommends (planning only)**
* Menu items *"Check advice code"* (enter the public code → shows verified status + short text) and *"Market prices & listings"* (read-only top N listings by county/category, only consented/public fields, no phone numbers over USSD). Both depend on M12 codes.
* Marketplace over USSD must be **read-only in v1** (no creation, no seller phone disclosure) to keep abuse and privacy risk low.
**Security/privacy/dependencies:** as in `USSD_PLAN.md` §4/§4a; additionally listing/advice lookups must use the same public-fields projection as the web (single source), and per-MSISDN lookup rate limits to prevent scraping of seller data. Aggregator approval and short-code allocation are external.
**Recommendation: KEEP the plan, extend its scope, POSTPONE the build.** A **simulator-only demo slice** (no telecom, English, read-only, ≤ 3 menus) would be valuable for the hackathon but is part of M11 and **needs your explicit authorisation**. **Milestone:** **M11.** **Complexity:** simulator-only slice **M**; full production USSD **XL** (incl. external approvals).

### 2.6 Privacy-preserving agricultural analytics for authorised institutions
**Exists:** `MinistryDashboardPage` uses `SYNTHETIC_MINISTRY_DATA` (clearly labelled synthetic); `GET /prototype/management-summary` returns raw platform counts (public, unauthenticated, harmless but not an analytics product); audit logs and reports pages for admins.
**Missing**
1. An **institution role** and access model (`institution_viewer`), data-sharing terms, per-institution scopes (county/crop), and audit of every view/export.
2. **Aggregation layer** with small-cell suppression (k-anonymity style threshold), no raw rows, no phone numbers or free text, coarse geography (county), time bucketing, optional noise; documented privacy design.
3. Real data volume: with a few hundred demo rows, aggregates are either meaningless or identifying.
**Security/privacy/dependencies:** legal/data-protection review, consent wording that mentions aggregate analytics, re-identification testing (small counties, rare crops), export controls, retention, no cross-joins with phone identifiers; depends on M4 RBAC, M6 data, M10 production data.
**Recommendation: POSTPONE.** Keep the synthetic dashboard clearly labelled for the demo; design (thresholds, role, audit) now in a short spec. **Milestone:** new **M14** after M10. **Complexity: L.** Proposed suppression threshold (e.g. ≥ 10 farmers per cell) is a **proposal needing approval**, not a decision.

### 2.7 RBAC, audit logging and duplicate-synchronisation protection
**Exists:** server-verified roles `farmer | expert | admin` (`requireRole` guards about two dozen routes), expert approval status, ownership by account or listing/requester key (HMAC-hashed), CSRF, rate limits, `audit_logs` with 20 action names (`writeAuditLog` called from about twenty places), admin reports page, `sync_operations` idempotency for listing and expert-request creation, `baseUpdatedAt` conflicts, M1 regression tests 20–31 proving the security rules.
**Gaps (all small)**
1. Inquiry creation not idempotent (see 2.2).
2. No **separation of duties** for advice approval (author can approve own content) — needed for credible "verified" status.
3. Audit coverage: listing *creation*, rate-limit trips and upload rejections are not audited (planned new actions in the PHP plan); no `request_id` correlation yet (M3 adds the id).
4. No tamper-evidence for audit rows (optional hash chaining) and no read-access auditing for sensitive admin views.
5. No role for institutions/reviewers/extension officers (needed by 2.1, 2.4, 2.6).
6. Idempotency table purge/retention job (planned M-cron).
**Recommendation: KEEP; close gaps in M4 (auth/audit) and M6 (sync).** **Complexity: S–M** in aggregate.

### 2.8 Realistic hackathon demonstration with simulated integrations
**Exists:** 14-step demo flow and readiness assessment (`docs/TEAM8_HACKATHON_READINESS.md`, `PHASE1_DEMO_GUIDE.md`), `/demo` mode page, demo reset (admin-only), IVR phone simulator, synthetic Ministry dashboard, demo marketplace and simulated expert queue — all explicitly labelled.
**Missing:** a single **scripted end-to-end scenario** that shows the new trust features together (e.g. *farmer on a feature phone checks an advice code → farmer in the field creates a listing offline → reconnects → sync receipt → buyer verifies listing code → photo triage escalates to an expert*), reproducible reset, a visible **"simulated integration" badge system** (SMS, USSD, mobile money, telecom), and a printed one-page honesty statement for judges. Prior blockers (no admin account for the demo) are solved by the secure bootstrap tooling, not by seeding a default admin.
**Security/privacy:** simulated integrations must never send real SMS or contact telecom/aggregators; demo accounts only in non-production (D14); synthetic data labelled.
**Recommendation: ENHANCE.** **Milestone:** now (demo-only; no architecture change). **Complexity: S–M.**

## 3. Five highest-value enhancements for the hackathon demonstration
Ranked by (impact on the judging story) ÷ (effort + risk), all honest about what is simulated.

| Rank | Enhancement | Why it is high value | Builds on | Complexity | Needs your approval beyond this analysis |
|---|---|---|---|---|---|
| **1** | **Verified advice cards** with public verification code, version/withdrawn status, reviewer + date, "verify" page, QR, link to the (labelled) audio lesson | The central KPAA trust idea; turns existing review workflow into something a farmer/buyer can *check*; cheap because the approval machinery exists | `agricultural_guides`, `guide_reviews`, translations, audio registry | M | Yes — new feature work |
| **2** | **Offline harvest listing → reconnect → sync receipt** (with visible duplicate-protection demonstration) | Our strongest, already-built differentiator; polish makes it demonstrable in 60 seconds | `offlineDrafts`, `syncEngine`, `sync_operations` | S | Yes — small UI/inquiry-idempotency change |
| **3** | **Guided crop-photo triage** (rule-based, preliminary-diagnosis banner, one-tap expert escalation, works offline until escalation) | Directly addresses a real farmer need; shows responsible AI/human-in-the-loop; no ML claim needed | Expert requests with photo/voice, pest & disease guides | M | Yes |
| **4** | **Marketplace public listing codes + verification levels + lookup page** (honest labels; SMS/USSD verification shown as *simulated*) | Builds buyer trust; reuses the code service from #1; prepares the USSD marketplace lookup | Listings, moderation, consent flow | M | Yes |
| **5** | **USSD simulator slice** (English, read-only: *check advice code* and *browse verified listings*), clearly "no telecom connection" | Tells the feature-phone inclusion story judges expect; reuses #1/#4 data; the simulator is required by M11 anyway | Approved U1–U6 decisions, `USSD_PLAN.md` | M | **Yes — this is the first M11 work; M11 is currently NOT authorised.** Alternative if you prefer not to start M11 early: replace with a labelled-synthetic analytics view with suppression rules (#6 slice, S–M). |

Runner-ups: privacy-preserving analytics slice (M14), audit/role tightening (M4).
Suggested order for a small team: 2 (quick win) → 1 → 4 → 3 → 5. Items 1 and 4 share one code-generation service; 5 depends on 1 and 4.

## 4. Technical and security principles applying to all five
* **One implementation contract, two runtimes.** Define each feature as an API contract + additive migration + tests once; implement on the Node reference for the demo and port to PHP under the existing parity harness (M1) so nothing is built twice in different shapes. New tables must pass the M2 portability linter (DATETIME(3) UTC, utf8mb4_unicode_ci, no ON UPDATE, JSON as LONGTEXT+CHECK).
* **Public codes ≠ secrets.** Random, check-digit, non-sequential, rate-limited lookups, public-fields-only projection, never used as authorisation.
* **Honest labelling.** Every simulated integration, synthetic datum and unverified claim is labelled in the UI and in the demo script; no "verified" without a real verifier; no "diagnosis" from photos.
* **Privacy by default.** Phone numbers stay consent-gated and masked; photos are re-encoded/EXIF-stripped; analytics only aggregated with small-cell suppression; retention per the USSD plan's proposals (still awaiting approval).
* **Offline-first preserved.** Verification lookups and triage rules must degrade gracefully offline (cache last-known cards; queue escalations).
* **Milestone hygiene.** None of this changes M3; no endpoint beyond health/CSRF is implemented in PHP before its milestone.

## 5. Proposed roadmap placement (for approval)
| Milestone | Content | Depends on |
|---|---|---|
| M3 *(in progress)* | PHP foundation | M2 |
| M4 | Auth + audit gaps (separation of duties, new roles, audit actions, request ids) — **superseded:** M4 is plain authentication/sessions/audit/RBAC mechanism only (`docs/M4_READINESS.md`); the separation-of-duties and new-role items move to M12 | M3 |
| M5 | Content read services (+ verified-card data layer if approved) | M4 |
| M6 | Marketplace/sync parity (+ inquiry idempotency, listing codes) | M5 |
| **M12 (new)** | Verified Advice Cards + marketplace verification codes/levels | M5/M6 |
| **M13 (new)** | Guided Photo Triage | M6, M7 uploads |
| M11 | USSD (now including advice-code and read-only marketplace lookup) | M3–M6, M12, aggregator approval |
| **M14 (new)** | Institutional analytics with privacy controls | M10, real data, legal review |
| Hackathon demo slice | Items 1–5 on the Node reference + React, flagged simulated; ported later | Your approval of this analysis |

## 6. Decisions requested
1. Approve the five enhancements (or reorder/replace — e.g. swap #5 for the analytics slice).
2. Authorise a **demo-only slice** of M11 (simulator, English, read-only, no telecom, no SMS, no accounts) — or defer.
3. Approve creating **M12/M13/M14** as roadmap items.
4. Confirm that the hackathon demo may be built on the Node reference + React first (PHP parity later through the harness), given PHP is at M3.
5. Provide the KPAA source document if it contains concepts not captured in the eight listed.
6. Confirm an audio policy: only human-recorded, native-speaker-reviewed audio may be badged "verified"; synthetic audio stays labelled "demonstration".

## 7. Risks
Scope creep into ML or real telecom/SMS before approvals; double implementation across Node and PHP; misleading "verified" badges (mitigated by defined levels and labels); public code scraping (rate limits, public-fields-only); photo privacy; small-cell re-identification in analytics; reviewer capacity for content/audio verification; time — items 1, 3, 4, 5 together exceed a short hackathon window unless the rule-based/simulated slices are kept deliberately small.
