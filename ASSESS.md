# Phase 2 — ASSESS: Get24 Legacy Modernization Assessment

**Project:** Legacy Code Whisperer  
**Team:** Codexmatrix  
**Date:** 2026-09-26  
**Workflow stage:** Understand → Protect → **Assess** → Plan → Execute → Verify → Rollback → Recover → Report  
**Baseline:** `baseline/import-get24` @ `legacy-baseline` (commit `96c17e1`)  
**Behavioral safety net:** 18/18 tests passing — not touched by this assessment.

---

## Executive Summary

Get24 is a Node.js real-time multiplayer math game originally written in 2013 for Node 0.8.x. Its declared runtime is **Node.js 0.8.x** (now end-of-life for over a decade) and it depends on **Express 3.0.x** and **Socket.IO 0.9.x**, both of which are architecturally incompatible with every current Node.js LTS release.

The application is currently *functional only under Node.js 6.17.1* (proven by the Protect phase baseline). It **cannot boot under any current Node.js runtime** because:

1. Express 3's `app.configure()` API was removed in Express 4.
2. Socket.IO 0.9's `io.configure()` and `io.set()` APIs were removed in Socket.IO 1.x.
3. `node-uuid` was deprecated and its package was renamed to `uuid` in 2014.
4. `node-expression-eval` wraps an arithmetic evaluator that has never been published in a verifiable audit trail.
5. The client-side canvas library is KineticJS 4.6.0 — abandoned and superseded by Konva.js in 2015.

These are not surface-level API call changes. Every one of the four `package.json` dependencies requires either a major-version upgrade (with breaking API changes in the application source) or a full replacement. This is the definition of a legacy codebase.

---

## Findings Table

