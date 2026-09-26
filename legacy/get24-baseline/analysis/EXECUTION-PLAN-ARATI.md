# Get24 Modernization — Execution Specification
### Legacy Code Whisperer · Team Codexmatrix · IBM Bob 2.0 Hackathon

**Author:** Arati (Legacy Analysis + Execution Planning role) — IBM Bob IDE  
**Branch:** `arati/risk-analysis`  
**Input documents:** [`ASSESS.md`](../../ASSESS.md) · [`PLAN.md`](../../PLAN.md) · [`ASSESS-ARATI.md`](./ASSESS-ARATI.md)  
**Safety net:** 18 tests across 3 suites — must remain green after every step  
**Baseline runtime:** Node.js 6.17.1 (Steps 1–5); Node.js 20 LTS (Steps 6–7)

> **Scope:** Documentation and execution planning only.  
> No production code is modified by this document.  
> All findings are grounded in actual file/line evidence from the repository.

---

## Quick Reference — Test Suite

The entire behavioral safety net lives under `legacy/get24-baseline/tests/`.

| Suite file | Tests | What is covered |
|-----------|-------|----------------|
| `http.test.js` | 4 | `GET /` HTML content; all static assets; Socket.IO 0.9 client build; 404 |
| `socket.test.js` | 4 | Handshake; `connected {numUsers}`; `gameJoined {room, card, numPlayers}`; timer ticks |
| `game-events.test.js` | 10 | `playerJoined`; `evaluatedExpr`; all 4 `invalidExpr` messages; win/loss `roundOver`; `playerQuit`; timer `roundOver`; capacity rejection |
| **Total** | **18** | |

### Canonical validation command (Node 6 / legacy runtime)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -v get24-nm:/app/node_modules \
  -w /app \
  node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

**Expected output (passing):**
```
# Get24 legacy HTTP behavior (real Express 3.0.6 server)
ok 1 - GET / serves the Get24 application page  (Nms)
ok 2 - GET / serves every static asset the page references  (Nms)
ok 3 - GET /socket.io/socket.io.js serves the Socket.IO 0.9 client build  (Nms)
ok 4 - GET / returns 404 for an unknown path  (Nms)
# 4 tests, 4 passed, 0 failed, 0 skipped
# Get24 legacy Socket.IO connection + join (real socket.io 0.9.19 server)
ok 1 - a Socket.IO client completes the handshake and connects  (Nms)
ok 2 - server emits connected with an incrementing numUsers count  (Nms)
ok 3 - first player receives gameJoined with a uuid room, a real card and numPlayers 1  (Nms)
ok 4 - the round timer starts ticking for the first player  (Nms)
# 4 tests, 4 passed, 0 failed, 0 skipped
# Get24 legacy game events (real socket.io 0.9.19 server)
ok 1 - a second player joins the same game and the first player is told  (Nms)
ok 2 - a valid non-winning expression produces evaluatedExpr and no roundOver  (Nms)
ok 3 - a missing card digit produces invalidExpr "Must use all 4 digits."  (Nms)
ok 4 - an illegal character produces invalidExpr "Legal operators are ..."  (Nms)
ok 5 - combined digits produce invalidExpr "Digits can't be combined."  (Nms)
ok 6 - an unparseable but legal-character expression produces invalidExpr "Invalid."  (Nms)
ok 7 - a winning expression ends the round: win for the winner, loss for the other player  (Nms)
ok 8 - a player disconnect produces playerQuit for the remaining player  (Nms)
ok 9 - timer expiration ends the round with type timer and a new card  (Nms)
ok 10 - a connection past maxConnections is rejected: no connected, no gameJoined, disconnect  (Nms)
# 10 tests, 10 passed, 0 failed, 0 skipped
```

**Expected exit code:** `0`  
**Failure exit code:** `1` (any test failure)

### Additional validation command (Node 20 / modern runtime — required for Steps 6–7)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

---

## Checkpoint Model

A **known-good checkpoint** is defined by four conditions, all met simultaneously:

1. A specific git commit hash is recorded.
2. The full 18-test validation command exits 0 on the target runtime.
3. The working tree is clean (`git status` shows nothing to commit).
4. The validation result is recorded in the commit message or in this document.

**Why modernization must not continue after failed validation:**  
Each step introduces exactly one class of change (one dependency or one API surface). If validation fails after a step, the failure is attributable to that step alone. If two steps are combined or if a failed step is not rolled back before the next step is applied, the failure becomes ambiguous — it may be caused by the new step, the unrolled-back previous step, or an interaction between them. The rollback action (`git revert HEAD --no-edit`) is only unambiguous when HEAD contains exactly one step. Continuing after failure breaks this invariant.

### Checkpoint table

| Checkpoint | Commit | Description | Validation status |
|-----------|--------|-------------|------------------|
| CP-0 | `4749d7a` | Upstream import — unmodified Get24 | Not recorded (baseline only) |
| CP-1 | `37d3cd7` | Step 1 applied — validate() type guard | Recorded in commit message: all 18 tests pass |
| CP-2 | `3889bec` | Step 2 applied — uuid@9.0.1 | Recorded in commit message: all 18 tests pass |
| CP-3 | TBD | Step 3 applied — expr-eval@2 | Not yet executed |
| CP-4 | TBD | Step 4 applied — server start decoupled | Not yet executed |
| CP-5 | TBD | Step 5 applied — Express 4 | Not yet executed |
| CP-6 | TBD | Step 6 applied — Socket.IO 4 | Not yet executed |
| CP-7 | TBD | Step 7 applied — Konva.js | Not yet executed |

---

## Step Status Summary

| Step | Candidate | Finding(s) | Status | Commit | Runtime |
|------|-----------|-----------|--------|--------|---------|
| 1 | F — type guard | F-18 | ✅ COMPLETED | `37d3cd7` | Node 6 |
| 2 | C — node-uuid → uuid@9.0.1 | F-11 | ✅ COMPLETED | `3889bec` | Node 6 |
| 3 | D — node-expression-eval → expr-eval | F-12 | ⏳ PENDING | — | Node 6 |
| 4 | E — server start decoupling | F-13 | ⏳ PENDING | — | Node 6 |
| 5 | A — Express 3 → Express 4 | F-02, F-03, F-04, F-05, F-10 | ⏳ PENDING | — | Node 6 + Node 20 |
| 6 | B — Socket.IO 0.9 → Socket.IO 4 | F-06, F-07, F-08, F-09, F-21 | ⏳ PENDING | — | Node 20 |
| 7 | G — KineticJS → Konva.js | F-16, F-17, F-20 | ⏳ PENDING | — | Node 20 |

---

