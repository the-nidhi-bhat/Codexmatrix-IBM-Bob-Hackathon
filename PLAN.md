# Phase 3 — PLAN: Get24 Modernization Execution Plan

**Project:** Legacy Code Whisperer  
**Team:** Codexmatrix  
**Date:** 2026-09-26  
**Workflow stage:** Understand → Protect → Assess → **Plan** → Execute → Verify → Rollback → Recover → Report  
**Input:** [`ASSESS.md`](ASSESS.md) — 22 findings, 7 modernization candidates  
**Baseline:** `baseline/import-get24` @ `legacy-baseline` (commit `96c17e1`)  
**Behavioral safety net:** 18/18 tests — must remain green after every step.

---

## Safety-first constraints

Before any step may be executed:

1. The working tree must be clean (`git status` shows nothing to commit).
2. The step's branch must be cut from the tip of the previous verified step.
3. The verification command must be run and must exit 0.
4. If verification fails the rollback action must be applied before anything else.
5. No step may be merged without a passing verification run recorded in the commit message.
6. Steps 5 and 6 must never be squashed or combined into a single commit.

### Verification command (all steps)

Every step uses the same verification command against the legacy runtime
(Node.js 6.17.1 in a Docker container — see `legacy/get24-baseline/tests/README.md`):