| ID | Finding | Evidence / File | Current Behavior | Modernization Opportunity | Risk | Blast Radius |
|---|---|---|---|---|---|---|
| F-01 | Node.js engine declared as `0.8.x` | `package.json` line 20 | Only confirmed functional on Node 6.17.1 | Target Node 20 LTS | High — every async runtime assumption may differ | Entire server |
| F-02 | `app.configure()` removed in Express 4 | `server/index.js` lines 30–40 | Works on Express 3.0.6 only | Replace with conditional or plain middleware chains | High — server will not boot on Express 4+ | `server/index.js` |
| F-03 | `express.favicon()` removed in Express 4 | `server/index.js` line 32 | Serves a default favicon silently | Use `serve-favicon` npm package or serve from `public/` | Medium | `server/index.js` |
| F-04 | `express.logger()` removed in Express 4 | `server/index.js` line 33 | Dev request logging | Use `morgan` npm package | Low | `server/index.js` |
| F-05 | `express.errorHandler()` removed in Express 4 | `server/index.js` line 39 | Dev error pages | Use `errorhandler` npm package | Low | `server/index.js` |
| F-06 | `io.configure()` removed in Socket.IO 1.x | `server/index.js` lines 50–56 | Origin whitelist and transport config | Replace with `io` constructor options and `cors` middleware | High — server will throw on Socket.IO ≥1 | `server/index.js` |
| F-07 | `io.set('origins', …)` removed in Socket.IO 1.x | `server/index.js` lines 51, 55 | Hard-coded Nodejitsu production URL (`http://get24.jit.su:80`) whitelist | Replace with CORS options on the Socket.IO constructor | High — CORS handling entirely absent on modern stack | `server/index.js` |
| F-08 | `socket.disconnect()` API changed in Socket.IO 1.x | `server/index.js` line 97 | Disconnects over-capacity clients | Use `socket.disconnect(true)` in Socket.IO 4.x | Low | `server/index.js` |
| F-09 | `socket.io@0.9.x` end-of-life | `package.json` line 11 | Works on Node 6 only | Upgrade to `socket.io@4.x` | High — all server emit/on APIs remain but `io.configure`/`io.set` do not | `server/index.js`, `public/js/SocketController.js` |
| F-10 | `express@3.0.x` end-of-life | `package.json` line 12 | Works on Node 6 only | Upgrade to `express@4.x` | High — `app.configure()` and all built-in middleware are removed | `server/index.js` |
| F-11 | `node-uuid@1.4.x` deprecated | `package.json` line 13 | Generates UUID v4 room IDs | Replace with `uuid@9.x` (same API: `uuidv4()` → `v4()` from `uuid`) | Low — drop-in replacement | `server/game/index.js` line 13 |
| F-12 | `node-expression-eval@0.1.x` unmaintained | `package.json` line 14 | Evaluates player arithmetic expressions | Replace with `expr-eval@2.x` (maintained fork of same codebase) | Medium — expression evaluation is the core game mechanic | `server/game/index.js` lines 12, 65 |
| F-13 | Server start is a module side-effect | `index.js` line 1, `server/index.js` lines 43–48 | `require('./server')` starts the HTTP server immediately | Export a `start()` function; separate module loading from binding | Medium — blocking testability; modernized tests need this | `server/index.js`, `index.js` |
| F-14 | Global mutable `gameList` and `numConnections` | `server/index.js` lines 25–26 | Process-level game state; cannot reset between requests | Encapsulate in a `GameManager` class or pass as closure | Medium — test isolation and horizontal scale | `server/index.js` |
| F-15 | `setInterval` timer not cleared on process exit | `server/game/timer.js` lines 77–79 | Timer loop keeps the process alive | `clearInterval` on SIGINT / server close | Low — cosmetic in dev, harmful in test teardown | `server/game/timer.js` |
| F-16 | `helpDialog.toggle()` references `layer` (undefined) | `public/js/StageController.js` line 98 | `layer` is not defined in scope; toggling the help dialog throws a ReferenceError at runtime | Replace `layer` with `activeLayer` | Low — UI-only bug; server is unaffected | `public/js/StageController.js` line 98 |
| F-17 | `blink \|\| true` forces blink unconditionally | `public/js/StageController.js` line 281 | The `blink` parameter to `showEvaluatedText` is always ignored; blink is always on | Change `blink \|\| true` to `blink !== false` (or remove default) | Low — UI-only; server untouched | `public/js/StageController.js` line 281 |
| F-18 | `validate()` receives raw socket data without type check | `server/game/index.js` lines 60–61 | If `data.expression` is missing or not a string, `temp.search()` on line 94 throws a TypeError | Guard: `if (typeof data.expression !== 'string') return;` | Low — no test currently sends a non-string, but socket data is untrusted | `server/game/index.js` lines 60–61, 89 |
| F-19 | `README.md` and `server/config.json` disagree on default port | `README.md` line 73 (3001), `server/config.json` line 3 (4000) | `PORT` env var wins at runtime so both are irrelevant in test; misleading in documentation | Align README to match the config; note `PORT` overrides both | Negligible — no code affected | `README.md`, `server/config.json` |
| F-20 | KineticJS 4.6.0 abandoned, no CDN, bundled locally | `public/js/kinetic-v4.6.0.min.js` | Canvas rendering works on 2013-era browser APIs | Replace with Konva.js (maintained fork of KineticJS) | Medium — client API is close but not identical | `public/js/StageController.js` throughout |
| F-21 | Hard-coded Nodejitsu production origin | `server/index.js` line 55 | Production CORS whitelist points to a defunct PaaS (`jit.su`) | Replace with `ORIGIN` environment variable | Low — only affects a production deploy | `server/index.js` line 55 |
| F-22 | No `package-lock.json` committed | repository root | Any `npm install` re-resolves floating `0.9.x`, `3.0.x` ranges | A lockfile (or `npm-shrinkwrap.json` for legacy) pins exact versions | Low — already mitigated by `legacy/get24-baseline/repro/npm-shrinkwrap.json` | `package.json` |

---

## Modernization Candidates

### Candidate A — Express 3 → Express 4

