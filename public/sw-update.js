/*
 * Service-worker update helper (imported by the generated sw.js through workbox `importScripts`).
 *
 * Problem it solves: a phone that already holds an OLD version of the app keeps serving that old version (and its old page list) until the new service worker
 * is allowed to take over. A new route such as /ussd then shows the old "We could not find that page" screen. With this file a new version takes over by itself
 * (sw.js is built with skipWaiting + clientsClaim) and every open page of the OLD version is reloaded once, so the visitor lands on the current app.
 *
 * It does nothing on the very first install (there is no old version to replace), so a first visit never reloads. Drafts and downloads live in
 * IndexedDB / Cache Storage and survive the reload.
 */
let replacingAnOlderVersion = false;
self.addEventListener('install', () => {
  // At install time `registration.active` is the version being replaced (null on a first install).
  replacingAnOlderVersion = Boolean(self.registration && self.registration.active);
});
self.addEventListener('activate', (event) => {
  if (!replacingAnOlderVersion) return;
  // IMPORTANT: do not wait for the navigations themselves. A reload is answered by THIS worker, which only starts answering requests once `activate`
  // has finished: waiting for it here would deadlock. We only wait for claim + the list of pages, and start each reload without awaiting it.
  event.waitUntil(self.clients.claim().then(() => self.clients.matchAll({type: 'window', includeUncontrolled: true})).then((pages) => {
    pages.forEach((page) => {
      page.navigate(page.url).catch(() => {                               // reload the page in place (Safari 11.1+, Chrome)
        try { page.postMessage({type: 'AGRICARE_SW_UPDATED'}); } catch (e) { /* the page reloads at its next visit */ }
      });
    });
  }));
});
