# Offline Guide Assistant (Stage 6)

Shown on `/advisor` only while the device is offline; the live Gemini advisor and its form are unchanged and used online.

* **Not AI.** `src/lib/offlineAdvisor.ts` is a deterministic local search (no network code, no model). Same question, same result.
* **Corpus:** guides saved on the device: the bundled library in IndexedDB (Crops, Pests & Diseases, Soil, Livestock, Fish, Knowledge Center)
  and server guides saved from the API.
* **Method:** normalise + stem the question, drop filler words; match exactly, via a short farming-synonym list (lower weight) or a spelling
  tolerance (edit distance 1-2, lower weight); rank with a TF-IDF style score with title/heading boosts; require a topical hit and at least
  half of the question's (rarity-weighted) words to be covered, otherwise answer "no reliable guidance". A one-word match is never "good".
* **Output:** up to 3 guides, each with up to 3 lines copied unchanged from the guide, the source title as a link, last-updated date,
  outdated warning (> 1 year), the guide's own safety notice, and the label "Offline Guide Information".
* **Never invented:** nothing is generated. Dose / medicine / vaccine, weather-forecast and live-price questions get a fixed warning.
* **Privacy:** questions are not sent anywhere. "Save question for an expert" only stores a Draft on the phone (never queued); the farmer
  must send it from Expert Support.
* English only; no offline speech recognition and no translation. Smart Listen is browser speech synthesis and may not work offline.
* Tests: `npm run test:offline`.