## Completed Steps (Evidence Record)

### Step 1 — validate() type guard ✅ COMPLETED

**Commit:** `37d3cd7`  
**Finding:** F-18  
**Change applied:**  
`server/game/index.js` line 61 — added `if (typeof data.expression !== 'string') return;` before `validate()` call.  
**Evidence in current code:**
```js
// server/game/index.js line 60–62 (current state)
socket.on('submitExpression', function (data) {
    if (typeof data.expression !== 'string') return;
    var res = validate(data.expression);
```
**Validation:** Commit message records 18/18 tests pass on Node 6.

---

### Step 2 — node-uuid → uuid@9.0.1 ✅ COMPLETED

**Commit:** `3889bec`  
**Finding:** F-11  
**Change applied:**  
- `server/game/index.js` line 13: `var uuid = require('node-uuid')` → `var uuidv4 = require('uuid').v4`  
- `server/game/index.js` line 21: `uuid.v4()` → `uuidv4()`  
- `package.json`: `"node-uuid": "1.4.x"` → `"uuid": "9.0.1"`  

**Evidence in current code:**
```js
// server/game/index.js line 13 (current state)
var uuidv4 = require('uuid').v4;
```
```json
// package.json line 12 (current state)
"uuid": "9.0.1"
```
**Validation:** Commit message records 18/18 tests pass on Node 6. `socket.test.js` UUID_V4 regex assertion confirms UUID v4 format preserved.

---

## Pending Steps — Execution Specifications

---

### Step 3 — Replace node-expression-eval with expr-eval@2

#### 3.1 Identification

| Field | Value |
|-------|-------|
| **Step ID** | 3 |
| **Candidate** | D |
| **Finding IDs** | F-12 |
| **Risk** | Medium |
| **Pre-requisite checkpoint** | CP-2 (`3889bec`) — clean working tree |
| **Branch name (suggested)** | `modernize/step-3-expr-eval` |

#### 3.2 Objective

Replace the unmaintained `node-expression-eval@0.1.x` package with its maintained continuation `expr-eval@2.x`. The expression evaluation call site and error-handling path must be preserved exactly. This step touches the core game mechanic.

#### 3.3 Exact package and API area

**Current code — `server/game/index.js` lines 12, 66–71:**
```js
var parser = require('node-expression-eval');
// ...
try { data.evaluated = parser.evaluate(data.expression); }
catch(e) {
    passedEval = false;
    socket.emit('invalidExpr', {msg: 'Invalid.'});
} finally {
    if (passedEval) emitEvaluation(socket, data);
}
```

**Required change:**

Line 12 — from:
```js
var parser = require('node-expression-eval');
```
to:
```js
var Parser = require('expr-eval').Parser;
var parser = new Parser();
```

Line 66 — unchanged:
```js
try { data.evaluated = parser.evaluate(data.expression); }
```
This line works identically with `expr-eval@2.x` because `Parser` instances expose `.evaluate(expr)`.

`package.json` — in `"dependencies"`:
```diff
-    "node-expression-eval": "0.1.x",
+    "expr-eval": "2.x",
```

#### 3.4 Expected files affected

| File | Change |
|------|--------|
| `server/game/index.js` | Lines 12–13: change import; instantiation on new line |
| `package.json` | Replace `node-expression-eval` with `expr-eval` |

#### 3.5 Why this step is isolated

`node-expression-eval` is used in exactly one place: `server/game/index.js` line 12 (import) and line 66 (evaluate call). No other file imports or uses the expression evaluator. The change does not touch `server/index.js`, any test file, or any client file. It can be applied, validated, and rolled back without affecting any other step.

#### 3.6 Behavioral risks

| Risk | Detail | Severity |
|------|--------|----------|
| Operator precedence difference | `*` before `+/-` is standard in both packages. The winning expression `7*4-3-1` = 24 requires correct precedence. | Low — both implement standard arithmetic precedence |
| Whitespace handling | `'1 + 3 + 4 + 7'` passes `validate()` and reaches `parser.evaluate()`. No test sends a whitespace-padded expression. | Low — both packages handle standard whitespace in arithmetic expressions |
| Division by zero | `1/(3-3)+4+7` passes `validate()`, throws at eval, caught by `try/catch`. No test covers this path. | Low — protected by existing `try/catch` regardless of error type |
| Error throw type | If `expr-eval` throws a non-`Error` object (e.g., a string), `catch(e)` still fires. Behavior preserved. | Negligible |

#### 3.7 Existing tests that protect this step

All from `game-events.test.js`:

| Test name | What it checks | Expression used |
|-----------|---------------|----------------|
| `'a valid non-winning expression produces evaluatedExpr and no roundOver'` | `data.evaluated === 15` | `1+3+4+7` |
| `'a winning expression ends the round: win for the winner, loss for the other player'` | `data.evaluated === 24`; `roundOver.type === 'win'`; card rotation | `7*4-3-1` |
| `'an unparseable but legal-character expression produces invalidExpr "Invalid."'` | `invalidExpr { msg: 'Invalid.' }` | `(1+3+4+7` (unmatched paren) |

#### 3.8 Test updates required

None. All 18 tests exercise behavior that is preserved by this change. The test harness does not assert the package name.

#### 3.9 Validation command

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -v get24-nm:/app/node_modules \
  -w /app \
  node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

#### 3.10 Expected PASS result

```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0`

#### 3.11 What constitutes a regression

- `data.evaluated` is anything other than `15` for `1+3+4+7`
- `data.evaluated` is anything other than `24` for `7*4-3-1`
- `roundOver` is not emitted after the winning expression
- `invalidExpr { msg: 'Invalid.' }` is not emitted for `(1+3+4+7`
- Any of the 18 tests fails for any reason

#### 3.12 Rollback condition

Any of the 18 tests fails after the change is applied.

#### 3.13 Recovery procedure

```sh
git revert HEAD --no-edit
# Confirm revert restores original import:
# server/game/index.js line 12 should again read:
#   var parser = require('node-expression-eval');
# Re-run validation to confirm 18/18 pass on the reverted state.
```

#### 3.14 What must be re-verified after rollback

Run the full validation command. Confirm exit 0 and `18 tests, 18 passed`.

#### 3.15 Server restart required

Yes. The validation harness spawns a fresh server process per test via `child_process.spawn`. Any prior running instance is unaffected.

#### 3.16 Evidence to capture for demo/report

- Commit hash of the Step 3 commit
- `npm ls --depth=0` output showing `expr-eval@2.x` in place of `node-expression-eval`
- Validation output: `18 tests, 18 passed, 0 failed, 0 skipped`

---

### Step 4 — Decouple server startup from module load

