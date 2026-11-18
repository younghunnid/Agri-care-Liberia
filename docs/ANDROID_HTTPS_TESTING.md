# Testing on Android over HTTPS (LAN, no public exposure)

**Why:** over `http://192.168.x.x` Chrome gives no secure context, so there is no service worker, no Cache Storage, no install, and no
offline opening ("This app cannot be installed"). Desktop-reproduced: `isSecureContext=false`, `caches`, `serviceWorker`, `storage.estimate`,
`crypto.randomUUID`, `navigator.locks`, `mediaDevices` all missing; IndexedDB still works (why guides saved but pictures failed).
Pictures are now stored in IndexedDB too, but install and opening offline still need HTTPS.

## 1. Start (Mac)
```
npm run build
scripts/make-dev-cert.sh 192.168.100.96        # your Mac's LAN IP; creates git-ignored .dev-certs/
NODE_ENV=production HOST=127.0.0.1 PORT=3000 DB_PATH=/tmp/agri-test.db npx tsx server.ts   # throwaway DB, loopback only
npm run dev:https                              # https://192.168.100.96:3443 (blocks /admin, /expert, /demo/reset)
```
Android URL: **https://192.168.100.96:3443**

## 2. Trust the CA on the phone (one-time)
1. Copy only `.dev-certs/ca.crt` to the phone by USB cable (`adb push .dev-certs/ca.crt /sdcard/Download/`). **Never copy `ca.key`.**
2. Settings > Security & privacy > More security & privacy > Encryption & credentials > Install a certificate > **CA certificate** > Install anyway > pick `ca.crt`.
   (Needs a screen lock. Menu names vary by Android version.)
3. Open the https URL in Chrome: no warning should appear. Never use "proceed anyway" or insecure-origin flags.
4. When finished: remove it (Settings > Encryption & credentials > User credentials) and `rm -rf .dev-certs`.
The CA is name-constrained to private IPs/localhost and expires in 90 days (verified: a cert for example.com is rejected).

## 3. Physical Android checklist (NOT yet done: needs a person with the phone)
- [ ] https URL opens with no warning; `/downloads` shows "Yes ... offline app engine running".
- [ ] Chrome offers Install app; installs; launches standalone.
- [ ] Download Starter Pack: 43/43 guides, 9/9 pictures, server guides; retry works if interrupted.
- [ ] Airplane mode, force-stop, reopen installed app: guides, pictures, search, assistant, audio work.
- [ ] Drafts (listing + question) created offline; after reconnect only items marked "send when online" sync.
- [ ] Text readable (16 px body), header one row, menu grouped, bottom tabs readable; 130% font size check.
- [ ] Camera photo compresses; microphone works for voice notes (needs https).

## 4. Desktop-verified vs not
Desktop Chrome (simulation): picture storage fix, retry of missing pictures, persistence after tab reopen, PWA manifest/icons/SW/install prompt
on localhost, proxy blocking (curl), 360/390 px layouts. **Not verified on any phone:** CA trust, install, offline launch, touch use.
