/* One-time migration for old /ussd pages trapped behind a cached application shell.
 * Current clients acknowledge the probe, so active registration/forms are NOT reloaded.
 * Other website pages keep the existing user-approved update flow.
 * No storage is cleared and no account or draft data is read here.
 */
(() => {
  const PROBE = 'AGRICARE_USSD_CLIENT_PROBE';
  const ACK = 'AGRICARE_USSD_CLIENT_READY';
  const isHandset = (client) => {
    try { const url = new URL(client.url); return url.origin === self.location.origin && /^\/ussd\/?$/.test(url.pathname); }
    catch { return false; }
  };
  const aware = (client) => new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true; clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(answer);
    };
    const timer = setTimeout(() => finish(false), 2500);
    channel.port1.onmessage = (event) => { if (event.data?.type === ACK) finish(true); };
    try { client.postMessage({type: PROBE}, [channel.port2]); }
    catch { finish(true); } // a closed page needs no recovery
  });
  const legacyHandsets = async () => {
    const clients = (await self.clients.matchAll({type: 'window', includeUncontrolled: true})).filter(isHandset);
    const answers = await Promise.all(clients.map(async (client) => ({client, aware: await aware(client)})));
    return answers.filter((answer) => !answer.aware).map((answer) => answer.client);
  };
  self.addEventListener('install', (event) => {
    if (!self.registration.active) return; // first install activates normally
    event.waitUntil((async () => { if ((await legacyHandsets()).length) await self.skipWaiting(); })());
  });
  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      for (const client of await legacyHandsets()) {
        // Do not hold activation open waiting for a navigation whose requests may
        // themselves wait for this worker to finish activating (notably WebKit).
        try { void client.navigate(client.url).catch(() => undefined); } catch { /* closed tab */ }
      }
    })());
  });
})();
