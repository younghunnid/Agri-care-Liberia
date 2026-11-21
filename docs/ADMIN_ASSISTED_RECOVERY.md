# Administrator-assisted password recovery (no SMS)

For a farmer, buyer or expert who forgot their password. A phone number alone is never proof of who someone is.

## Rules the software enforces
- Only a signed-in **administrator** can start it. Farmers, buyers, experts, visitors and the person themselves get 403/401.
- The administrator must tick that identity was checked **independently**, choose how (in person, call to a number the programme already knew, extension office, other), describe the check (10-300 characters, kept in the audit log) and **re-enter their own password**.
- Not allowed for: your own account, other administrators (use the server tools), demonstration accounts, suspended accounts.
- The code is 12 characters (for example `K7QD-3MWT-XH9P`), shown **once**, valid **30 minutes**, **single use**, stored only as a keyed hash, cancelled after **5 wrong guesses**, and replaced when a newer code is issued. The old password can never be shown or retrieved.
- The person enters their phone number, the code and a **new password** (10+ characters, same password rules) on **Sign-in help > Use your recovery code** (`/recover-account`). Success ends every session and trusted device, cancels other codes and signs nobody in.
- Audit actions: `password_recovery_started`, `password_recovery_reauth_failed`, `password_recovery_failed`, `password_recovery_locked`, `password_recovery_cancelled`, `password_recovery_completed` (no codes or passwords are ever written).
- API: `POST /api/v1/admin/users/:id/recovery`, `DELETE /api/v1/admin/users/:id/recovery`, `POST /api/v1/auth/recovery/redeem`.

## Procedure for the administrator
1. Establish who the person is **outside the website** (meet them, or call a number the programme already had on file; never only the number they typed at sign-up).
2. Admin console > Farmer & User Management > **Password recovery** next to the person. Choose the method, write what you checked, tick the confirmation, enter your password, **Create one-time code**.
3. Give the code to the person yourself (in person or on that call). Do not send it by message. Click "I have given the code. Hide it."
4. The person completes the form within 30 minutes. If it expires, issue a new code.
5. If you issued a code by mistake, open **Password recovery** again for that person to issue a new one (it cancels the old one), or call `DELETE` on the same API path.

SMS verification stays off for ordinary registration and sign-in. Phone numbers stay **Not verified**.
