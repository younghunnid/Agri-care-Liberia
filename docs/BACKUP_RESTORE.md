# SQLite backup and restore (Hostinger)

The database is one SQLite file outside the application folder (`DB_PATH`, for example `/home/<user>/agricare-data/agri.db`). Tools are built by `npm run build` as `backup-db.js` and `restore-db.js` next to `server.js`. Tested by `npm run test:backup-restore` and `npm run test:deploy` (disposable databases).

## Back up (safe while the app runs)
```
cd <application folder>
DB_PATH=/home/<user>/agricare-data/agri.db node backup-db.js --to /home/<user>/agricare-backups --keep 14
```
Uses `VACUUM INTO` (a consistent copy, not a file copy of a live WAL database), checks `PRAGMA integrity_check`, writes `agri-YYYYMMDD-HHMMSSZ.db` plus a `.sha256` file, keeps the newest 14. Folder is created `0700`, files `0600`. Never put backups in `public_html`. They contain phone numbers, photos and consent records: treat them as private.

Run it **before every deployment** and on a schedule (Hostinger hPanel > Advanced > Cron Jobs, for example daily at 02:00 with the command above). Copy a recent backup off the server now and then.

## Restore
1. Stop the Node.js app in hPanel.
2. Dry run (changes nothing): `DB_PATH=... node restore-db.js --from /home/<user>/agricare-backups/<file>.db --dry-run`
3. Restore: the same command with `--confirm` instead of `--dry-run`. The current database is **moved aside** as `agri.db.before-restore-<time>` (never deleted); a damaged backup (checksum or integrity) is refused.
4. Start the app and check: sign in, `/api/v1/environment`, a farmer's saved items.

## Rollback of a deployment
Code: revert the commit and push. Data: a deployment does not need a restore unless a migration misbehaved; migrations only add. If you must undo the privacy/recovery migration, restore the pre-deployment backup (preferred) rather than running the down file.