| Item | Detail |
|---|---|
| **Files** | `server/index.js` |
| **Change** | Remove `app.configure()`; inline middleware directly. Replace `express.favicon()` → `serve-favicon`. Replace `express.logger('dev')` → `morgan('dev')`. Replace `express.errorHandler()` → `errorhandler`. Remove the `configure` wrappers. |
| **Expected benefit** | Server boots on Express 4, which supports Node.js 20 LTS. Eliminates the first hard boot failure. |
| **Protected behavior** | `GET /` returns 200 with the correct HTML; static assets are served; 404 for unknown paths. All four `http.test.js` tests. |
| **Regression risk** | Medium. `app.configure()` has no Express 4 equivalent; the conversion is mechanical but touches every middleware registration. Middleware ordering must be preserved. |

---

### Candidate B — Socket.IO 0.9 → Socket.IO 4

| Item | Detail |
|---|---|
| **Files** | `server/index.js`, `package.json` |
| **Change** | Remove `io.configure()` and `io.set()` calls. Replace with `cors` option on the Socket.IO constructor. The `io.sockets.on('connection', …)`, `socket.emit`, `socket.broadcast`, `socket.join`, and `socket.on` APIs are preserved in Socket.IO 4. Update `socket.disconnect()` → `socket.disconnect(true)`. Update `package.json`. |
| **Expected benefit** | Real-time layer works on any modern Node.js. Active security maintenance. |
| **Protected behavior** | All 14 `socket.test.js` + `game-events.test.js` tests. Every event name and payload shape must be preserved exactly: `connected`, `overCapacity`, `gameJoined`, `playerJoined`, `playerQuit`, `evaluatedExpr`, `invalidExpr`, `timer`, `roundOver`. |
| **Regression risk** | High. Socket.IO 4 also changes the *client* bundle served at `/socket.io/socket.io.js`. The existing `public/js/SocketController.js` uses `io.connect('/')` which was deprecated in Socket.IO 3+ in favour of `io('/')`. The test harness also depends on socket.io-client 0.9.x internals (`socket.socket.connected`, `CLIENT_IO.Transport.websocket = null`). The harness must be updated in tandem, or a compatibility layer used. This is the **highest-risk** single candidate. It should not be combined with Candidate A in one step. |

---

### Candidate C — `node-uuid` → `uuid`

| Item | Detail |
|---|---|
| **Files** | `server/game/index.js` line 13, `package.json` |
| **Change** | `var uuid = require('node-uuid')` → `const { v4: uuidv4 } = require('uuid')`. `uuid.v4()` → `uuidv4()`. Update `package.json`. |
| **Expected benefit** | Replaces an unmaintained package with its maintained successor. `uuid@9.x` also has no native bindings, making it simpler. |
| **Protected behavior** | `gameJoined.room` must still pass `UUID_V4` regex test in `socket.test.js` line 44. |
| **Regression risk** | Low. The API change is two lines. The format of UUID v4 output is identical. |

---

### Candidate D — `node-expression-eval` → `expr-eval`

| Item | Detail |
|---|---|
| **Files** | `server/game/index.js` lines 12, 65, `package.json` |
| **Change** | `require('node-expression-eval')` → `require('expr-eval').Parser`. `parser.evaluate(expr)` → `new Parser().evaluate(expr)` (or use `Parser.evaluate(expr)` static method). Update `package.json`. |
| **Expected benefit** | `expr-eval@2.x` is the maintained continuation of the same JavaScript expression evaluator codebase. Active CVE tracking. |
| **Protected behavior** | `evaluatedExpr.evaluated` must still equal 15 for `1+3+4+7` and 24 for `7*4-3-1`. The `try/catch` around `parser.evaluate` must still catch malformed expressions and emit `invalidExpr { msg: 'Invalid.' }`. |
| **Regression risk** | Medium. Expression evaluation is the core game mechanic. Any difference in operator precedence, whitespace handling, or error types would cause test failures that are also real behavioral regressions. |