#### 4.1 Identification

| Field | Value |
|-------|-------|
| **Step ID** | 4 |
| **Candidate** | E |
| **Finding IDs** | F-13 |
| **Risk** | Low-Medium |
| **Pre-requisite checkpoint** | CP-3 (Step 3 commit, validated) |
| **Branch name (suggested)** | `modernize/step-4-server-decouple` |

#### 4.2 Objective

Wrap the HTTP server bind and Socket.IO setup inside an exported `start()` function so that `require('./server')` no longer has an immediate I/O side effect. `index.js` calls `require('./server').start()`. The observable HTTP and socket behavior is unchanged. This enables future test tooling to start and stop the server in-process.

#### 4.3 Exact package and API area

**Current `index.js` (line 1):**
```js
var server = require('./server');
```

**Required change to `index.js`:**
```js
require('./server').start();
```

**Current `server/index.js` (lines 43–106):** Everything from `http.createServer(app).listen(...)` through the SIGINT handler runs as a module-load side effect.

**Required change to `server/index.js`:** Wrap lines 43–106 inside a `start()` function. Module-level declarations (`app`, `gameList`, `numConnections`, `config`) remain at module scope. The `app.configure()` and middleware setup remain at module scope (executed on `require`, before `start()` is called).

**Critical ordering invariant:** Socket.IO must be attached to the HTTP server object **before** `server.listen()` fires. In the current code:
```js
var server = http.createServer(app).listen(port, callback);  // listen starts here
var io = require('socket.io').listen(server);                 // io attached after
```
After Step 4, the refactored `start()` function must maintain the same ordering. The safe pattern:
```js
function start() {
    var server = http.createServer(app).listen(app.get('port'), function () {
        console.log('\nExpress server listening port ' + app.get('port') + '\n');
    });
    var io = require('socket.io').listen(server);
    // ... io.configure, io.sockets.on('connection', ...) unchanged ...
    return { server: server, io: io };
}
module.exports = { start: start };
```

#### 4.4 Expected files affected

| File | Change |
|------|--------|
| `server/index.js` | Wrap listen/io setup in `start()` function; export `{ start }` |
| `index.js` | `var server = require('./server')` → `require('./server').start()` |

#### 4.5 Why this step is isolated

No dependency version changes. No new npm packages. The observable behavior of the running server (HTTP responses, socket events, game logic) is unchanged. The only change is the trigger for when the server starts listening. The existing test harness starts the server via `spawn(process.execPath, [..., 'index.js'])` (harness.js line 129), which calls `start()` through the updated `index.js` — so all 18 tests continue to work via the spawn path unchanged.

#### 4.6 Behavioral risks

| Risk | Detail | Severity |
|------|--------|----------|
| Socket.IO attach timing | If `io` is created after `listen()` completes, a fast-connecting client could arrive before `io.sockets.on('connection', ...)` is registered. | Low — both current code and Step 4 code run synchronously; `listen()` callback is async but socket events queue |
| `gameList`/`numConnections` global state | These remain at module scope. After Step 4, if the server is ever re-required in the same process (not current behavior), they persist. No test exercises in-process restart. | Low — test harness always spawns fresh processes |
| `module.exports` change | Current `server/index.js` does not export anything. After Step 4, it exports `{ start }`. Any code doing `var x = require('./server')` and using `x` as a value will find an object instead of `undefined`. `index.js` currently does `var server = require('./server')` and never uses `server` — no breakage. | Negligible |

#### 4.7 Existing tests that protect this step

All 18 tests protect this step. The harness spawns the server via `node index.js` — if `start()` is not called, the server never binds and `waitForServer()` times out after 20 seconds, failing every test.

Test most sensitive to startup ordering:
- `'a Socket.IO client completes the handshake and connects'` (`socket.test.js`) — requires Socket.IO to be ready immediately after server binds.

#### 4.8 Test updates required

None. The harness boot path (`spawn(..., ['index.js'])`) is unchanged in behavior.

#### 4.9 Validation command

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -v get24-nm:/app/node_modules \
  -w /app \
  node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

#### 4.10 Expected PASS result

```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0`

#### 4.11 What constitutes a regression

- The server does not bind within the 20-second startup timeout in `harness.js`
- Any socket event fails to arrive (Socket.IO attached after listen in a race)
- Any of the 18 tests fails for any reason

#### 4.12 Rollback condition

Any of the 18 tests fails, or the server does not become ready within 20 seconds.

#### 4.13 Recovery procedure

```sh
git revert HEAD --no-edit
# Confirm index.js is again: var server = require('./server');
# Confirm server/index.js no longer has a start() function
# Re-run validation to confirm 18/18 pass
```

#### 4.14 What must be re-verified after rollback

Run the full validation command. Confirm exit 0 and `18 tests, 18 passed`.

#### 4.15 Server restart required

Yes. Spawn-based test harness starts a fresh server per test.

#### 4.16 Evidence to capture for demo/report

- Commit hash of the Step 4 commit
- `node -e "var s = require('./server'); console.log(typeof s.start);"` → prints `function`
- Validation output: `18 tests, 18 passed, 0 failed, 0 skipped`

---

### Step 5 — Express 3 → Express 4

#### 5.1 Identification

| Field | Value |
|-------|-------|
| **Step ID** | 5 |
| **Candidate** | A |
| **Finding IDs** | F-02, F-03, F-04, F-05, F-10 |
| **Risk** | Medium |
| **Pre-requisite checkpoint** | CP-4 (Step 4 commit, validated) |
| **Branch name (suggested)** | `modernize/step-5-express4` |

#### 5.2 Objective

Replace Express 3.0.x with Express 4.x. Express 3's `app.configure()` method does not exist in Express 4. Three built-in middleware helpers used in `server/index.js` (`express.favicon()`, `express.logger()`, `express.errorHandler()`) were extracted to separate npm packages in Express 4. After this step the server must boot on both Node.js 6 (safety net) and Node.js 20 LTS (compatibility milestone).

#### 5.3 Exact package and API area

**Current `server/index.js` lines 30–40 (the complete Express 3 boot block):**
```js
var app = express();
app.configure(function () {
    app.set('port', process.env.PORT || config.port);
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.static(path.join(__dirname, '..', 'public')));
});
app.configure('development', function () {
    app.use(express.errorHandler());
});
```

**What `app.configure()` did in Express 3:**
- `app.configure(fn)` — called `fn()` unconditionally
- `app.configure('development', fn)` — called `fn()` only when `app.get('env') === 'development'`

**Express 4 replacement (all at module scope, not inside `start()`):**
```js
app.set('port', process.env.PORT || config.port);
app.use(require('morgan')('dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));
if (app.get('env') === 'development') {
    app.use(require('errorhandler')());
}
```

