# How a new version reaches phones that already have the app (service worker updates)

## What went wrong (QR code showed "We could not find that page")
The QR code points to `https://agricare.mpgmca.com/ussd`. That route first existed in commit `8cb5464`. A phone that had opened the site earlier holds an older **service worker** with an older copy of the whole app (including its list of pages). That worker answers EVERY page request from its own cache, so `/ussd` was answered by the old app, which does not know the route and shows its normal website layout with "We could not find that page". The newer version had been downloaded by the phone but sat in a **waiting** state: the app was built so that updates wait until the user taps "Update now" or every tab is closed. Nothing told a visitor who scanned a QR code to do that.

Reproduced with real builds in `scripts/sw-update-simulation.mts` (old `c7b80eb`, then `8cb5464`): a returning visitor opening `/ussd` gets exactly the old "not found" screen.

## The fix (this commit)
1. `vite.config.ts`: the worker is built with `skipWaiting: true` (a new version activates by itself) and `clientsClaim: true`, and imports `public/sw-update.js`.
2. `public/sw-update.js`: when a new version replaces an older one, it takes control and **reloads every open page of the old version once** (`WindowClient.navigate`, supported by Safari 11.1+ and Chrome). On a first install it does nothing, so new visitors are never reloaded. It starts the reloads without waiting for them (a reload is answered by this same worker, which only answers after activation: waiting would deadlock; this was found and fixed during the simulation). If the browser refuses to navigate, the page gets a message and reloads itself (`src/lib/pwaUpdate.ts`, at most once per 20 seconds).
3. `src/lib/pwaUpdate.ts`: the app now asks for a new version right after it starts, every hour, and whenever the app returns to the foreground (at most every 5 minutes). Safari only re-checks occasionally by itself.
4. `/ussd` is never excluded from the worker's app fallback, and the server already answers unknown non-API paths with the app.

## What this does and does not cover
- **Covered:** every version from this commit onwards updates by itself; visitors with `8cb5464` or older receive it the next time their phone checks for a new worker (opening the site online while the app is closed; Chrome checks at every visit, Safari may take up to a day on its own).
- **Not covered:** a phone whose OLD app never asks for an update will not see the fix until Safari's own check runs. To force it once on your iPhone: Settings > Safari > Advanced > Website Data > search "agricare" > delete (or Clear History and Website Data), then open the QR link again. After that, updates are automatic.
- **Trade-off:** pages open at the moment of an update are reloaded. Drafts, downloaded guides and the offline queue live in IndexedDB / Cache Storage and are kept; text typed into a form that was not saved is lost. Updates are rare and usually happen right after opening the app.

## Verification
- `npm run test:sw-update` (unit tests of the helper and the build settings).
- `npm run test:sw-update-sim -- <oldCommit> <midCommit>` (after `npm run build`): real service worker in Chromium, old to mid to fixed, second tab, old to fixed directly, brand-new visitor never reloaded, refresh and direct visits of `/ussd` and `/ussd/`, Back to website.
- Not done: iPhone Safari / WebKit (the WebKit build found on this Mac does not match the installed Playwright and would not start; downloading another was not authorized) and a physical iPhone.
