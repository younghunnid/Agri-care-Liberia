# H2 progress report: Expert Support and Agricultural Learning (Team 8 hackathon prototype)

Branch `feature/offline-first`, based on `04da526` (H1.1). Scope: **H2 only**. No change to `server/` (Node reference), `backend-php/`, database schemas, API contracts or the contract golden snapshot. No new dependencies. H3, H4 and M4 not started. SMTP, SMS, USSD, payments and live AI untouched.

## 1. What was built

### Phase 1: Ask an Expert (existing page improved, not rebuilt)
| Item | Result |
|---|---|
| Submit, track, read | Same page and same API. New "How asking an expert works" strip (3 steps) with labels **Questions: working** and **Expert replies: simulated**. |
| Status tracking | Each request shows a plain-language status and a 3-step tracker (Sent, With an expert, Answered) built from the three statuses the server already has (`Submitted` = "Waiting for an expert", `Assigned` = "An expert is looking at it", `Answered`). Text plus icons, not colour alone. No new status values. |
| "Your requests" vs samples | The list is split into **Your requests** (requests made from this phone) and **Sample requests (demonstration data)**, each labelled. |
| Simulated vs real | **Every reply is labelled "Simulated demo reply"** and carries the notice: "…typed in a demo dashboard. It is not verified advice from a real agricultural expert. Do not use it to decide on chemicals, doses or treatment." The expert dashboard "Current Reply" is labelled the same way. Nothing in the UI claims expert verification. |
| States | **Loading** ("Loading requests…"), **empty** (no requests yet; no requests from this phone yet), **error** (H1.1 banner with Try again), **offline** (banner: questions are saved on the phone and sent once when online; replies need internet). |
| Offline queue | Untouched. A unit test asserts the queue wiring is still in the page (`saveQuestionDraft`, `queueRecord`, `syncSoon`, `requesterKey`), and the browser run re-verified exactly-once sending (section 3). |

### Phase 2: Farming lessons and quizzes (`/learn`, `/learn/:id`)
* Five lessons, each about 5 minutes: **Cassava farming basics, Rice cultivation basics, Soil health, Safe pest prevention, Harvesting and storage**. Each has 3 to 4 short sections, a key message, **read-aloud** (existing `SpeakButton`) and a quiz.
* Quizzes: **4 questions (cassava, pest prevention, harvest) or 5 (rice, soil)**, multiple choice. Result screen shows the score ("3 out of 4 (75%)"), for every question "Correct" or "Not quite", the right answer, and an explanation. "Try the quiz again" and "Next lesson" buttons. Answers use real radio groups in fieldsets with legends. All questions must be answered before the score is shown.
* **Completion rule:** a lesson is *Completed* when the best quiz score is at least 60 percent (3 of 5 or 3 of 4). States: Not started, In progress (read or attempted), Completed. A worse later attempt never lowers the best score.
* **Progress is saved locally** in IndexedDB `kv` (`h2.lessons.progress`): read mark, attempts, best and last score, last answers. The hub shows "x of 5 lessons completed" and a progress bar. "Clear my lesson progress" asks for confirmation first (Cancel is focused).
* **Offline:** lessons and quizzes are bundled in the app, so the section works offline; only the saved progress needs IndexedDB. Stored data is sanitised on read (unknown lessons dropped, numbers clamped, totals taken from the lesson).
* **Honesty:** all lessons are labelled **Team 8 draft** with "No agricultural expert has reviewed this lesson yet", on the hub and on each lesson. The data model only allows `reviewed` together with a reviewer name and date, and none is set. Content is general education, taken from the app's own Crops Library and Knowledge Center facts (checked by a test against the library text). **No pesticide or chemical names, doses, amounts or treatment claims.** The pest lesson and others tell the learner to ask an extension officer before any chemical.
* Home "Learn Farming" group now links to `/learn` (working + draft). Demo step 10 opens the cassava lesson and quiz.

### Phase 3: Accessibility polish
* The three items under 4.5:1 contrast are fixed (the audit finds two on Home and one on the Expert page, not three on Home): the "Hackathon Prototype Showcase" line, the "Offline Library & Low-Bandwidth Support" line (both now `#0F5C2A`), and the "Reply from … (Simulated)" text on the Expert page (replaced by the labelled reply box). The "Your own data (private)" badge on Downloads (5 instances) is also fixed.
* All text under 12 px on Home and Downloads was raised to 12 px (`text-[9|10|11px]` replaced by `text-xs`); one low-opacity timestamp raised to a readable shade.
* **The flagged input on the Expert page was the visible "voice note summary" text field, not a hidden input** (my H1.1 note described it wrongly). It now has an accessible name. The hidden photo input has an explicit `aria-label` as well.
* Layout checked at 320, 375 and 768 px (section 3).

## 2. Files
New: `src/data/lessons.ts`, `src/lib/lessonProgress.ts`, `src/lib/expertStatus.ts`, `src/components/{LessonStateBadge,RequestProgress}.tsx`, `src/pages/public/{LearnPage,LessonPage}.tsx`, `tests/h2.test.ts`. Changed: `ExpertSupportPage.tsx`, `HomePage.tsx`, `OfflineDownloadsPage.tsx`, `App.tsx` (2 routes), `navGroups.ts`, `CassavaDemoPage.tsx` (steps 8 to 10), `tests/h1.test.ts` (route matcher now understands `:param` routes), `package.json` (`test:h2`).

