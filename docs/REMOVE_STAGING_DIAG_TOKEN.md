# Removing STAGING_DIAG_TOKEN from Hostinger (instructions only; not done)

`STAGING_DIAG_TOKEN` switches on `/api/v1/__staging/*` diagnostics (they answer 401 without the token). They were for the first deployment checks and should not stay on a public site.

1. Open hPanel, then the website `agricare.mpgmca.com`, then the Node.js Web App settings (names can differ slightly), then **Environment variables**.
2. **Delete** the `STAGING_DIAG_TOKEN` entry (do not just empty it). Change nothing else (keep `START_SERVER`, `NODE_ENV`, `APP_ENV`, secrets, `DB_PATH`, `VITE_*`).
3. Save, then **Redeploy / Restart** the app (the variable is read at start-up). A redeploy also rebuilds, so take a database backup first (`docs/BACKUP_RESTORE.md`).
4. Verify: `curl -i https://agricare.mpgmca.com/api/v1/__staging/` now returns **404** with `{"error":{"code":"NOT_FOUND",...}}` (before it was 401). Open the home page and sign in to confirm the app is up.
5. If the old token was ever pasted into chat, tickets or notes, treat it as burned: do not reuse it.

Rollback: re-adding the variable (32+ random characters) and restarting turns the diagnostics back on.
