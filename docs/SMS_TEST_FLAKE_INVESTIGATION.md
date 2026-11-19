# Investigation: intermittent `test:sms` failures

## Observation (from the earlier teammate-dashboard task)
* One run of `npm run test:sms` reported **37 / 39** (2 failures, **names not captured**), started right after browser-regression work and as part of a longer sequential script. The same suite passed **39 / 39** when re-run alone, and in a second full sequence. Cause was left unidentified. The conclusion "machine load" was only a guess.

## What was checked, and what it showed
| Hypothesis | Evidence gathered | Result |
|---|---|---|
| Slow machine / CPU load makes the suite time out | Ran the full suite **three times with 10 busy-loop processes on 8 cores** (log in the session scratch area) | **39 / 39 all three times.** Load alone did not reproduce it. |
| The child servers take too long to start | Measured start-up to first health response, idle and under 8 busy loops (4 runs each) | `tsx server.ts` 1.8 to 2.5 s; built `server.js` 1.1 to 1.5 s. The tests allow 20 s (now 30 s). Start-up time is **not** the cause. |
| Parallel suites collide on ports, databases or temp folders | Read the harness: in-process backend listens on port 0 (random), unique `mkdtemp` folder and secrets per run; child-server tests pick a free port | No fixed port or shared path. No collision possible between suites **except** the free-port step below. |
| Which tests could fail "alone" without the rest | Only two tests start real child servers: **16b** (production-mode server) and **26b** (demo-environment server). Every other test is in-process on the harness backend. | A failure of exactly two tests fits these two, **but this is an inference, not an observation** (the failing names were not recorded). |
| Free-port race (time-of-check/time-of-use) in those two tests | `freePort()` opens a listener on port 0, reads the port, **closes it**, then the child binds it. Between close and bind, anything on the machine (browser, other tests, system) can take the port. The old readiness check then either saw a refused connection until it gave up, or got an answer from the **wrong process**. | **A real, plausible mechanism; not proven to be what happened.** Rare on a quiet machine, more likely when many sockets open (browser sessions, parallel work). |
| Order-dependent state (rate limits, time windows) | Reviewed what 16b/26b use: fresh disposable databases, fresh secrets, synthetic numbers | No shared state found. |

## Separate, deterministic failure found in this session (not the flake)
After the deployment changes, 16b and 26b failed **every** time because they asserted the old behaviour of unknown API paths (SPA fallback, `200 HTML`). The server now returns a JSON 404 for unknown `/api/*`. The two assertions were updated to the new documented contract (`404` and no inbox content) and still prove the inbox does not exist in production or without `SIMULATED_INBOX`. This was **my change**, found immediately, and is unrelated to the intermittent failure. The contract golden snapshot was not touched.

## Mitigations applied (diagnostic and hardening, not a proven fix)
In `tests/sms-auth.test.ts` (`bootServer`) and `tests/deploy.test.ts`:
1. If the child exits with `EADDRINUSE`, retry on a new port (up to 4 attempts).
2. Each readiness probe has a 3 s abort timeout (a hung connection can no longer stall the loop).
3. The child's captured output is kept and returned (`out()`), so any future failure shows the server's own message instead of only `ECONNREFUSED`.

## Status
* **Not reproduced** in: 3 full runs under heavy CPU load, plus the deployment-phase regression runs (results in the final report).
* **Root cause not proven.** Leading hypothesis: free-port race in the two child-server tests. If it recurs, the captured output now distinguishes it: `EADDRINUSE` in the child output confirms the hypothesis; any other message points elsewhere.
* Recommendation: if it happens again, keep the full TAP output (`npx tsx --test tests/sms-auth.test.ts > run.log`) so the failing test names and messages are recorded.