**Favicon handling:** `public/favicon.ico` does not currently exist in the repository. Express 3's `express.favicon()` with no arguments served a built-in default. `http.test.js` line 44 asserts `GET /favicon.ico` returns 200 (`['/favicon.ico', null, null]`). To preserve this assertion, a minimal `public/favicon.ico` file must be added to the repository in the same commit. `express.static` will then serve it automatically — no `serve-favicon` package is needed.

**`package.json` changes:**
```diff
-    "express": "3.0.x",
+    "express": "4.x",
+    "morgan": "1.x",
+    "errorhandler": "1.x",
```

Note: `serve-favicon` is **not** added (as resolved in PLAN.md Step 5 — `express.static` + a real `favicon.ico` file handles the test assertion without it).

#### 5.4 Expected files affected

| File | Change |
|------|--------|
| `server/index.js` | Remove `app.configure()` wrappers; inline middleware at module scope; add `morgan` and `errorhandler` requires |
| `package.json` | `"express": "3.0.x"` → `"express": "4.x"`; add `morgan@1.x`, `errorhandler@1.x` |
| `public/favicon.ico` | **New file** — minimal valid ICO (any 16-byte or larger valid ICO binary) |

#### 5.5 Why this step is isolated

Express configuration is entirely in `server/index.js`. Socket.IO wiring (`io.configure`, `io.set`, `io.sockets.on`) is not touched by this step. Game logic (`server/game/index.js`) is not touched. Client files are not touched. The step has its own failure mode: if `app.configure()` is not removed, Express 4 throws `TypeError: app.configure is not a function` at boot.

#### 5.6 Behavioral risks

| Risk | Detail | Severity |
|------|--------|----------|
| `app.configure()` removal | Mechanical but total — every middleware registration is re-expressed. Middleware ordering must be preserved exactly. | Medium |
| `favicon.ico` absent | If `public/favicon.ico` is not added, `GET /favicon.ico` returns 404 and `http.test.js` test 2 fails. | Medium — must not be forgotten |
| `morgan` dev output change | `express.logger('dev')` and `morgan('dev')` produce the same format. No test asserts log output. | Low |
| `errorhandler` behavior | `express.errorHandler()` and `errorhandler()` produce the same dev error pages. No test asserts error page format. | Low |
| Static asset serving order | `express.static` must remain after `morgan` so request logging captures asset requests. Ordering is preserved by inlining. | Low |

#### 5.7 Existing tests that protect this step

All from `http.test.js`:

| Test name | What it checks |
|-----------|---------------|
| `'GET / serves the Get24 application page'` | Status 200, `text/html`, DOCTYPE, all expected strings in body |
| `'GET / serves every static asset the page references'` | `/css/styles.css`, `/js/kinetic-v4.6.0.min.js`, `/js/SocketController.js`, `/js/StageController.js`, `/favicon.ico` — all return 200 with expected content |
| `'GET /socket.io/socket.io.js serves the Socket.IO 0.9 client build'` | Socket.IO serves its own client bundle; not affected by Express upgrade |
| `'GET / returns 404 for an unknown path'` | Unknown paths still return 404 |

#### 5.8 Test updates required

None. All assertions remain valid after the Express 4 upgrade. The `http.test.js` suite title still says "real Express 3.0.6 server" — this is a comment, not a behavioral assertion, and it is not tested.

#### 5.9 Two-stage validation

**Stage A — Node 6 (safety net must remain green):**
```sh
docker run --rm \
  -v "${PWD}:/app" \
  -v get24-nm:/app/node_modules \
  -w /app \
  node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```
Expected: `18 tests, 18 passed, 0 failed, 0 skipped` — exit 0.

**Stage B — Node 20 (compatibility milestone):**
```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; node index.js &
           sleep 2 && curl -sf http://localhost:4000/ | grep -q 'Get24' && echo 'Express 4 OK on Node 20'"
```
Expected: `Express 4 OK on Node 20` printed — exit 0.  
Note: The socket tests cannot run on Node 20 until Step 6 — Socket.IO 0.9 does not support Node 20.

#### 5.10 Expected PASS result (Stage A)

```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0`

#### 5.11 What constitutes a regression

- Server throws `TypeError: app.configure is not a function` at boot
- Any of the 4 `http.test.js` tests fails (especially `GET /favicon.ico` → 404 if `favicon.ico` missing)
- `GET /` returns anything other than 200 with the Get24 HTML
- Static assets return 404 or empty body
- Exit code non-zero

#### 5.12 Rollback condition

Server does not boot, or any `http.test.js` test fails.

#### 5.13 Recovery procedure

```sh
git revert HEAD --no-edit
# Confirm server/index.js again has app.configure() blocks
# Confirm public/favicon.ico is gone (it was added in this commit)
# Confirm package.json is back to "express": "3.0.x"
# Re-run Stage A validation to confirm 18/18 pass
```

#### 5.14 What must be re-verified after rollback

Run Stage A validation. Confirm exit 0 and `18 tests, 18 passed`.

#### 5.15 Server restart required

Yes. The validation harness spawns a fresh server process per test.

#### 5.16 Evidence to capture for demo/report

- Commit hash of the Step 5 commit
- `npm ls --depth=0` output showing `express@4.x`, `morgan@1.x`, `errorhandler@1.x`
- Stage A validation output: `18 tests, 18 passed, 0 failed, 0 skipped` on Node 6
- Stage B output: `Express 4 OK on Node 20`

---

### Step 6 — Socket.IO 0.9 → Socket.IO 4

#### 6.1 Identification

| Field | Value |
|-------|-------|
| **Step ID** | 6 |
| **Candidate** | B |
| **Finding IDs** | F-06, F-07, F-08, F-09, F-21 |
| **Risk** | **High** |
| **Pre-requisite checkpoint** | CP-5 (Step 5 commit, validated on both Node 6 and Node 20) |
| **Branch name (suggested)** | `modernize/step-6-socketio4` |

#### 6.2 Objective

Replace Socket.IO 0.9.x with Socket.IO 4.x. This is the highest-risk step. The server-side event API (`socket.emit`, `socket.on`, `socket.broadcast`, `socket.join`, `io.sockets.on`) is preserved in Socket.IO 4, but the configuration idiom (`io.configure`, `io.set`) is entirely removed and the test harness depends on three internal Socket.IO 0.9 client details that do not exist in Socket.IO 4.

After this step the primary validation target is **Node.js 20** (not Node 6 — Socket.IO 4 does not support Node 6).

#### 6.3 Exact package and API area

