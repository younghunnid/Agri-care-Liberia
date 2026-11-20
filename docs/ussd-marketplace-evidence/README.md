# USSD marketplace extension — browser evidence

Captured 20 November 2026 using isolated Chrome profiles, temporary HTTPS and a disposable SQLite database. No development database, real user data or real telecom service was used.

- [Final mobile handset](phone-mobile.png): default safe build, 320 px, with the PWA notice in page flow rather than covering keys.
- [Interactive browser results](browser-results.json): 16 checkpoints and 320/360/375/412 px measurements on the configured protected synthetic demo build.

The subsequent default-build smoke check confirmed submissions remain disabled, no QR is shown without a configured public URL, poster navigation/printing works, the walkthrough includes QR setup, timeout/restart still works and the PWA notice does not overlap the keypad. QR SVG-path decoding and link destination equality are automated tests; no real public URL or physical-camera scan was available.

See [simulator documentation and setup](../PHASE2B_USSD_SIMULATOR.md) and [hackathon walkthrough](../PHASE3_HACKATHON_DEMO.md). Screenshots and measurements describe desktop browser emulation, not physical-device or screen-reader certification.

Additive preservation follow-up: [browser compatibility results](preservation-results.json) confirm the original named market submenu, full public snapshot online/offline, no-submit selling practice, retained Help shortcuts and guidance navigation. The untouched original Phase 2B baseline passed 14/14; the post-correction suite passed 15/15, including the added compatibility test.