---

### Candidate E — Server start decoupling

| Item | Detail |
|---|---|
| **Files** | `server/index.js`, `index.js` |
| **Change** | Wrap the `http.createServer(app).listen(…)` call and Socket.IO setup inside an exported `start()` function. `index.js` calls `require('./server').start()`. Export the `server` and `io` objects so they can be `.close()`-d in tests. |
| **Expected benefit** | Enables a future test harness to start and stop the server programmatically without spawning a child process. Eliminates the `spawn` overhead in the 18 existing tests. Enables parallel test execution. |
| **Protected behavior** | The server must still bind, serve assets, and handle socket connections identically. All 18 tests must still pass. The start side-effect currently relied on by `node index.js` must be preserved. |
| **Regression risk** | Low-Medium. The observable HTTP and socket behavior is unchanged. The risk is in the startup ordering (middleware and socket attachment must happen before `listen`). |

---

### Candidate F — `validate()` type guard

| Item | Detail |
|---|---|
| **Files** | `server/game/index.js` lines 60–61, 89 |
| **Change** | Add `if (typeof data.expression !== 'string') return;` before calling `validate(data.expression)`. |
| **Expected benefit** | Prevents a server-crashing TypeError if a malformed client sends a non-string expression payload. |
| **Protected behavior** | All existing `invalidExpr` tests must still pass. Valid and winning expressions must behave identically. |
| **Regression risk** | Negligible. The guard returns without response for inputs the current code would throw on. No test exercises a non-string submission. |

---

### Candidate G — KineticJS → Konva.js

| Item | Detail |
|---|---|
| **Files** | `public/js/StageController.js` (entire file), `public/index.html`, `public/js/kinetic-v4.6.0.min.js` → replaced |
| **Change** | Replace the local KineticJS 4.6.0 bundle with Konva.js (latest). Update all KineticJS API calls in `StageController.js`. Notable changes: `shadowOffset` array → `{x, y}` object; `Kinetic.Animation` → `Konva.Animation`; `Kinetic.Tween` → `Konva.Tween`; `Kinetic.Easings` → `Konva.Easings`. Fix the `layer` → `activeLayer` bug (F-16) in the same pass. Fix `blink || true` (F-17). |
| **Expected benefit** | Active security/bug maintenance. Works on modern browsers without polyfills. Fixes two existing client-side bugs in the same change. |
| **Protected behavior** | `http.test.js` asserts `js/kinetic-v4.6.0.min.js` is served and the word `Kinetic` appears in `StageController.js` and in the kinetic bundle. The filename assertion and string check would need to be updated if the asset is renamed. |
| **Regression risk** | Medium-High. `StageController.js` is entirely visual; the server's 18 behavioral tests do not cover client-side rendering. Konva.js API is close but not identical to KineticJS 4.x — `shadowOffset` and some tween properties differ. The test suite has no visual regression coverage. |

---

## Recommended Modernization Sequence

The sequence respects the safety-first principle: every step must be independently verifiable with the existing 18-test safety net before the next step begins. Lower-risk, higher-independence changes come first.

```
Step 1 — F (validate type guard)
  Risk: Negligible. One-line server-side guard.
  Verify: All 18 tests still pass.

Step 2 — C (node-uuid → uuid)
  Risk: Low. Two-line change; UUID v4 format is preserved.
  Verify: socket.test.js UUID_V4 regex test still passes.

Step 3 — D (node-expression-eval → expr-eval)
  Risk: Medium. Core game mechanic. Isolated to one module.
  Verify: evaluatedExpr and all invalidExpr tests still pass.

Step 4 — E (server start decoupling)
  Risk: Low-Medium. No behavioral change; enables better testing.
  Verify: All 18 tests still pass against the now-exportable server.

Step 5 — A (Express 3 → Express 4)
  Risk: Medium. Boot-level change; mechanical but total.
  Verify: All four http.test.js tests still pass.

Step 6 — B (Socket.IO 0.9 → Socket.IO 4)
  Risk: High. Requires updating the test harness in tandem.
  Strategy: Update socket.io + socket.io-client together.
           Update xhr-shim if needed for new client internals.
           Verify all 14 socket + game-events tests still pass.

Step 7 — G (KineticJS → Konva.js) + fix F-16 + fix F-17
  Risk: Medium-High. Client-only; server tests are unaffected.
  Strategy: Tackle last because it has no server-side regression risk
           and no existing visual test coverage. Manual browser
           verification is the only available check.
```

