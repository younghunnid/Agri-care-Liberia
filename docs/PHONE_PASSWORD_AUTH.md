# Phone number + password authentication (no SMS)

Default behaviour since this change. `AUTH_REQUIRE_SMS` is OFF unless set to `1` (which needs an SMS provider; none exists yet, so it is refused with `SMS_PROVIDER=none`).

## What changed
- **Registration:** any properly formatted Liberian number (077/088/055 and so on, with or without +231). The number is stored **unverified** (`phone_verified_at` NULL). Nothing is sent and the site never says a number is verified.
- **Login:** phone number (or e-mail) **and** password. A phone number alone never signs anyone in. No code on a new device, after logout, or on repeat login. Wrong password and unknown number give the same 401.
- **Unchanged protections:** scrypt hashing, HMAC session cookie (HttpOnly, Secure, SameSite=Lax), CSRF double-submit, login throttling (8 attempts per 15 minutes per address and account, 30 failures per address), registration limits, role checks, password policy, audit log.
- **Duplicates / takeover:** one account per number in every spelling. The 72-hour release of an unverified number is **off**: a number is never taken from, or moved between, accounts automatically.
- **Recovery:** administrator-assisted recovery with one-time codes is described in `docs/ADMIN_ASSISTED_RECOVERY.md`. A password cannot be reset by entering a phone number. `POST /auth/forgot-password` answers every identifier identically (HTTP 200, `recovery: "assisted"`, no code, no account lookup) and the page explains that verified assistance from the team is needed. Reset, verify-device, resend-code, phone-claim and phone-change/confirm routes answer `409 SMS_NOT_USED`.
- **Phone changes** are not available (they proved ownership by SMS). The operator script `scripts/recover-account.ts` still moves a number after an out-of-band identity check.
- **Environment endpoint** adds `phoneVerification: "none" | "sms"`; `simulatedSms` is true only when SMS codes are required with the simulated provider.

## Privacy and consent
Registration requires accepting the privacy notice (`/privacy`, version `privacy-v1`); acceptance is stored in `privacy_consents` (migration 012). The notice is a draft for legal review.

## Known limitations (not fixed)
- Anyone can register someone else's number first, and the real owner cannot prove ownership until SMS exists. The account does not expose the other person's data, but the number is occupied. The only remedy is operator action.
- Recovery depends on an administrator who has really checked the person's identity; the software cannot do that check.
- Possession of the password is the only factor. Existing trusted-device records are ignored in this mode.
- `APP_ENV=demo` still limits numbers to +23177000xxxx. Real numbers need the demo settings removed (Hostinger change, not done).
