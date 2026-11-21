# Testing on your iPhone (Safari)

Automated tests cannot prove that audio, touch or the installed app behave on a real iPhone. Do these checks yourself and note what happens. Needs iOS 16 or newer; use Safari (other iPhone browsers use the same engine).

## Where to open the app
**Recommended: after deployment.** Open `https://agricare.mpgmca.com` (a real certificate; the service worker, install and offline mode need HTTPS).

**Before deployment (your Mac and iPhone on the same Wi-Fi):** `docs/ANDROID_HTTPS_TESTING.md` explains the throw-away HTTPS proxy (`scripts/make-dev-cert.sh <Mac LAN IP>`, `npm run dev:https`, a disposable database on loopback). On the iPhone: AirDrop only `.dev-certs/ca.crt` (never `ca.key`), open it, Settings > Profile Downloaded > Install, then Settings > General > About > Certificate Trust Settings > switch the certificate **on**. Remove the profile and delete `.dev-certs` afterwards. Do not enable any insecure-origin setting.

## If the QR code shows the normal website or "We could not find that page"
An older cached app may lack the route (see `docs/PWA_UPDATES.md`). Reconnect and allow an update check. Save work before applying an update or closing old tabs. Do not clear website data first: that removes offline drafts, downloaded content and pending synchronization work. A physical-device check is still required; a stale cache is not proof of every possible iPhone failure.

## The checks (tick each; write down anything odd)
1. **Voice test button.** Open `/ussd-demo`, tap **Test voice on this device**. Expected: the line "speech is available (N voices listed)" and you hear the sentence. If silent: turn the ring/silent switch to ring, raise the volume, and try again (Safari plays speech only after a tap).
2. **Dial and voice.** Tap the keypad: `*440#` then Send. On the welcome screen choose **1 Enable screen reading**. Expected: the screen is read aloud and every later screen is read automatically. Try **Repeat screen**. Check: the voice says **"Press one for farmer"** style instructions; there is about **1.5 seconds after the heading** and **1 second between options**; `*440#` is said as "Star, four four zero, hash". Try the **Voice speed** buttons: **Slow (0.60)**, **Normal (0.75, default)**, **Fast (1.00)**; close Safari and reopen: your choice should be remembered. **Important for iPhone:** the first piece of each screen starts inside your tap, but the following pieces start after the pauses (a timer). If the voice stops after the first sentence on the iPhone, tell me: it means Safari blocks timed speech and the method must change.
3. **Mute by long-press.** While the voice is speaking, hold **0** for about 1.5 seconds: speech stops at once (also the part still waiting after a pause) and no extra digit is typed. A short tap on 0 still goes Back.
4. **Lock and unlock** the phone and switch apps while speech plays: speech must not get stuck; **Repeat screen** recovers it.
5. **Registration.** Pick a category and county, choose **2 Create account**. The secure form appears below the phone: type your name, phone number and a password with the iPhone keyboard (not the keypad), tick the privacy notice. Expected: the handset continues to the consent screens by itself; nothing says your number is verified. Agree. The main menu opens.
6. **Returning user.** Close Safari fully, reopen, dial again, choose **1 Sign in**: you are recognised and go straight to the menu (no second registration).
7. **Every menu.** Open options 1 to 8 (8 is Sell & Market), then Home each time. Voice should keep reading.
8. **Marketplace.** Option 3: sell a small harvest, confirm; later check it appears in the app's Marketplace. Ask a question on a listing. No phone number should be shown as verified.
9. **Offline.** Add to Home Screen (Share > Add to Home Screen), open it once online, then switch on Airplane mode and reopen: home, guides and the USSD handset must open; offline registration must say it was not sent.
10. **Layout.** Portrait and landscape, larger text (Settings > Display > Text Size): nothing cut off, keys easy to tap.
11. **Assisted recovery** (needs a second person acting as administrator): follow `docs/ADMIN_ASSISTED_RECOVERY.md`.

Report: iOS version, whether sound played, any step that failed, and a screenshot of any error.
