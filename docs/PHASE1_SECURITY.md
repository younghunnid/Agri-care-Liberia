# Phase 1 Security Architecture — Agriccare Liberia

## Implemented Controls

1. **Password Security:** Node `crypto.scryptSync` with 16-byte random salt and `timingSafeEqual` verification (Argon2id/bcrypt in PHP companion).
2. **Session Hardening:** HMAC-SHA256 signed session cookie (`agri_session`) with `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS/production.
3. **CSRF Protection:** All `POST`, `PATCH`, `PUT`, and `DELETE` requests under `/api/v1/*` require matching `agri_csrf` cookie and `X-CSRF-Token` header verified via constant-time comparison.
4. **Role-Based Access Control (RBAC):** Server-enforced middleware (`requireAuth`, `requireRole`) validates database role memberships and expert `approval_status === 'approved'` on every privileged request.
5. **Farmer Data Isolation:** `/farmer/questions/:id` and `/farmer/saved/:id` strictly verify `farmer_id === req.user.id`. Farmer phone numbers and emails are omitted from expert queue responses and never shown publicly.
6. **AI Safety & Key Protection:** `GEMINI_API_KEY` stays strictly server-side. User input is length-bounded (`<= 1500` chars), sanitized against prompt injection phrases, rate-limited per guest/user in `rate_limit_attempts`, and gracefully falls back to static approved guides when unconfigured.
7. **Admin Bootstrap:** No default admin password is ever hardcoded in source or UI; admins are provisioned via `scripts/bootstrap-admin.ts` or `php-backend/bin/bootstrap_admin.php`.
8. **Password Reset Safety:** Reset requests never echo reset tokens in HTTP responses; when SMS/email delivery is unconfigured, the limitation is clearly disclosed and development testing logs tokens only to server stdout in non-production.