```sh
docker run --rm \
  -v "${PWD}:/app" \
  -v get24-nm:/app/node_modules \
  -w /app \
  node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

Expected output: `18 tests, 18 passed, 0 failed, 0 skipped`  
Expected exit code: `0`

Steps 5 and 6 additionally require the full suite to pass on the *modern* runtime
(Node.js 20) once the relevant package is upgraded, because the point of those
steps is to unlock Node 20 compatibility.

---

## Step 1 — Input guard for `validate()` (Finding F-18)

### What and why

`server/game/index.js` passes `data.expression` directly to `validate()`, which
calls `String.prototype.search()` on it. If a malformed client sends a payload
where `expression` is absent, null, or not a string, this throws a TypeError that
crashes the `submitExpression` handler. The guard returns silently for such inputs,
preserving every tested code path unchanged.

### Files changed

| File | Change |
|---|---|
| `server/game/index.js` | Add one guard line before the `validate()` call |

### Exact change

In `server/game/index.js`, inside `attachSocket()`, the `submitExpression` handler
currently starts:

```js
socket.on('submitExpression', function (data) {
    var res = validate(data.expression);
```

Replace with:

```js
socket.on('submitExpression', function (data) {
    if (typeof data.expression !== 'string') return;
    var res = validate(data.expression);
```

No other line changes. No dependency changes.

### Behavior preserved

- All four `invalidExpr` message strings are unchanged.
- All `evaluatedExpr` paths are unchanged.
- All `roundOver` (win / loss / timer) paths are unchanged.
- Non-string submissions produce no response — same as the current runtime crash
  outcome from the client's perspective (no reply arrives), but without killing
  the server.

### Verification

```sh
# Full safety net — must report 18/18
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

Target test: `game-events.test.js` — all ten event tests must pass, in particular
the four `invalidExpr` cases.

### Rollback condition

Any of the 18 tests fails after the change is applied.

### Recovery action

```sh
git revert HEAD --no-edit
# re-run verification to confirm revert restores baseline
```

### Commit message template

```
fix(game): guard validate() against non-string expression payload (F-18)

Adds typeof check before validate() in the submitExpression handler.
A missing or non-string expression previously crashed the handler with
a TypeError; it now returns silently. All 18 behavioral tests pass.
```

### Branch name

`modernize/step-1-validate-guard`

---

## Step 2 — Replace `node-uuid` with `uuid` (Finding F-11)

### What and why

`node-uuid@1.4.x` was deprecated in 2014 when it was renamed to `uuid`. It is
still installed from npm but is no longer maintained and does not appear in CVE
databases under its current name. `uuid@9.x` is a drop-in replacement: the v4
output format is byte-for-byte identical; only the import API changes.

### Files changed

| File | Change |
|---|---|
| `server/game/index.js` | Change `require('node-uuid')` and `uuid.v4()` call |
| `package.json` | Remove `node-uuid`, add `uuid@9.x` |

### Exact change

`server/game/index.js` line 13 — from:

```js
var uuid = require('node-uuid');
```

to:

```js
var uuidv4 = require('uuid').v4;
```

`server/game/index.js` line 21 — from:

```js
var gameId = uuid.v4();
```

to:

```js
var gameId = uuidv4();
```

`package.json` — in `"dependencies"`:

```diff
-    "node-uuid": "1.4.x",
+    "uuid": "9.x",
```

### Behavior preserved

- `gameJoined.room` is a UUID v4 string matching `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.
- `socket.test.js` test "first player receives gameJoined with a uuid room" asserts this regex directly.
- Game routing and Socket.IO room logic that uses `gameId` as the room name are unaffected.

### Verification

```sh
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

Target test: `socket.test.js` — UUID_V4 regex assertion must pass.  
All 18 tests must pass.

### Rollback condition

Any of the 18 tests fails, or `npm install` cannot resolve `uuid@9.x` in the
legacy container.

### Recovery action

```sh
git revert HEAD --no-edit
```

### Commit message template

```
refactor(game): replace node-uuid with uuid@9 (F-11)

node-uuid@1.4.x is the deprecated predecessor of uuid. The import and
call site change to use uuid@9's named v4 export. UUID format is
identical. All 18 behavioral tests pass.
```

### Branch name

`modernize/step-2-uuid`

---

## Step 3 — Replace `node-expression-eval` with `expr-eval` (Finding F-12)

### What and why

`node-expression-eval@0.1.x` is a thin npm wrapper around an arithmetic expression
evaluator that has had no releases since 2013. `expr-eval@2.x` is the actively
maintained continuation of the same codebase (same author lineage, same operator
semantics). The API surface used here — `parser.evaluate(expr)` — exists in both
packages but the import path changes.

This step touches the core game mechanic. The `try/catch` that turns parse errors
into `invalidExpr { msg: 'Invalid.' }` must be preserved exactly.

### Files changed

| File | Change |
|---|---|
| `server/game/index.js` | Change `require('node-expression-eval')` and the evaluate call |
| `package.json` | Remove `node-expression-eval`, add `expr-eval@2.x` |

### Exact change

`server/game/index.js` line 12 — from:

```js
var parser = require('node-expression-eval');
```

to:

```js
var Parser = require('expr-eval').Parser;
var parser = new Parser();
```

`server/game/index.js` line 65 — the evaluate call is unchanged in shape:

```js
data.evaluated = parser.evaluate(data.expression);
```

This call works identically with `expr-eval@2.x` because `Parser` instances expose
`.evaluate(expr)`. No other line changes.

`package.json` — in `"dependencies"`:

```diff
-    "node-expression-eval": "0.1.x",
+    "expr-eval": "2.x",
```

### Behavior preserved

- `evaluatedExpr.evaluated === 15` for expression `1+3+4+7` (non-winning).
- `evaluatedExpr.evaluated === 24` for expression `7*4-3-1` (winning).
- Malformed expressions (e.g. `(1+3+4+7` — unmatched parenthesis) still throw
  inside the `try` block and produce `invalidExpr { msg: 'Invalid.' }`.
- Operator precedence: `*` and `/` bind tighter than `+` and `-`. This is the
  same in both packages and in standard arithmetic.

### Verification

```sh
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

Target tests: `game-events.test.js` —
- "a valid non-winning expression produces evaluatedExpr" (`evaluated === 15`)
- "a winning expression ends the round" (`evaluated === 24`)
- "an unparseable but legal-character expression produces invalidExpr 'Invalid.'"

All 18 tests must pass.

### Rollback condition

Any evaluated value differs, or the `Invalid.` path stops triggering, or any of
the 18 tests fails.

### Recovery action

```sh
git revert HEAD --no-edit
```

### Commit message template

```
refactor(game): replace node-expression-eval with expr-eval@2 (F-12)

node-expression-eval@0.1.x is unmaintained since 2013. expr-eval@2.x
is the maintained continuation of the same codebase. Import path and
Parser instantiation updated; evaluate() call is unchanged. All 18
behavioral tests pass. Arithmetic results and error paths verified.
```

### Branch name

`modernize/step-3-expr-eval`

---

## Step 4 — Decouple server start from module load (Finding F-13)

### What and why

`index.js` does `require('./server')`, which causes `server/index.js` to bind the
HTTP server and Socket.IO to a port as a side-effect of being loaded. This makes
it impossible for a future test harness to `require` the server module without
immediately starting a listener on a random port. Wrapping startup in an exported
`start()` function separates module loading from I/O, while keeping the public
`npm start` path (via `index.js`) identical.

### Files changed

| File | Change |
|---|---|
| `server/index.js` | Wrap `http.createServer(...).listen(...)` and Socket.IO attachment inside `module.exports.start()`; expose `server` and `io` on the export for programmatic shutdown |
| `index.js` | Call `require('./server').start()` instead of just `require('./server')` |

### Exact change

`index.js` — from:

```js
var server = require('./server');
```

to:

```js
require('./server').start();
```

`server/index.js` — everything from the `http.createServer` line through the end
of the file (lines 43–107) moves into a `start` function. The module-level
declarations (`app`, `gameList`, `numConnections`, `config`) remain at module
scope. The export becomes:

```js
function start() {
    var server = http.createServer(app).listen(app.get('port'), function () {
        console.log('\nExpress server listening port ' + app.get('port') + '\n');
    });

    var io = require('socket.io').listen(server);

    io.configure('development', function () {
        io.set('origins', 'http://localhost:' + app.get('port'));
    });
    io.configure('production', function () {
        io.set('origins', 'http://get24.jit.su:80');
    });

    io.sockets.on('connection', /* ... unchanged ... */);

    process.on('SIGINT', function () {
        console.log('\nSIGINT signal received. Shutting down gracefully.');
        process.exit();
    });

    return { server: server, io: io };
}

module.exports = { start: start };
```

The `app.configure` and middleware setup remain at module scope (before `start()`),
so Express is still fully configured before `listen()` is called.

### Behavior preserved

- `npm start` (`node index.js`) starts the server identically.
- The HTTP server listens on `process.env.PORT || config.port`.
- All Socket.IO events, middleware, and game logic are unchanged.
- All 18 tests use `spawn` to start the server as a subprocess via `node index.js`,
  so they are unaffected by this internal reorganization.

### Verification

```sh
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

All 18 tests must pass. The harness boots the server via `spawn(..., ['index.js'])`,
which calls `start()` through the updated `index.js`.

### Rollback condition

Any of the 18 tests fails, or the server does not bind within the 20 s startup
timeout in `harness.js`.

### Recovery action

```sh
git revert HEAD --no-edit
```

### Commit message template

```
refactor(server): decouple start from module load (F-13)

Wraps http.createServer().listen() and socket.io setup inside an
exported start() function. index.js calls require('./server').start().
npm start is unchanged. Enables future programmatic test setup without
spawn. All 18 behavioral tests pass.
```

### Branch name

`modernize/step-4-server-decouple`

---

## Step 5 — Upgrade Express 3 → Express 4 (Findings F-02, F-03, F-04, F-05, F-10)

### What and why

Express 3.0.6 cannot run on Node.js 20 LTS. Its `app.configure()` method does not
exist in Express 4. The three built-in middleware helpers it uses
(`express.favicon()`, `express.logger()`, `express.errorHandler()`) were extracted
to separate npm packages in Express 4. All four `http.test.js` tests exercise
Express directly and must pass after this step.

**This step must be executed after Step 4.** The `start()` function introduced in
Step 4 contains all the Express boot code, making it easier to audit the upgrade
in isolation.

### Files changed

| File | Change |
|---|---|
| `server/index.js` | Remove `app.configure()` wrappers; inline middleware calls; replace three removed helpers |
| `package.json` | Change `"express": "3.0.x"` → `"express": "4.x"`; add `serve-favicon`, `morgan`, `errorhandler` |

### Exact change

`package.json` — in `"dependencies"`:

```diff
-    "express": "3.0.x",
+    "express": "4.x",
+    "serve-favicon": "2.x",
+    "morgan": "1.x",
+    "errorhandler": "1.x",
```

`server/index.js` — at the top, add requires for the three replacement packages:

```js
var favicon = require('serve-favicon');
var logger = require('morgan');
var errorHandler = require('errorhandler');
```

Replace the two `app.configure()` blocks (lines 30–40 in the original):

```js
// REMOVE:
app.configure(function () {
    app.set('port', process.env.PORT || config.port);
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.static(path.join(__dirname, '..', 'public')));
});
app.configure('development', function () {
    app.use(express.errorHandler());
});

// REPLACE WITH:
app.set('port', process.env.PORT || config.port);
app.use(favicon(path.join(__dirname, '..', 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));
if (app.get('env') === 'development') {
    app.use(errorHandler());
}
```

Note: `serve-favicon` requires an explicit path. If `public/favicon.ico` does not
exist, the middleware is simply omitted — the original `express.favicon()` served
a default icon when no file was present. Confirm presence of `public/favicon.ico`
before execution; if absent, omit the `favicon` line.

No other changes in this step. Socket.IO wiring is untouched.

### Behavior preserved

- `GET /` returns 200 with `Content-Type: text/html`.
- Every static asset (`/css/styles.css`, `/js/*.js`) returns 200.
- `/socket.io/socket.io.js` returns 200 (served by Socket.IO, not Express static).
- Unknown paths return 404.
- All four `http.test.js` tests must pass.
- Socket.IO layer (steps 6's territory) is not touched.

### Verification — two-stage

**Stage A — legacy runtime (confirm no http regression):**

```sh
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

All 18 tests must pass (note: socket tests run against socket.io 0.9 still at
this point).

**Stage B — modern runtime (confirm Express 4 boots on Node 20):**

```sh
docker run --rm -v "${PWD}:/app" -w /app node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; node index.js &
           sleep 2 && curl -sf http://localhost:4000/ | grep -q 'Get24' && echo 'Express 4 OK on Node 20'"
```

Expected: `Express 4 OK on Node 20` printed, exit 0.

### Rollback condition

Any `http.test.js` test fails, or the server throws on boot, or `GET /` returns
anything other than 200 with the Get24 HTML.

### Recovery action

```sh
git revert HEAD --no-edit
```

### Commit message template

```
refactor(server): upgrade Express 3 → Express 4 (F-02,F-03,F-04,F-05,F-10)

Removes app.configure() wrappers (removed in Express 4). Replaces
express.favicon() → serve-favicon, express.logger() → morgan,
express.errorHandler() → errorhandler. Middleware order preserved.
Express 4 boots on Node 20 LTS. All 18 behavioral tests pass on
Node 6 legacy runtime.
```

### Branch name

`modernize/step-5-express4`

---

## Step 6 — Upgrade Socket.IO 0.9 → Socket.IO 4 (Findings F-06, F-07, F-08, F-09, F-21)

### What and why

Socket.IO 0.9.x cannot run on Node.js 20. Its `io.configure()` and `io.set()`
APIs were removed in Socket.IO 1.x. This is the highest-risk step in the plan:
the server-side event API (`socket.emit`, `socket.on`, `socket.broadcast`,
`socket.join`, `io.sockets.on`) is fully preserved in Socket.IO 4, but the
configuration idiom and the client bundle served at `/socket.io/socket.io.js`
both change.

The test harness (`legacy/get24-baseline/tests/harness.js`) uses
`socket.io-client@0.9.16` and relies on two internal APIs that do not exist in
Socket.IO 4:

- `socket.socket.connected` (the 0.9 client wraps the namespace object in an
  outer socket object — Socket.IO 4 exposes `socket.connected` directly)
- `CLIENT_IO.Transport.websocket = null` (0.9 transport-layer hack to force
  xhr-polling — Socket.IO 4 uses a different transport selection API)

**The harness must be updated in the same step as the server upgrade.** The
harness changes are test-only; no production file is touched by the harness edits.

Also in this step: replace the hard-coded `http://get24.jit.su:80` origin (F-21)
with an `ORIGIN` environment variable, defaulting to `*` in development.

### Files changed

| File | Change |
|---|---|
| `server/index.js` | Remove `io.configure()`/`io.set()`; replace with Socket.IO 4 constructor `cors` option; update `socket.disconnect()` → `socket.disconnect(true)` |
| `public/js/SocketController.js` | `io.connect('/')` → `io('/')` (deprecated in Socket.IO 3+) |
| `package.json` | `"socket.io": "0.9.x"` → `"socket.io": "4.x"` |
| `legacy/get24-baseline/tests/harness.js` | Update `socket.socket.connected` → `socket.connected`; replace Transport.websocket null-out with Socket.IO 4 transport restriction; update `socket.io-client` import path for v4 |
| `legacy/get24-baseline/tests/xhr-shim.js` | Verify or update if Socket.IO 4 client's xhr transport no longer uses the `xmlhttprequest` module (may become a no-op shim) |

### Exact changes

**`server/index.js`** — remove the `io.configure` blocks (lines 50–56 original):

```js
// REMOVE:
io.configure('development', function () {
    io.set('origins', 'http://localhost:' + app.get('port'));
});
io.configure('production', function () {
    io.set('origins', 'http://get24.jit.su:80');
});

// REPLACE WITH (inside start()):
// Socket.IO 4 CORS is configured at construction time:
var io = require('socket.io')(server, {
    cors: {
        origin: process.env.ORIGIN || (app.get('env') === 'production'
            ? false
            : '*'),
        methods: ['GET', 'POST']
    }
});
```

Remove the separate `var io = require('socket.io').listen(server);` line.

**`server/index.js`** — `accept()` function, line 97:

```diff
-        socket.disconnect();
+        socket.disconnect(true);
```

**`public/js/SocketController.js`** — line 17:

```diff
-            socket = io.connect('/');
+            socket = io('/');
```

**`package.json`**:

```diff
-    "socket.io": "0.9.x",
+    "socket.io": "4.x",
```

**`legacy/get24-baseline/tests/harness.js`** — Socket.IO 4 client API:

The `socket.io-client` bundled inside `socket.io@4.x` is version 4.x. The import
path, the transport restriction mechanism, and the `connected` flag location all
change. The exact harness edits must be determined during execution by reading the
Socket.IO 4 client API. The invariants the harness must still satisfy are:

- `socket.connected === true` after a successful connect (replaces `socket.socket.connected`)
- Transport must be forced to polling to avoid the websocket Origin issue
  (Socket.IO 4 uses `transports: ['polling']` in the connect options)
- The `xmlhttprequest` shim may be unnecessary if Socket.IO 4's xhr transport
  uses `node-fetch` or the native `http` module instead of `xmlhttprequest`

**Event contract — must not change:**

| Direction | Event | Payload keys | Test file |
|---|---|---|---|
| server → client | `connected` | `{ numUsers }` | `socket.test.js` |
| server → client | `overCapacity` | `{}` | `game-events.test.js` |
| server → client | `gameJoined` | `{ room, card, numPlayers }` | `socket.test.js` |
| server → client | `playerJoined` | `{ numPlayers }` | `game-events.test.js` |
| server → client | `playerQuit` | `{ numPlayers }` | `game-events.test.js` |
| server → client | `evaluatedExpr` | `{ evaluated }` | `game-events.test.js` |
| server → client | `invalidExpr` | `{ msg }` | `game-events.test.js` |
| server → client | `timer` | `{ time }` | `socket.test.js` |
| server → client | `roundOver` | `{ type, card }` or `{ type, card, expression }` | `game-events.test.js` |
| client → server | `submitExpression` | `{ expression }` | `game-events.test.js` |

**None of these event names or payload keys may change.**

### Verification — two-stage

**Stage A — updated harness against Node 20:**

```sh
docker run --rm -v "${PWD}:/app" -w /app node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

All 18 tests must pass on Node 20. This is the primary milestone for Step 6.

**Stage B — regression check on Node 6 (optional, informational):**

Socket.IO 4 no longer supports Node 6, so this is expected to fail with a
compatibility error. This is acceptable — the legacy runtime is being retired.
Document the failure mode rather than treating it as a regression.

### Rollback condition

Any of the 18 tests fails on Node 20 after the server and harness are updated.

### Recovery action

```sh
git revert HEAD --no-edit
# This reverts both server/index.js, SocketController.js, package.json,
# and the harness changes in one operation because they are one commit.
```

### Commit message template

```
refactor(server): upgrade Socket.IO 0.9 → 4 (F-06,F-07,F-08,F-09,F-21)

Removes io.configure()/io.set() (removed in Socket.IO 1.x). Replaces
with Socket.IO 4 constructor cors option. Updates socket.disconnect()
to disconnect(true). Replaces hard-coded jit.su origin with ORIGIN env
var. Updates SocketController.js io.connect('/') → io('/').
Updates test harness for Socket.IO 4 client API.
All 18 behavioral tests pass on Node 20 LTS.
```

### Branch name

`modernize/step-6-socketio4`

---

## Step 7 — KineticJS → Konva.js + fix F-16 + fix F-17 (Findings F-16, F-17, F-20)

### What and why

KineticJS 4.6.0 was abandoned in 2015. Its successor Konva.js is API-compatible
for the operations used in `StageController.js` with two known breaking differences
(`shadowOffset` format and `Tween` constructor property names). This step also
fixes two existing client-side bugs that were documented in the ASSESS:

- **F-16**: `helpDialog.toggle()` references `layer` which is not defined in
  scope — must be `activeLayer`.
- **F-17**: `blink || true` always forces blink on, ignoring the caller's
  `false` argument.

This step is **client-only**: no file in `server/` or `index.js` is touched. The
existing 18 tests do not cover client-side rendering. Their HTTP tests that assert
the old filename `js/kinetic-v4.6.0.min.js` and the string `'Kinetic'` in the
static file will fail unless the `http.test.js` assertions are updated as part of
this same commit.

### Files changed

| File | Change |
|---|---|
| `public/js/kinetic-v4.6.0.min.js` | Remove (or keep alongside for reference) |
| `public/js/konva.min.js` | Add — Konva.js latest minified bundle |
| `public/index.html` | Update script `src` from `kinetic-v4.6.0.min.js` to `konva.min.js` |
| `public/js/StageController.js` | Update all KineticJS API calls for Konva.js compatibility; fix F-16 `layer` → `activeLayer`; fix F-17 `blink || true` → `blink !== false` |
| `legacy/get24-baseline/tests/http.test.js` | Update filename and string assertions from KineticJS to Konva |

### Key API differences between KineticJS 4.6.0 and Konva.js

| KineticJS 4.6.0 | Konva.js equivalent |
|---|---|
| `new Kinetic.Stage(…)` | `new Konva.Stage(…)` |
| `new Kinetic.Layer()` | `new Konva.Layer()` |
| `new Kinetic.Group(…)` | `new Konva.Group(…)` |
| `new Kinetic.Text(…)` | `new Konva.Text(…)` |
| `new Kinetic.Rect(…)` | `new Konva.Rect(…)` |
| `new Kinetic.Animation(fn, layer)` | `new Konva.Animation(fn, layer)` |
| `new Kinetic.Tween({node, duration, easing, x})` | `new Konva.Tween({node, duration, easing, x})` |
| `shadowOffset: [0, 7]` | `shadowOffset: { x: 0, y: 7 }` — **breaking** |
| `Kinetic.Easings.EaseIn` | `Konva.Easings.EaseIn` |
| `.getWidth()` / `.getHeight()` | `.width()` / `.height()` — Konva uses method chaining |
| `.setX(v)` / `.setY(v)` | `.x(v)` / `.y(v)` |
| `.setFill(v)` | `.fill(v)` |
| `.setText(v)` | `.text(v)` |
| `.setVisible(v)` | `.visible(v)` |
| `.getVisible()` | `.visible()` |
| `.setOpacity(v)` | `.opacity(v)` |
| `io.connect('/')` in SocketController | Already updated in Step 6 |

### Exact bug fixes

**F-16** — `public/js/StageController.js` line 98:

```diff
-    if (helpDialog.status) layer.add(helpDialog);
+    if (helpDialog.status) activeLayer.add(helpDialog);
```

**F-17** — `public/js/StageController.js` line 281:

```diff
-    var willBlink = blink || true;
+    var willBlink = blink !== false;
```

### http.test.js assertions to update

`legacy/get24-baseline/tests/http.test.js` — `GET / serves every static asset` test:

```diff
-    ['/js/kinetic-v4.6.0.min.js', /javascript/, ['Kinetic']],
+    ['/js/konva.min.js', /javascript/, ['Konva']],
```

`GET /` content checks: the HTML comment `kinetic-v4.6.0.min.js` in `index.html`
will change; update the assertion in `http.test.js` accordingly.

### Behavior preserved

- `GET /` returns 200 with the correct HTML (updated filename reference).
- All static assets return 200 — same assets, new Konva filename.
- The Socket.IO client bundle at `/socket.io/socket.io.js` is unaffected.
- 404 for unknown paths is unaffected.
- All 14 socket and game-events tests are **completely unaffected** (client-only
  change; game logic is untouched).

### Verification

```sh
docker run --rm -v "${PWD}:/app" -w /app node:20 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

All 18 tests must pass (4 HTTP + 14 socket/game, all on Node 20 at this point).

Additionally, manual browser verification is required for visual correctness:
- Title and description render on the splash screen.
- Play and Help buttons are clickable.
- Clicking Help opens the dialog without a ReferenceError.
- After clicking Play, the four digit cards animate onto screen.
- The timer ticks.
- Submitting a non-winning expression blinks the evaluation result.
- Submitting a winning expression shows the win message.
- The losing player's expression does **not** blink (F-17 fix verified).

### Rollback condition

Any of the 18 automated tests fails, or the browser shows a JavaScript error on
load.

### Recovery action

```sh
git revert HEAD --no-edit
```

### Commit message template

```
refactor(client): replace KineticJS 4.6 with Konva.js (F-16,F-17,F-20)

Removes the abandoned KineticJS 4.6.0 bundle. Adds Konva.js (maintained
fork of KineticJS). Updates all Kinetic.* constructors and method calls
to Konva equivalents. Fixes shadowOffset array→object format. Fixes
F-16: helpDialog.toggle() layer reference → activeLayer. Fixes F-17:
blink||true → blink!==false so showRoundOver can suppress blinking.
Updates http.test.js filename and string assertions. All 18 behavioral
tests pass. Visual behavior manually verified in browser.
```

### Branch name

`modernize/step-7-konva`

---

## Summary table

| Step | Candidate | Finding(s) | Files | Risk | Verify target |
|---|---|---|---|---|---|
| 1 | F — type guard | F-18 | `server/game/index.js` | Negligible | 18/18 on Node 6 |
| 2 | C — node-uuid → uuid | F-11 | `server/game/index.js`, `package.json` | Low | 18/18 on Node 6 |
| 3 | D — node-expression-eval → expr-eval | F-12 | `server/game/index.js`, `package.json` | Medium | 18/18 on Node 6 |
| 4 | E — server start decouple | F-13 | `server/index.js`, `index.js` | Low-Medium | 18/18 on Node 6 |
| 5 | A — Express 3 → 4 | F-02,F-03,F-04,F-05,F-10 | `server/index.js`, `package.json` | Medium | 18/18 on Node 6 + boot on Node 20 |
| 6 | B — Socket.IO 0.9 → 4 | F-06,F-07,F-08,F-09,F-21 | `server/index.js`, `public/js/SocketController.js`, `package.json`, harness | High | 18/18 on Node 20 |
| 7 | G — KineticJS → Konva | F-16,F-17,F-20 | `public/js/*`, `public/index.html`, `http.test.js` | Medium-High | 18/18 on Node 20 + browser |

---

## Findings deferred from this plan

The following findings from ASSESS are acknowledged but not scheduled for
implementation in this plan. They do not block the modernization sequence and
carry low or negligible risk.

| Finding | Reason deferred |
|---|---|
| F-01 Engine field `"node": "0.8.x"` | Update `package.json` `engines` field to `"node": ">=20"` in the same commit as Step 6, once Node 20 is proven. Not a separate step. |
| F-14 Global `gameList` / `numConnections` | Architectural refactor beyond the scope of dependency modernization. Deferred to a future phase. |
| F-15 Timer `clearInterval` on exit | Low priority. Add `timer.stop()` to game cleanup in a future quality pass. |
| F-19 Port mismatch README vs config | Fix `README.md` in the same commit as Step 5 or 6, as a one-line documentation correction. Not a separate step. |
| F-22 No `package-lock.json` | Add `package-lock.json` to the commit that installs the final modern dependency set (after Step 6). |

---

## What this plan does not do

- It does not modify any application behavior.
- It does not add features.
- It does not change game rules, card data, or scoring logic.
- It does not touch `legacy/get24-baseline/tests/` except where the test harness
  must be updated in Step 6 and Step 7 to remain accurate against the new stack.
- It does not merge to `main` — each step is a commit on `baseline/import-get24`
  or a feature branch rebased onto it.
- It does not proceed to Execute without an explicit instruction.

---

*Plan produced by IBM Bob — no production code modified.*

`PLAN COMPLETE — NO PRODUCTION CODE MODIFIED`
