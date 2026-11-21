# Service-worker updates after local integration

The generated `/sw.js` has one registration and imports one helper, `public/sw-update.js`. It precaches the application, downloaded advice resources and the standalone `/ussd` chunk. The shell, worker and helper use HTTP `no-store`; hashed assets stay immutable. Offline cache and IndexedDB are not cleared.

The application checks for new versions on entry, hourly, and when returning to the foreground after five minutes. Detection does not automatically reload a current page. Current pages acknowledge the helper's probe; updates wait for the existing Update now control. If another tab activates an update, current pages show the update notice and preserve unsaved inputs and active enrollment.

A legacy `/ussd` page that cannot acknowledge the probe is targeted for recovery: the replacement activates and navigates that handset only. Normal website pages are not explicitly navigated. Activation never awaits a navigation that may itself wait for activation. First installs do not navigate a new visitor. The earlier blanket `skipWaiting: true`, all-client navigation and `AGRICARE_SW_UPDATED` reload fallback have been removed.

## Limits of migrating an old, non-cooperating bundle

A worker cannot inspect a page's DOM or infer whether a legacy `/ussd` page contains unsaved fields. Such a page may reload once; an unresponsive current page may also miss the timed acknowledgement. Old application code can contain its own reload-on-controller-change handler, which cannot be patched retroactively. Current cooperating forms and handset sessions are protected and browser-tested; unsaved legacy input cannot be guaranteed. Offline browsers must reconnect before downloading the fix.

Do not clear Safari website data as the first troubleshooting step: this deletes saved offline drafts and pending synchronization work. Reconnect, allow an update check, and use the update control after saving work. If an older missing-route page persists, finish/save work in all tabs and close them before reopening the QR destination. Any last-resort site-data reset needs an explicit explanation of the data it removes.

## Regression checks

- `npm run test:sw-update`: helper/build policy and activation deadlock coverage; `tests/ussd-update-bridge.test.ts`: first install, targeted recovery and aware-client protection.
- `npm run test:sw-update-sim -- c7b80eb 8cb5464`: historical production builds reproduce the missing route, then verify targeted recovery, bounded reloads, refresh, deep links and fresh profiles.
- `node --import tsx tests/ussd-recovery-browser.ts`: current form input and enrollment preservation during cross-tab activation, browser storage preservation, mobile layouts, voice/menu behavior and offline reopening.
- Existing real-mode, offline and standalone browser suites verify credentials, registry, marketplace and reconnect synchronization on disposable synthetic databases.

Browser automation is not a real iPhone test. The available legacy WebKit 17.4 runner supports online checks; its offline emulation also fails on an independent minimal service-worker page. Current Safari, audible speech and physical-iPhone offline behavior still require device verification.