**Steps 5 and 6 must not be combined in a single commit.** The boot failures they address are independent; diagnosing a regression is impossible if both change simultaneously.

---

## Demo Candidate

**Recommended demo step: Step 6 — Socket.IO 0.9 → Socket.IO 4.**

### Why this is the right demo candidate

| Criterion | Assessment |
|---|---|
| **Visible change** | The real-time event contract (all nine event names, every payload key) is preserved but the underlying transport is now modern WebSocket over Socket.IO 4. The demo can show: (1) the legacy server failing to start on Node 20, (2) the modernized server starting on Node 20 with all tests green. |
| **Realistic legacy problem** | Socket.IO 0.9 is a real-world legacy problem that any Node.js developer recognizes. The 12-year API gap (0.9 → 4.x) with its removed `io.configure`/`io.set` idioms is a textbook modernization story. |
| **Manageable blast radius** | Only `server/index.js` (six lines of configuration removed/replaced) and `package.json` change on the server side. The game logic in `server/game/index.js` is untouched. |
| **Verifiable with existing tests** | All 14 socket and game-event behavioral tests directly exercise the Socket.IO layer. Green tests are live evidence that behavior is preserved. |
| **Regression and rollback** | The Socket.IO upgrade is the highest-risk step in the sequence. The demo can deliberately break the upgrade (e.g., rename an event), show a test failure, then show `git revert` restoring the baseline — a concrete demonstration of the Rollback → Recover phases of the workflow. |

The Express upgrade (Step 5) is also a strong candidate but is slightly less dramatic visually because it only affects HTTP startup, not the real-time game behaviour that makes Get24 interesting. The `node-uuid` swap (Step 2) is too small for a compelling demo.

---

## Appendix: Confirmed Bug Details

### F-16 — `layer` ReferenceError in `helpDialog.toggle()`

**Location:** [`public/js/StageController.js`](public/js/StageController.js) line 98  
**Code:**
```js
helpDialog.toggle = function () {
    helpDialog.status = !helpDialog.status;
    if (helpDialog.status) layer.add(helpDialog);   // ← `layer` is not defined
    else helpDialog.remove();
    activeLayer.draw();
};
```
`layer` does not exist in the enclosing scope. The name `activeLayer` is the declared variable. Clicking the Help button at runtime throws `ReferenceError: layer is not defined`. This is an existing bug in the upstream source; no modernization step introduced it.

### F-17 — `blink || true` ignores the `blink` parameter

**Location:** [`public/js/StageController.js`](public/js/StageController.js) line 281  
**Code:**
```js
var willBlink = blink || true;
```
`blink || true` is always `true` regardless of what the caller passes. The `showRoundOver` handler passes `false` to disable blinking on the losing player's expression display (`this.showEvaluatedText(data.expression, '#dd0000', false, 5000)`), but that `false` is ignored. This is an existing upstream bug.

### F-19 — Port mismatch between `README.md` and `server/config.json`

**Location:** [`README.md`](README.md) line 73 says `http://localhost:3001/`; [`server/config.json`](server/config.json) line 3 sets `"port": 4000`.  
The `PORT` environment variable wins at runtime, so neither value is authoritative in practice. The test harness uses a dynamically allocated free port. No code is broken but the README is misleading.

---

*Assessment produced by IBM Bob — analysis-only, no production code modified.*

`ASSESS COMPLETE — NO PRODUCTION CODE MODIFIED`
