# Saved weather and Ministry information (Stage 7)

* **Weather** has no live source in this prototype. The page shows bundled SAMPLE profiles and says so (content dated 2026-11-18, "not a
  forecast for today"). Nothing is fetched or cached for weather today, and no Refresh is possible. `lib/dataCache.ts` contains the tested
  path for a future provider: `saveWeatherSnapshot` stores what a provider returned with the exact retrieval time; the page then shows
  "Saved Information - Not Live", marks the forecast stale after 3 h and EXPIRED after 6 h (or after the provider's `validUntil`), and hides an
  expired forecast so it cannot be mistaken for today's weather.
* **Ministry dashboard:** the synthetic demonstration data is bundled and always labelled synthetic. The four live prototype counts from
  `GET /api/v1/prototype/management-summary` are saved after each successful request with the exact time, shown as "Saved Information - Not Live"
  when offline or after a failed refresh, and flagged stale after 24 h. A failed refresh never overwrites saved data. With nothing saved the cards
  show "-" and an explanation (no invented numbers).
* **Privacy:** `cacheSet` accepts only `ministry:summary` and `weather:<county>`; anything else throws. Only the public aggregate
  `demoAndExperimentalData` counts are saved (not `actualData`). Admin, expert, farmer, session and account data are never cached.
* The Ministry route has no sign-in in the existing prototype (there is no Ministry role); this stage did not change that.