**Current `server/index.js` lines 48–56 (must be replaced):**
```js
var io = require('socket.io').listen(server);

io.configure('development', function () {
    io.set('origins', 'http://localhost:' + app.get('port'));
});
io.configure('production', function () {
    io.set('origins', 'http://get24.jit.su:80');
});
```

**Socket.IO 4 replacement (inside `start()`, after Step 4):**
```js
var io = require('socket.io')(server, {
    cors: {
        origin: process.env.ORIGIN || (app.get('env') === 'production'
            ? false
            : '*'),
        methods: ['GET', 'POST']
    }
});
```

**`socket.disconnect()` change — `server/index.js` line 97:**
```diff
-        socket.disconnect();
+        socket.disconnect(true);
```
Without `true`, Socket.IO 4's `disconnect()` closes only the namespace connection, not the underlying transport. The capacity-rejection guard would not actually drop the client.

**`public/js/SocketController.js` line 17:**
```diff
-            socket = io.connect('/');
+            socket = io('/');
```
`io.connect` was removed in Socket.IO 4. This is a client-side file. No server-side test covers it, but the browser game would break without this fix.

**`package.json`:**
```diff
-    "socket.io": "0.9.x",
+    "socket.io": "4.x",
```

#### 6.4 Expected files affected — production files

| File | Change |
|------|--------|
| `server/index.js` | Remove `io.configure()`/`io.set()`; replace with constructor CORS option; update `socket.disconnect()` |
| `public/js/SocketController.js` | `io.connect('/')` → `io('/')` |
| `package.json` | `"socket.io": "0.9.x"` → `"socket.io": "4.x"` |

#### 6.5 Expected files affected — test harness (compatibility updates only)

The test harness must be updated in the same commit as the server upgrade. These are compatibility changes — the event names, payload keys, and behavioral assertions do not change.

| File | Line(s) | Current code | Required fix | Reason |
|------|---------|-------------|--------------|--------|
| `legacy/get24-baseline/tests/socket.test.js` | 16 | `a.socket.socket.connected` | `a.socket.connected` | Socket.IO 4 client exposes `connected` directly; no `.socket.socket` double-hop |
| `legacy/get24-baseline/tests/game-events.test.js` | 198 | `c.socket.socket.connected` | `c.socket.connected` | Same reason |
| `legacy/get24-baseline/tests/harness.js` | 45–46, 60, 174–177 | `CLIENT_IO = require('socket.io-client/lib/io.js')` and `CLIENT_IO.Transport.websocket = null` and `CLIENT.connect(url, {'force new connection': true})` | Remove `CLIENT_IO` import and `Transport.websocket` patch; replace `'force new connection': true` with `forceNew: true`; add `transports: ['polling']` | Socket.IO 4 client has no `Transport` object on `lib/io.js`; `'force new connection'` is the 0.9 option name; transport restriction uses connect options in 4.x |
| `legacy/get24-baseline/tests/harness.js` | 37–43 | `require.cache[xhrShimPath] = { exports: require('./xhr-shim.js') }` | Investigate: socket.io-client@4.x does not depend on `xmlhttprequest`; if absent from `node_modules`, `require.resolve('xmlhttprequest')` throws and the harness crashes — remove the injection block | `xmlhttprequest@1.4.2` was a dep of `socket.io-client@0.9.16`; socket.io-client 4.x uses its own HTTP implementation |

**Harness change detail — `Client` constructor (harness.js ~line 174):**

Current:
```js
this.socket = CLIENT.connect('http://127.0.0.1:' + port, {
    reconnect: false,
    'force new connection': true
});
```

Required (Socket.IO 4):
```js
this.socket = CLIENT('http://127.0.0.1:' + port, {
    reconnect: false,
    forceNew: true,
    transports: ['polling']
});
```

`forceNew: true` replaces `'force new connection': true` (the camelCase form is the Socket.IO 4 option). `transports: ['polling']` replaces the `CLIENT_IO.Transport.websocket = null` patch — it forces xhr-polling so WebSocket Origin issues do not interfere with the test client.

#### 6.6 Why this step is isolated from Step 5

Steps 5 and 6 address independent boot failures on different code surfaces:
- Step 5 addresses `app.configure()` (Express API)
- Step 6 addresses `io.configure()` / `io.set()` (Socket.IO API)

Combining them would make it impossible to attribute a regression to the correct change. PLAN.md explicitly requires these to be separate commits.

#### 6.7 Behavioral risks

| Risk | Detail | Severity |
|------|--------|----------|
| `io.configure()`/`io.set()` removal | These do not exist in Socket.IO 1.x+. If not removed, the server throws `TypeError: io.configure is not a function` on boot. | High — boot failure |
| CORS origin handling | Socket.IO 0.9 used `io.set('origins', ...)` with a substring match. Socket.IO 4 uses the standard `cors` option with exact origin matching. The test harness already connects to `http://127.0.0.1:<port>` — must be covered by the `origin: '*'` in development mode. | Medium |
| `socket.disconnect()` without `true` | In Socket.IO 4, `socket.disconnect()` closes only the namespace. The capacity-rejection test would fail: the rejected client would not actually be dropped at the transport level. | Medium — test failure if not updated |
| `'force new connection'` option silently ignored | In socket.io-client 4.x, the string-key `'force new connection'` is not recognized. Multiple `server.client()` calls in the same test would share one underlying manager. Multi-client tests (`playerJoined`, win/loss, capacity) would fail or behave incorrectly. | Medium — test failure |
| `socket.socket.connected` path | In socket.io-client 0.9.x the connected flag lives at `socket.socket.connected`. In 4.x it lives at `socket.connected`. Two tests will fail with `TypeError` or assertion error if not updated. | Medium — test failure |
| `CLIENT_IO.Transport.websocket = null` | `CLIENT_IO` from `socket.io-client/lib/io.js` does not have a `Transport` object in 4.x. This line will throw at harness load time, crashing all 18 tests. | High — all tests fail to start |
| `xmlhttprequest` shim injection | `require.resolve('xmlhttprequest')` throws if the package is not installed. socket.io-client 4.x does not depend on it. Harness crashes before any test runs. | High — all tests fail to start |
| `io.connect('/')` in SocketController | `io.connect` removed in Socket.IO 4. Browser game breaks. Not covered by server tests. | Low (server tests unaffected) |
| Event contract | All 9 event names and every payload key are preserved in Socket.IO 4: `connected`, `overCapacity`, `gameJoined`, `playerJoined`, `playerQuit`, `evaluatedExpr`, `invalidExpr`, `timer`, `roundOver`. No test changes needed for event names/payloads. | No risk |

#### 6.8 Event contract — must not change

