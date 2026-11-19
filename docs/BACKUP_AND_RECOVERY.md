# Backup and recovery (SQLite on Hostinger)

The whole application state is one SQLite file (`DB_PATH`): accounts, sessions, expert requests, marketplace, photos and voice notes (stored inside the database), audit log. A deployment never contains it; a lost or corrupted file is a lost app. **Treat backups as personal data** (phone numbers, photos): private folder, not in `public_html`, never in git, never emailed.

## Requirements
* **Before every deployment** and **daily** while the demo or pilot is in use.
* Consistent while the app runs: `backup-db.js` uses SQLite `VACUUM INTO` (not a file copy, which can capture a half-written WAL database), verifies `PRAGMA integrity_check` on the copy, writes a `.sha256`, creates the folder `0700` and files `0600`, refuses a folder inside `public_html`, and keeps the newest N copies (default 14).
* At least one copy **off the host** (download to a computer you control; encrypt it if it leaves a private machine). A backup only on the same account is lost with the account.
* **Test a restore** at least once before relying on it (4.7 in the staging document) and again after any change to the process.
* Retention for synthetic demo data can be short; for real farmer data decide a policy with the data owner **before** collecting it.

## Backup
```
DB_PATH=/home/<account>/agri-data/agri.db node /home/<account>/<app>/backup-db.js --to /home/<account>/agri-backups --keep 14
```
Hostinger cron (hPanel > Advanced > Cron Jobs) can run the same command daily if the plan allows Node there (**unverified**; otherwise run it from SSH before each demo, or schedule it from your own computer over SSH). Note the path of `backup-db.js` changes with each deployment folder on Hostinger: use the `current` link if one is provided, or copy `backup-db.js` and `restore-db.js` once to a stable folder: they import only Node's own modules, so the single file runs anywhere with Node 22.13 or later.

## Restore
1. Stop the app in hPanel (so nothing writes).
2. `DB_PATH=… node restore-db.js --from /home/<account>/agri-backups/agri-YYYYMMDD-HHMMSSZ.db --dry-run` (verifies checksum and integrity, changes nothing).
3. Same command with `--confirm` instead of `--dry-run`. The current file is **moved aside** as `agri.db.before-restore-<time>` (never deleted) and stale `-wal`/`-shm` files are moved aside too.
4. Start the app; check `/api/v1/health` and sign in with a known account.
5. When satisfied, delete the `.before-restore-*` files yourself.

## Disaster cases
| Case | Action |
|---|---|
| Redeploy lost the database (wrong `DB_PATH`) | Fix `DB_PATH` to a persistent folder, restore the newest backup. |
| Database corrupt (`quickCheck` not `ok`) | Stop, restore the newest verified backup, accept loss since that backup. |
| Secret leak (`SESSION_SECRET`) | Change it (everyone is signed out), review the audit log, change `OTP_HMAC_SECRET` if codes might be exposed. |
| Accidental production start with demo accounts | The server refuses to start; remove the two demo accounts (or use a fresh database) rather than overriding. |
| Admin locked out | `recover-account.js` / `bootstrap-admin.js` from the operator tools (documented in `docs/SIMULATED_SMS_SECURITY.md`). |

## What is not covered
Point-in-time recovery between backups, automatic off-site copies, encryption at rest (depends on the host), and any guarantee about Hostinger's own snapshots.