## 3. Test results (this session)
| Check | Result |
|---|---|
| `npm run test:h2` (new) | **16 / 16**: lesson set and Team 8 draft status; 3 to 5 well-formed questions each; simple-English length limits; safety lint (no chemical names, doses, quantities, mixing instructions, cure claims); facts match the Crops Library; scoring incl. unanswered/invalid answers and the 60 percent boundary; progress save/reload with a fresh reader, best score kept, read time kept, reset, unknown ids, corrupt/hostile stored data; expert status wording; replies labelled simulated; offline-queue wiring still present; navigation and demo links |
| `npm run test:h1` | 18 / 18 |
| `tsc --noEmit` and `npm run build` | pass |
| `test:api` / `test:harness` / `test:offline` | 31 / 4 / 22+6+3 pass |
| `test:contract` | 5 / 5 consecutive passes (the intermittent `latestMigration` issue is unchanged and still documented below) |
| Real browser, lessons and expert states (headless Chrome, 375 px, real offline emulation + service worker, production build, isolated backend on a temp SQLite file) | **39 / 39** on the final run. One earlier final run reported a single failure on the very first check (Home page, immediately after launching a fresh browser) and passed on rerun; I treat it as a first-load timing race in my script but did not prove that. |
| Real browser, expert workflow regression (offline question, reconnect, exactly-once send, expert reply, farmer sees reply) | **31 / 31**; server count +1 exactly once |
| Mobile and accessibility audit, 7 pages × 320/375/768 px (21 combinations) | **0 findings**: no horizontal overflow, no touch target under 44 px (checkbox/radio/file inputs count by their ≥ 44 px label), no unlabelled controls, no text under 12 px, no WCAG contrast failures |

Browser run details:
* **Lessons online:** hub shows 5 lessons, 0 of 5; read mark saved; wrong attempt scores 0 of 4 with explanations; retry with 3 of 4 completes the lesson; a worse third attempt keeps best score 3 (stored record: 3 attempts, best 3, last 0); after reload the hub shows 1 of 5 completed and the lesson page remembers the read mark and best score.
* **Lessons offline:** with the network off, hub and progress load, the rice lesson opens, a 3 of 5 (60%) quiz passes, the score is saved, and after an offline reload the hub shows 2 of 5; back online nothing changed.
* **Keyboard:** Space selects a quiz answer, radios show a visible focus indicator, fieldsets have legends; the clear-progress dialog opens with "Keep it" focused; "Keep it" leaves progress, "Yes, clear it" empties it. Unknown lesson ids show a friendly page.
* **Expert page:** how-it-works strip, "Your requests" empty state, labelled sample requests, simulated label and notice on every reply, 3-step tracker on every card, loading state visible while the list is slow, offline banner appears and disappears with the connection.

## 4. Limitations and what could not be tested
1. **Not tested on real devices:** physical Android/iOS phones, TalkBack/VoiceOver, camera, microphone, audible text-to-speech (the Listen buttons call the same component verified in H1.1; sound was not heard). Real slow networks and large-text/zoom settings were not tested.
2. The browser runs use desktop Chrome in mobile emulation. The scripts and the scratch server are in the session folder, not in the repository.
3. **Lesson content is Team 8 draft and has not been reviewed by an agronomist.** Quiz answers and explanations are the team's reading of the app's library, not expert-verified. The simulated expert reply is typed by a person in a demo dashboard.
4. Lesson progress is not counted on the Offline Downloads page (only saved crop advice and calculations are). It is local-only and not synced anywhere.
5. Only English; no audio lessons, no illustrations for the lessons.
6. Statuses are the three the server has; there is no "Resolved" state (it would need a backend change).
7. **Contract test, unchanged as instructed:** `GET /api/v1/health` field `latestMigration` can differ from the golden value `001_initial_schema.sql` when the Node migrations cross a one-second boundary (`ORDER BY applied_at DESC` with no tie-breaker). It was neither normalised nor fixed, and the golden snapshot and Node backend were not touched. Expect an occasional spurious failure, roughly 1 run in 40. Decision on a fix is still open.
8. Existing pages not in H2 scope were not re-audited beyond the seven pages listed.

## 5. Updated demonstration walkthrough
`/demo/cassava` now reads: 1 open the app; 2 select cassava (Bong); 3 report yellowing leaves; 4 read possible causes and first steps (*draft, not a diagnosis*); 5 save offline; 6 go offline and open the saved advice; 7 draft the question offline (pre-filled); 8 reconnect, the question is sent once, **Your requests shows "Waiting for an expert"**; 9 an expert replies in the simulated dashboard, **the status becomes Answered and the reply is labelled "Simulated demo reply"**; 10 **open the cassava lesson and take the 4-question quiz (score, explanations, progress saved offline)**; 11 open the calculator (L$5,000 costs, L$8,000 sales, L$3,000 profit). Closing line: Working: crop problems, offline saving, offline questions and sending, lessons and quizzes, calculator. Simulated: expert replies, weather, sample market listings. Draft: all agricultural advice and lessons. Future: other crops, emergency guidance, community, directory, local languages, SMS and USSD.