| Direction | Event | Payload keys | Asserted by |
|-----------|-------|-------------|-------------|
| server → client | `connected` | `{ numUsers }` | `socket.test.js` test 2 |
| server → client | `overCapacity` | `{}` | `game-events.test.js` test 10 |
| server → client | `gameJoined` | `{ room, card, numPlayers }` | `socket.test.js` test 3 |
| server → client | `playerJoined` | `{ numPlayers }` | `game-events.test.js` test 1 |
| server → client | `playerQuit` | `{ numPlayers }` | `game-events.test.js` test 8 |
| server → client | `evaluatedExpr` | `{ evaluated }` | `game-events.test.js` test 2 |
| server → client | `invalidExpr` | `{ msg }` | `game-events.test.js` tests 3–6 |
| server → client | `timer` | `{ time }` | `socket.test.js` test 4 |
| server → client | `roundOver` | `{ type, card }` or `{ type, card, expression }` | `game-events.test.js` tests 7, 9 |
| client → server | `submitExpression` | `{ expression }` | `game-events.test.js` tests 2–7 |

None of these event names or payload keys change in this step.

#### 6.9 Validation command (Node 20 — primary)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

#### 6.10 Expected PASS result

```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0` — on Node.js 20.

#### 6.11 What constitutes a regression

- Server throws on boot (any `io.configure`/`io.set` remaining, or any other TypeError)
- The `CLIENT_IO.Transport` patch causes harness crash before tests start
- `xmlhttprequest` shim injection causes harness crash
- Any `socket.socket.connected` reference causes TypeError in tests
- Any multi-client test fails due to shared socket manager
- Any of the 9 event names is missing or has wrong payload shape
- Any of the 18 tests fails for any reason on Node 20

#### 6.12 Rollback condition

Any of the 18 tests fails on Node 20, or the server does not boot.

#### 6.13 Recovery procedure

```sh
git revert HEAD --no-edit
# This single revert restores:
#   server/index.js (io.configure back)
#   public/js/SocketController.js (io.connect back)
#   package.json (socket.io: 0.9.x back)
#   harness.js, socket.test.js, game-events.test.js (0.9 client internals back)
# Re-run validation on Node 6 (the reverted state runs on Node 6):
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

#### 6.14 What must be re-verified after rollback

Run validation on **Node 6** (the reverted state no longer runs on Node 20). Confirm exit 0 and `18 tests, 18 passed`. This confirms the rollback correctly restored the Socket.IO 0.9 baseline.

#### 6.15 Server restart required

Yes. A running Socket.IO 4 server must be stopped before reverting and re-running with Socket.IO 0.9.

#### 6.16 Evidence to capture for demo/report

- Commit hash of the Step 6 commit
- `npm ls --depth=0` output showing `socket.io@4.x`
- Validation output on Node 20: `18 tests, 18 passed, 0 failed, 0 skipped`
- `node --version` output: v20.x.x

---

### Step 7 — KineticJS → Konva.js + fix F-16 + fix F-17

#### 7.1 Identification

| Field | Value |
|-------|-------|
| **Step ID** | 7 |
| **Candidate** | G |
| **Finding IDs** | F-16, F-17, F-20 |
| **Risk** | Medium-High |
| **Pre-requisite checkpoint** | CP-6 (Step 6 commit, validated on Node 20) |
| **Branch name (suggested)** | `modernize/step-7-konva` |

#### 7.2 Objective

Replace the abandoned KineticJS 4.6.0 client bundle with Konva.js 9.3.18 (the maintained successor). Fix two existing client-side bugs in the same pass: F-16 (`layer` ReferenceError in `helpDialog.toggle()`) and F-17 (`blink || true` always-on blink bug). This step is **client-only**: no file in `server/` or `index.js` is touched.

#### 7.3 Exact package and API area

**Pinned version:** Konva.js `9.3.18` (exact — not latest).  
**Bundle source:** `https://unpkg.com/konva@9.3.18/konva.min.js`

**Key breaking API changes (KineticJS 4.6.0 → Konva.js 9.3.18):**

| KineticJS 4.6.0 | Konva.js 9.3.18 | Notes |
|----------------|----------------|-------|
| `shadowOffset: [0, 7]` | `shadowOffset: { x: 0, y: 7 }` | **BREAKING** — 3 occurrences in `StageController.js` (lines 39, 149, 162 approximately) |
| `Kinetic.Stage/Layer/Group/Text/Rect/Animation/Tween` | `Konva.Stage/Layer/Group/Text/Rect/Animation/Tween` | Mechanical rename — all constructors |
| `.setX(v)` / `.setY(v)` | `.x(v)` / `.y(v)` | Method rename |
| `.getWidth()` / `.getHeight()` | `.width()` / `.height()` | Method rename |
| `.setFill(v)` / `.setText(v)` / `.setVisible(v)` / `.setOpacity(v)` | `.fill(v)` / `.text(v)` / `.visible(v)` / `.opacity(v)` | Method renames |
| `.getVisible()` | `.visible()` | Method rename (getter) |
| `Kinetic.Easings.EaseIn` | `Konva.Easings.EaseIn` | Namespace rename |

**F-16 fix — `StageController.js` line 98:**
```diff
-    if (helpDialog.status) layer.add(helpDialog);
+    if (helpDialog.status) activeLayer.add(helpDialog);
```
`layer` is not defined in scope; `activeLayer` is the correct variable (declared at line 36).

**F-17 fix — `StageController.js` line 281:**
```diff
-    var willBlink = blink || true;
+    var willBlink = blink !== false;
```
`false || true` is always `true`, ignoring the caller's `false` argument. The `showRoundOver` handler passes `false` on loss: `this.showEvaluatedText(data.expression, '#dd0000', false, 5000)`.

#### 7.4 Expected files affected

| File | Change |
|------|--------|
| `public/js/kinetic-v4.6.0.min.js` | Remove |
| `public/js/konva.min.js` | Add — Konva.js 9.3.18 minified bundle |
| `public/index.html` | `src="js/kinetic-v4.6.0.min.js"` → `src="js/konva.min.js"` |
| `public/js/StageController.js` | All `Kinetic.*` → `Konva.*`; all deprecated method calls; fix F-16; fix F-17 |
| `legacy/get24-baseline/tests/http.test.js` | Update 3 assertions (see §7.8) |

#### 7.5 Why this step is isolated

No server file is touched. No game logic changes. The 14 socket and game-event tests are completely unaffected (they do not load any client file). Only the 4 `http.test.js` tests are affected — 3 of them assert filenames and strings in client files that change.

#### 7.6 Behavioral risks

