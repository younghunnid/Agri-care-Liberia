# Public management-summary: privacy concern (documented, not changed)

Status: **FIXED locally** (server/publicCounts.ts, server/routes/prototype.ts), not yet deployed.

Fix: anonymous visitors and ordinary signed-in users now receive approximate counters (fewer than 3 shown as 0, larger values rounded to the nearest 5, and the shown value moves only after the real count drifted by at least INSIGHTS_MIN_CHANGE = 3). The response keeps its shape and adds `precision: "approximate"` and a `note`. Only a signed-in administrator receives exact numbers (`precision: "exact"`). The four public pages keep working with the approximate values. Tests: tests/api.test.ts (9 and 9b); contract golden updated for this one request. Not changed: the PHP backend copy of this endpoint (inactive, hash-checked by the PHP parity suite). The original description below is kept for the record.

## What it is
`GET /api/v1/prototype/management-summary` (`server/routes/prototype.ts`, around line 1003) has no authentication, no rate limit and no suppression. It returns exact counters:

- `actualData`: registeredFarmers, formalAdvisoryQuestions, publishedCropGuides
- `demoAndExperimentalData`: marketplaceListings, marketplaceInquiries, localLanguageRecordings, simulatedExpertRequests

It feeds four public pages: `/management` (PrototypeManagementPage), MinistryAnalyticsPage, MinistryDashboardPage and OfflineDownloadsPage.

## Why it matters
- The Ministry aggregates (`/api/v1/insights/aggregates`) apply a minimum of 3 records and 3 contributors, rounding and a change threshold, so one person's record cannot be inferred. This endpoint bypasses all of that.
- Exact counts that change by one reveal single registrations and single inquiries to anyone who polls the endpoint. With real farmers this is a re-identification and "who just signed up" signal.
- It contains no names, phone numbers or other personal data. The risk is exact public counters, not a data leak today. With synthetic demo data only, the risk is low.

## Recommended fix (needs approval, not done)
1. Require the admin or Ministry role, or return the same suppressed, rounded view as `/insights/aggregates`.
2. Change the four public pages to use the aggregates endpoint or to show the role-gated numbers only to signed-in staff.
3. Add a regression test: an anonymous request gets 401/403 or only suppressed values.
4. Do this before real-user registration is enabled.

## Confirmation that real-user registration is not enabled
Checked on this date, read-only:
- Live `GET /api/v1/environment` returns `demoEnvironment: true`, `simulatedSms: true`, `syntheticAccountsOnly: true`. The live site is in demo mode, and the server rejects any phone number outside `+23177000xxxx`.
- No environment variable, code default or deploy script was changed by the branding work. Commit d6d5a70 is local only. GitHub `main` is still 8ee5084.
- In code, real-user mode needs `APP_ENV=demo` removed and an SMS provider. The only providers are `none` and `simulated`, so nobody can enable real registration by accident with a single setting. A test of that mode on a throw-away server showed that farmers would be locked out after logging out. See the readiness report in this session.
- Nothing was pushed or deployed. Hostinger settings were not touched.