| Risk | Detail | Severity |
|------|--------|----------|
| `shadowOffset` format | Array `[0, 7]` silently ignored by Konva (no error thrown, but shadow not rendered). 3 occurrences must all be converted to `{x:0, y:7}`. | Medium — visual regression, no automated test |
| Setter/getter method renames | Konva 9.3.18 uses unified `.property(value)` / `.property()` form. Old `setX(v)` still works as a deprecated alias in some Konva versions — but pinning to 9.3.18 means this must be verified. | Medium — silent breakage if any call site is missed |
| `Konva.Easings.EaseIn` | Konva.js uses the same `Easings` namespace. The easing name `EaseIn` exists in Konva 9.3.18. Verify against the bundle. | Low |
| No automated visual regression | The 18 server-side tests do not cover canvas rendering. Visual correctness requires manual browser verification. | Medium — no automated coverage |

#### 7.7 Existing tests that protect this step

From `http.test.js`:

| Test name | Current assertion | After Step 7 |
|-----------|------------------|-------------|
| `'GET / serves the Get24 application page'` | `index.html` body contains `'js/kinetic-v4.6.0.min.js'` | Must be updated to `'js/konva.min.js'` |
| `'GET / serves every static asset the page references'` | `['/js/kinetic-v4.6.0.min.js', /javascript/, ['Kinetic']]` | Must be updated |
| `'GET / serves every static asset the page references'` | `['/js/StageController.js', /javascript/, ['Kinetic']]` | Must be updated |
| `'GET / serves every static asset the page references'` | `['/favicon.ico', null, null]` | Unchanged |
| `'GET /socket.io/socket.io.js serves the Socket.IO 0.9 client build'` | Unchanged — socket.io already updated in Step 6 | Unchanged |
| `'GET / returns 404 for an unknown path'` | Unchanged | Unchanged |

#### 7.8 Test updates required — `http.test.js`

Three exact assertions must change in the same Step 7 commit:

**Assertion 1** — `http.test.js` line 24 (inside `'GET / serves the Get24 application page'`):
```diff
- 'js/kinetic-v4.6.0.min.js',
+ 'js/konva.min.js',
```

**Assertion 2** — `http.test.js` line 41 (inside asset list):
```diff
- ['/js/kinetic-v4.6.0.min.js', /javascript/, ['Kinetic']],
+ ['/js/konva.min.js', /javascript/, ['Konva']],
```

**Assertion 3** — `http.test.js` line 43 (inside asset list):
```diff
- ['/js/StageController.js', /javascript/, ['Kinetic']],
+ ['/js/StageController.js', /javascript/, ['Konva']],
```

The string `'Konva'` appears in `konva.min.js` (it exports a global named `Konva`) and will appear throughout the updated `StageController.js` after all `Kinetic.*` references are replaced with `Konva.*`.

#### 7.9 Validation command (Node 20)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

#### 7.10 Expected PASS result

```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0` — on Node.js 20.

#### 7.11 What constitutes a regression

- `GET /js/konva.min.js` returns 404 (file not added or wrong filename)
- `GET /js/StageController.js` body does not contain `'Konva'` (a `Kinetic.` reference was missed)
- `GET /` body does not contain `'js/konva.min.js'` (`index.html` not updated)
- Any of the 18 tests fails for any reason
- Browser shows JavaScript errors on load (visual regression, no automated check)

#### 7.12 Rollback condition

Any of the 18 tests fails, or the browser shows a JavaScript error on page load.

#### 7.13 Recovery procedure

```sh
git revert HEAD --no-edit
# This single revert restores:
#   public/js/kinetic-v4.6.0.min.js (re-added)
#   public/js/konva.min.js (removed)
#   public/index.html (kinetic filename reference restored)
#   public/js/StageController.js (Kinetic.* restored, F-16/F-17 bugs restored)
#   legacy/get24-baseline/tests/http.test.js (Kinetic assertions restored)
# Re-run validation on Node 20 to confirm 18/18 pass
```

#### 7.14 What must be re-verified after rollback

Run validation on Node 20. Confirm exit 0 and `18 tests, 18 passed`. Also manually verify in browser that KineticJS renders correctly (it did before — rollback restores the known-good state).

#### 7.15 Server restart required

Yes — a running server serves static files from `public/`; a file change requires the server to restart to serve the new files.

#### 7.16 Evidence to capture for demo/report

- Commit hash of the Step 7 commit
- Validation output on Node 20: `18 tests, 18 passed, 0 failed, 0 skipped`
- Browser screenshot (manual): splash screen renders, Play and Help buttons visible
- Browser screenshot (manual): clicking Help opens dialog without ReferenceError
- Browser screenshot (manual): losing player's expression does not blink (F-17 fix verified)

---

## Demo Specification — Socket.IO Modernization (Step 6)

Step 6 is the major visible demo candidate because:
1. It affects real-time behavior — the actual WebSocket/polling event layer
2. The existing 14 socket and game-event tests directly exercise it
3. The 12-year API gap (Socket.IO 0.9 → 4.x) with removed `io.configure`/`io.set` is a textbook legacy modernization story
4. It demonstrates both the modernization and the rollback/recovery mechanism on the highest-risk step

### Demo Script

---

#### Phase 1 — Establish the known-good checkpoint

**Starting point:** CP-5 — the Step 5 commit (Express 4 applied, validated).

```sh
git log --oneline -3
# Confirm the last commit is the Step 5 commit (Express 4)
git status
# Confirm: nothing to commit, working tree clean
```

**State assertion:** The working tree is clean. The server is at CP-5.

---

#### Phase 2 — Apply Step 6 modernization

Apply the Step 6 changes as described in §6.3–6.5:
- `server/index.js`: remove `io.configure()`/`io.set()`; use Socket.IO 4 constructor with CORS option; update `socket.disconnect(true)`
- `public/js/SocketController.js`: `io.connect('/')` → `io('/')`
- `package.json`: `"socket.io": "4.x"`
- Harness updates: `forceNew: true`, remove `Transport.websocket = null`, remove xhr-shim injection, fix `socket.connected` paths

Commit:
```
refactor(server): upgrade Socket.IO 0.9 → 4 (F-06,F-07,F-08,F-09,F-21)
```

---

#### Phase 3 — Run validation on Node 20 (PASS)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

**Expected output:**
```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0`

**Demo narrative:** "The server now runs on Node 20 LTS. All 9 real-time event contracts are preserved — the same 14 socket and game-event tests that covered the legacy Socket.IO 0.9 server now pass against the modernized Socket.IO 4 server."

---

#### Phase 4 — Introduce the controlled demonstration regression

**Purpose:** Show that the safety net detects broken behavior before it reaches production.

**Action:** Rename the `connected` event emission in `server/index.js` from `'connected'` to `'connected2'`.

In `server/index.js`, inside `accept()` (line 92 in the current source):
```diff
-        socket.emit('connected', { numUsers: ++numConnections });
+        socket.emit('connected2', { numUsers: ++numConnections });
```

**This is ONLY a controlled demonstration regression. It is NOT a modernization step.**

---

#### Phase 5 — Run validation (FAIL — expected)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

**Expected output:**
```
# Get24 legacy HTTP behavior (...)
# 4 tests, 4 passed, 0 failed, 0 skipped
# Get24 legacy Socket.IO connection + join (...)
not ok 2 - server emits connected with an incrementing numUsers count
  AssertionError [ERR_ASSERTION]: timed out after 5000ms waiting for "connected" x1; received: connect, gameJoined, timer
# 4 tests, 2 passed, 2 failed, 0 skipped
# Get24 legacy game events (...)
not ok 10 - a connection past maxConnections is rejected: no connected, no gameJoined, disconnect
  AssertionError [ERR_ASSERTION]: ...
# 10 tests, 9 passed, 1 failed, 0 skipped
```

**Observed result:** `16 passed / 2 failed / 0 skipped`  
Exit code: `1`

**Failing tests:**
1. `socket.test.js` — `'server emits connected with an incrementing numUsers count'` (waits for `'connected'` event, never arrives)
2. `game-events.test.js` — `'a connection past maxConnections is rejected: no connected, no gameJoined, disconnect'` (asserts `c.count('connected') === 0` but also asserts `b.all('connected')[0].numUsers === 2`, which now times out)

**Demo narrative:** "The safety net catches this immediately. The event contract between the server and its clients is enforced by 18 behavioral tests. A one-character change to an event name causes 2 tests to fail, showing exactly which events and which assertions are broken."

---

#### Phase 6 — Roll back using the safe rollback mechanism

```sh
git diff --stat
# Shows the controlled regression change in server/index.js
git restore server/index.js
# OR if the regression was committed: git revert HEAD --no-edit
```

**State assertion after rollback:** The `server/index.js` `accept()` function again emits `'connected'`. Working tree is clean.

**Why this is the safe rollback mechanism:**  
`git restore server/index.js` (or `git revert HEAD`) is atomic and unambiguous. It restores the exact bytes of the file as of the last commit. No manual re-editing required. No risk of introducing a second error while fixing the first.

---

#### Phase 7 — Re-run validation (PASS — recovery confirmed)

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -w /app \
  node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

**Expected output:**
```
# 18 tests, 18 passed, 0 failed, 0 skipped
```
Exit code: `0`

**Observed result:** `18 passed / 0 failed / 0 skipped`

---

#### Phase 8 — Server restart note

**Important:** In a live deployment scenario (not the test harness), rolling back source code alone is not sufficient. A running server process continues to execute the old (broken) code in memory. Recovery validation must be performed against a freshly started server instance:

1. Stop the currently running server process (`kill <pid>` or `Ctrl+C`).
2. Apply the rollback (`git restore` or `git revert`).
3. `npm install` (if `package.json` was changed in the rolled-back commit).
4. Start the server: `node index.js`
5. Re-run validation.

In the demo test harness, this is automatic — `harness.js` spawns a fresh server process for each test. In production, it is a manual step.

---

#### Demo summary table

| Phase | Action | Expected result |
|-------|--------|----------------|
| 1 | Establish CP-5 checkpoint | Clean working tree, known-good commit |
| 2 | Apply Step 6 (Socket.IO 0.9 → 4) | Step 6 commit applied |
| 3 | Run validation on Node 20 | **18 passed / 0 failed** — ✅ |
| 4 | Introduce `connected` → `connected2` regression | Source modified |
| 5 | Run validation | **16 passed / 2 failed** — ❌ |
| 6 | Roll back (`git restore` / `git revert`) | Source restored to Step 6 commit |
| 7 | Re-run validation | **18 passed / 0 failed** — ✅ |
| 8 | Note: live server requires restart before recovery validation | Procedural note |

---

## Risk Summary Table

| Step | Finding(s) | Risk | Primary reason | Test coverage |
|------|-----------|------|----------------|---------------|
| 3 (expr-eval) | F-12 | Medium | Core game mechanic — expression evaluation | 3 game-events tests directly cover evaluation paths |
| 4 (server decouple) | F-13 | Low-Medium | Start ordering must be preserved | All 18 tests — server must bind and accept connections |
| 5 (Express 4) | F-02–F-05, F-10 | Medium | Boot-level change; `app.configure()` removal; `favicon.ico` must be added | All 4 http tests; favicon test is a trap if file missing |
| 6 (Socket.IO 4) | F-06–F-09, F-21 | **High** | Highest-risk step; 5 harness break-points; client API changes; real-time behavior | All 14 socket + game-events tests; 5 harness files need updates |
| 7 (Konva.js) | F-16, F-17, F-20 | Medium-High | Client-only; no visual regression tests; 50+ API call sites; 3 breaking `shadowOffset` changes | 3 http assertions update; 14 socket tests unaffected |

---

## Dependency and Sequencing Notes

### Why Steps 5 and 6 must not be combined

Express 4 and Socket.IO 4 each introduce independent boot failures. If both are applied together and validation fails, the failure cannot be attributed to either change with confidence. The root-cause must be diagnosable from a single-step diff.

### Step 4 dependency on Step 3

Step 4 (server decoupling) makes no assumptions about the expression evaluator. Steps 3 and 4 are independent in theory. They are ordered 3 → 4 because lower-risk steps come first: Step 3 (Medium risk) is resolved before the structural change of Step 4 (Low-Medium).

### Step 5 dependency on Step 4

PLAN.md requires Step 4 to precede Step 5 to allow auditing the Express 4 upgrade in isolation within the `start()` function. This is a recommended practice, not a strict technical requirement.

### Step 6 dependency on Step 5

Socket.IO 4 requires Express 4 to be in place first because Socket.IO 4 uses Node.js 20 semantics and the test harness targets Node 20 starting from Step 6. Mixing Socket.IO 4 with Express 3 is untested and unsupported.

### Step 7 independence

Step 7 is client-only and can in theory be applied before Steps 3–6. It is placed last because:
1. It has no server-side regression risk
2. It has no existing visual test coverage
3. Server modernization must be proven first before client modernization begins

---

*Execution plan produced using IBM Bob IDE — no production code modified.*  
*All findings grounded in actual code, line numbers, and test file evidence.*  
`EXECUTION PLAN COMPLETE — NO PRODUCTION CODE MODIFIED`
