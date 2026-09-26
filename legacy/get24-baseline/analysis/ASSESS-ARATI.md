# Legacy Analysis + Risk Review — Get24
### Legacy Code Whisperer · Team Codexmatrix · IBM Bob 2.0 Hackathon

**Author:** Arati (Legacy Analysis + Risk role) — IBM Bob IDE  
**Branch:** `arati/risk-analysis` (based on `baseline/import-get24`)  
**Baseline commit:** `3889bec` (Step 2 — uuid applied)  
**Steps already applied at this revision:** Step 1 (F-18 type guard), Step 2 (node-uuid → uuid@9.0.1)  
**Reference:** [`ASSESS.md`](../../ASSESS.md) (Nidhi/OpenCode) · [`PLAN.md`](../../PLAN.md) (Nidhi/OpenCode)  
**Safety net:** 18/18 tests — not touched by this document

> This document is a **code-verified supplement** to the existing `ASSESS.md`.
> It adds per-finding code evidence (exact file + line), step-status tracking,
> test-harness impact analysis for the two highest-risk remaining steps,
> and a prioritised risk table for the work that still lies ahead.
> It does not repeat information that ASSESS.md already covers accurately.
> No production code is modified.

---

## 1. Current State After Steps 1 and 2

The two lowest-risk findings have been resolved. This section records exactly what changed so the test harness and the demo narrative stay accurate.

### Step 1 — F-18 resolved: `validate()` type guard ✅

**File:** [`server/game/index.js`](../../server/game/index.js) line 61  
**Evidence in current code:**
```js
socket.on('submitExpression', function (data) {
    if (typeof data.expression !== 'string') return;   // ← added by Step 1
    var res = validate(data.expression);
```
**Behavioral impact:** A malformed client payload (missing or non-string `expression`) now returns silently instead of crashing the handler with a TypeError at `temp.search()` (line 95). All 18 safety net tests pass unchanged.

---

### Step 2 — F-11 resolved: `node-uuid` → `uuid@9.0.1` ✅

**File:** [`server/game/index.js`](../../server/game/index.js) lines 13 and 21  
**File:** [`package.json`](../../package.json) line 12  
**Evidence in current code:**
```js
// server/game/index.js line 13
var uuidv4 = require('uuid').v4;

// server/game/index.js line 21
var gameId = uuidv4();
```
```json
// package.json line 12
"uuid": "9.0.1"
```
**Behavioral impact:** UUID v4 format is identical. `socket.test.js` UUID_V4 regex assertion (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) still passes. All 18 tests pass unchanged.

---

## 2. Remaining Open Findings — Code Evidence

For each finding still open, this section provides the exact code location so any developer can verify the risk claim without reading the whole file.

---

### F-12 — `node-expression-eval@0.1.x` unmaintained · **MEDIUM risk** · Step 3

**File:** [`server/game/index.js`](../../server/game/index.js) lines 12 and 66  
**Evidence:**
```js
// line 12 — still the unmaintained package
var parser = require('node-expression-eval');

// line 66 — the call that must survive the replacement
try { data.evaluated = parser.evaluate(data.expression); }
catch(e) {
    passedEval = false;
    socket.emit('invalidExpr', {msg: 'Invalid.'});
}
```
**Why it matters:** `node-expression-eval@0.1.0` was published in 2013 and has no releases since. It has no verifiable CVE history because it is too obscure to appear in advisory databases. The replacement (`expr-eval@2.x`) is the maintained continuation of the same arithmetic-evaluator codebase.

**Regression risk — specific to this code:** The `try/catch` wraps only the `parser.evaluate()` call. If `expr-eval` throws a different error class or a string (not an `Error` object), the catch still fires and the behavior is preserved. The real risk is operator-precedence or whitespace handling differences.

**Tests that protect this change:**
- `game-events.test.js` — "a valid non-winning expression produces evaluatedExpr" → `data.evaluated === 15` for `1+3+4+7`
- `game-events.test.js` — "a winning expression ends the round" → `data.evaluated === 24` for `7*4-3-1`
- `game-events.test.js` — "an unparseable but legal-character expression produces invalidExpr 'Invalid.'" → `(1+3+4+7` (unmatched paren) must still reach the catch block

**What has no test coverage:** Division by zero (e.g. `1/(3-3)+4+7`). Both `node-expression-eval` and `expr-eval` will throw, but the error message in `invalidExpr` is `'Invalid.'` — as long as the catch fires, behavior is preserved. No test asserts this case.

---

### F-13 — Server start is a module side-effect · **MEDIUM risk** · Step 4

**File:** [`index.js`](../../index.js) line 1  
**File:** [`server/index.js`](../../server/index.js) lines 43–44  
**Evidence:**
```js
// index.js line 1 — require triggers HTTP bind immediately
var server = require('./server');

// server/index.js lines 43–44 — the side-effect
var server = http.createServer(app).listen(app.get('port'), function() {
    console.log('\nExpress server listening port ' + app.get('port') + '\n');
});
```
**Why it matters:** Every test in the safety net works around this by spawning a separate child process (`child_process.spawn` in `harness.js` line 129). This adds ~200–500 ms of startup overhead per test and prevents parallel test execution. After Step 4 (server start decoupling), the harness could switch to `require`-based startup, eliminating the spawn cost.

**Harness evidence — current workaround:**
```js
// harness.js line 129
var proc = spawn(process.execPath, ['-r', PRELOAD, path.join(APP_DIR, 'index.js')], {
    cwd: APP_DIR, env: env, stdio: ['ignore', 'pipe', 'pipe']
});
```
**Regression risk specific to this code:** After decoupling, `index.js` must call `require('./server').start()` and the `start()` function must attach Socket.IO listeners *before* calling `listen`. If Socket.IO is attached *after* `listen` there is a race window where a connection arrives before handlers are registered. The current code is sequential (both happen in the same synchronous block) and that ordering must be preserved exactly.

---

### F-14 — Global mutable `gameList` and `numConnections` · **MEDIUM risk** · Step 4 / future

**File:** [`server/index.js`](../../server/index.js) lines 25–26  
**Evidence:**
```js
/** List of stored game obects and global connection counter */
var gameList = [];
var numConnections = 0;
```
**Why it matters:** These are module-level variables. Once the server module is required, they persist for the lifetime of the process. There is no API to reset them. The test harness works around this by spawning a fresh process per test (so a clean module is loaded each time). After Step 4 decoupling, if a test suite starts and stops the server in-process, these globals will accumulate across tests unless explicitly reset or encapsulated.

**Also noted:** `numConnections` is decremented in the global `socket.on('disconnect')` handler (line 84) and incremented in `accept()` (line 92). `gameList` is never pruned — completed or empty games remain in the array forever. Under long-running load this is a memory leak, but it is pre-existing behavior that the safety net does not test for.

**Test coverage note:** The capacity test (`game-events.test.js` line 177) exercises the `numConnections` logic. It works only because each test gets a fresh server process where `numConnections` starts at 0.

---

### F-15 — `setInterval` not cleared on process exit · **LOW risk** · Step 4 / future

**File:** [`server/game/timer.js`](../../server/game/timer.js) lines 77–78  
**File:** [`server/index.js`](../../server/index.js) lines 103–106  
**Evidence:**
```js
// timer.js line 77 — interval is stored but never given to the outer scope
timerInterval = setInterval(tick, resolution);

// server/index.js lines 103–106 — SIGINT handler calls process.exit directly
process.on('SIGINT', function() {
    console.log('\nSIGINT signal received. Shutting down gracefully.');
    process.exit();
});
```
**Why it matters:** `process.exit()` tears down the process regardless of open handles, so in production the leak is invisible. In test teardown, if the server is ever run in-process (after Step 4), the active `setInterval` will keep the Node.js event loop alive after `server.close()` is called, causing tests to hang unless `clearInterval` is called explicitly. The current test harness avoids this by killing the child process (`proc.kill()`).

**What is tested:** The timer expiry test (`game-events.test.js` line 160) sets `initialTimer: 3` and waits for `roundOver`. It verifies that the interval fires and loops. It does not verify clean teardown.

---

### F-02 / F-03 / F-04 / F-05 / F-10 — Express 3 boot failure · **HIGH risk** · Step 5

**File:** [`server/index.js`](../../server/index.js) lines 29–40  
**Evidence — complete block that must be replaced:**
```js
// lines 29–35: app.configure() — does not exist in Express 4
var app = express();
app.configure(function () {
    app.set('port', process.env.PORT || config.port);
    app.use(express.favicon());       // removed in Express 4 → serve-favicon
    app.use(express.logger('dev'));   // removed in Express 4 → morgan
    app.use(express.static(path.join(__dirname, '..', 'public')));
});

// lines 37–40: configure('development') — does not exist in Express 4
app.configure('development', function () {
    app.use(express.errorHandler());  // removed in Express 4 → errorhandler
});
```
**What `app.configure()` did:** In Express 3 it was a thin wrapper: `app.configure(fn)` called `fn()` unconditionally; `app.configure('development', fn)` called `fn()` only when `app.get('env') === 'development'`. The Express 4 equivalent is just inline code with a conditional.

**Exact Express 4 replacement pattern:**
```js
var app = express();
app.set('port', process.env.PORT || config.port);
app.use(require('serve-favicon')(path.join(__dirname, '..', 'public', 'favicon.ico')));
app.use(require('morgan')('dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));
if (app.get('env') === 'development') {
    app.use(require('errorhandler')());
}
```
**Additional packages needed:** `serve-favicon`, `morgan`, `errorhandler` — none are currently in `package.json`.

**Tests that protect this step:**
- `http.test.js` — all 4 tests: `GET /` HTML content, every static asset including `favicon.ico`, Socket.IO 0.9 client build, 404 for unknown path.
- The `favicon.ico` test (`http.test.js` line 44) asserts status 200. `serve-favicon` requires the file to exist at the path given. If `public/favicon.ico` does not exist, this test will fail on Express 4. **Action required before Step 5:** verify `public/favicon.ico` exists.

**Favicon file check:**
```
public/
  css/styles.css
  index.html
  js/kinetic-v4.6.0.min.js
  js/SocketController.js
  js/StageController.js
```
`public/favicon.ico` is **not present** in the repository. Express 3's `express.favicon()` served a built-in default when no path was given. `serve-favicon` has no built-in default — it requires an explicit file path. **This is a new gap not called out in ASSESS.md or PLAN.md.** Step 5 must either add a `favicon.ico` to `public/` or update the `http.test.js` assertion for that asset.

---

### F-06 / F-07 / F-08 / F-09 — Socket.IO 0.9 boot failure · **HIGH risk** · Step 6

**File:** [`server/index.js`](../../server/index.js) lines 48–56  
**Evidence — complete block that must be replaced:**
```js
// line 48 — Socket.IO 0.9 listen API (preserved through Socket.IO 4, no change needed)
var io = require('socket.io').listen(server);

// lines 50–52 — io.configure() removed in Socket.IO 1.x
io.configure('development', function () {
    io.set('origins', 'http://localhost:' + app.get('port'));
});

// lines 54–56 — io.configure() + defunct Nodejitsu URL
io.configure('production', function () {
    io.set('origins', 'http://get24.jit.su:80');
});
```
**Exact Socket.IO 4 replacement pattern:**
```js
var io = require('socket.io')(server, {
    cors: {
        origin: process.env.ORIGIN || 'http://localhost:' + app.get('port'),
        methods: ['GET', 'POST']
    }
});
```

**`socket.disconnect()` change — line 97:**
```js
// current (Socket.IO 0.9 — line 97)
socket.disconnect();

// required for Socket.IO 4
socket.disconnect(true);
```
Without `true`, Socket.IO 4's `disconnect()` only closes the namespace connection, not the underlying transport, so the capacity-rejection guard does not actually drop the client.

---

#### Test harness impact for Step 6 — detailed

This is the highest-risk step. The safety net makes three assumptions about socket.io-client internals that **will break** when upgrading to Socket.IO 4:

**Break 1 — `a.socket.socket.connected` path (socket.test.js line 16, game-events.test.js line 198)**

```js
// socket.test.js line 16 — current
assert.strictEqual(a.socket.socket.connected, true, 'client should report itself connected');

// game-events.test.js line 198 — current
assert.strictEqual(c.socket.socket.connected, false, 'the rejected socket should be disconnected');
```
In socket.io-client 0.9.x, `socket` is a namespace object wrapping an underlying manager socket. In socket.io-client 4.x the namespace socket IS the socket object — the double `.socket.socket` path does not exist.

**Required fix:** `a.socket.socket.connected` → `a.socket.connected`

**Break 2 — `CLIENT_IO.Transport.websocket = null` (harness.js line 60)**

```js
// harness.js line 60 — current
CLIENT_IO.Transport.websocket = null;
```
This patch removes the websocket transport from the test process's copy of socket.io-client 0.9.x to force xhr-polling. The socket.io-client 4.x internal API does not have a `Transport` object on `io.js`. The transport restriction will need to use socket.io-client 4.x's connection options:
```js
// socket.io-client 4.x equivalent
CLIENT.connect(url, { transports: ['polling'] });
```

**Break 3 — `io.connect('/')` in SocketController.js (client-side, no server test)**

```js
// public/js/SocketController.js line 17
socket = io.connect('/');
```
`io.connect` was deprecated in Socket.IO 3 and removed in Socket.IO 4. The replacement is `io('/')`. This is a client-side file with no server-side test coverage, but it would break the actual browser game after upgrading.

**What is NOT broken by Step 6:**  
The nine event names (`connected`, `overCapacity`, `gameJoined`, `playerJoined`, `playerQuit`, `evaluatedExpr`, `invalidExpr`, `timer`, `roundOver`) and every payload key are preserved in Socket.IO 4. `socket.emit`, `socket.on`, `socket.broadcast`, `socket.join` all work identically.

---

### F-16 — `layer` ReferenceError in `helpDialog.toggle()` · **LOW risk** · Step 7

**File:** [`public/js/StageController.js`](../../public/js/StageController.js) line 98  
**Evidence:**
```js
helpDialog.toggle = function () {
    helpDialog.status = !helpDialog.status;
    if (helpDialog.status) layer.add(helpDialog);  // ← ReferenceError: layer is not defined
    else helpDialog.remove();
    activeLayer.draw();
};
```
`layer` is not declared anywhere in the file. The variable holding the active canvas layer is `activeLayer` (declared at line 36). Fix: replace `layer` with `activeLayer` on line 98.

**Test coverage:** None — the 18 safety net tests cover server-side behavior only. This bug is verified by code inspection.

---

### F-17 — `blink || true` ignores the `blink` parameter · **LOW risk** · Step 7

**File:** [`public/js/StageController.js`](../../public/js/StageController.js) line 281  
**Evidence:**
```js
// line 281 — always true, blink argument is never honored
var willBlink = blink || true;

// line 312 — caller passes false to suppress blink, but it is ignored
this.showEvaluatedText(data.expression, '#dd0000', false, 5000);
```
`false || true` evaluates to `true`. The losing player's expression is always shown blinking, even though the caller explicitly passes `false`. Fix: `var willBlink = (blink !== false);`

**Test coverage:** None — client-side only. Verified by code inspection.

---

### F-20 — KineticJS 4.6.0 abandoned · **MEDIUM risk** · Step 7

**File:** [`public/js/StageController.js`](../../public/js/StageController.js) — throughout  
**File:** [`public/index.html`](../../public/index.html) line 12  
**Evidence:**
```html
<!-- index.html line 12 -->
<script type="text/javascript" src="js/kinetic-v4.6.0.min.js"></script>
```
KineticJS-specific API calls confirmed present in `StageController.js`:

| Line | API call | Konva.js status |
|------|----------|-----------------|
| 25 | `new Kinetic.Stage({...})` | `new Konva.Stage({...})` — same |
| 35 | `new Kinetic.Layer()` | `new Konva.Layer()` — same |
| 39 | `new Kinetic.Text({..., shadowOffset: [0,7], ...})` | **BREAKING** — Konva requires `shadowOffset: {x:0, y:7}` |
| 73 | `new Kinetic.Group({...})` | `new Konva.Group({...})` — same |
| 163 | `new Kinetic.Animation(fn, layer)` | `new Konva.Animation(fn, layer)` — same |
| 195 | `new Kinetic.Tween({..., easing: Kinetic.Easings.EaseIn, ...})` | `Kinetic.Easings` → `Konva.Easings` |
| 214 | `new Kinetic.Tween({..., onFinish: fn})` | same in Konva |

**Breaking API changes requiring code changes in StageController.js:**
1. `shadowOffset: [0, 7]` (array) → `shadowOffset: { x: 0, y: 7 }` (object) — used on lines 43, 149, 161
2. `Kinetic.Easings.EaseIn` → `Konva.Easings.EaseIn` — used on line 199
3. All `Kinetic.*` constructors → `Konva.*` — mechanical find-replace

**Test impact:** `http.test.js` line 42 asserts the string `'Kinetic'` appears in `StageController.js`:
```js
['/js/StageController.js', /javascript/, ['Kinetic']],
```
And line 24 asserts `'js/kinetic-v4.6.0.min.js'` appears in `index.html`:
```js
'js/kinetic-v4.6.0.min.js',
```
Both assertions must be updated when the Konva.js migration is done.

---

## 3. Missing Coverage — Gaps in the Safety Net

These behaviors exist in the code but have no test asserting them. They are regression risks for future modernization steps.

| Gap | File / Lines | Why it matters for modernization |
|-----|-------------|----------------------------------|
| **Game list never pruned** | `server/index.js` lines 61–80 | `gameList` grows without bound. An empty or finished game is never removed. Under load this leaks memory. No test exercises this. |
| **Timer does not tick when `initialTimer` is 0** | `server/game/timer.js` line 53 (`config.initialTime \|\| 0`) | If `config.initialTimer` is `0`, `initialTime` is set to `0`, the timer fires immediately on the first tick. Default is 300 so this is not a real scenario, but `\|\| 0` is a gotcha for anyone adding a "no timer" game mode. |
| **`getRandomCard()` called at Game construction time** | `server/game/index.js` line 22 | `var gameCard = getRandomCard()` runs during `new Game(io)` — before any player joins. The test harness seeds `Math.random` before spawn, so the first call consumes the first RNG value. This is documented in the tests but only as implicit knowledge. Any refactoring that delays card initialization would break the seeded test fixtures. |
| **`playerCount` can go negative** | `server/game/index.js` line 56 | `if (--playerCount === 0) gameTimer.reset()` — if the disconnect handler fires more times than `connectPlayer` ran (e.g. due to a Socket.IO reconnect race in future versions), `playerCount` goes negative and `isFull()` never returns `true`. No test exercises this. |
| **Division by zero in card expressions** | `server/game/index.js` line 66 | `parser.evaluate('1/(3-3)+4+7')` — valid characters, passes `validate()`, but throws at eval time. The `try/catch` correctly emits `invalidExpr { msg: 'Invalid.' }`. No test sends a division-by-zero expression. |
| **`overCapacity` advisory packet is undeliverable** | `server/index.js` lines 96–98 | `socket.emit('overCapacity')` is called then `socket.disconnect()` in the same tick. Over xhr-polling the packet is never sent before the connection drops. This is captured in the tests as expected behavior, but the `SocketController.js` client still shows an `alert()` for it — a UI path that is never exercised. |
| **No test for concurrent win submissions** | `server/game/index.js` line 130 | If two players submit a winning expression at nearly the same time, both `emitEvaluation` calls run before either `gameCard` reassignment completes. The second player could see the win branch emit `roundOver` with the same card the first player already replaced. This is a known Node.js single-threaded race that no test exercises. |

---

## 4. `validate()` Logic — Deeper Analysis

The existing ASSESS.md notes F-18 (type guard) but does not analyse the validation logic itself. This section provides that analysis since `validate()` is called on every player submission.

**File:** [`server/game/index.js`](../../server/game/index.js) lines 89–122

```js
function validate(expr) {
    var temp = expr;

    for (var i = 0; i < gameCard.length; i++) {
        var res = temp.search(gameCard[i]);  // (A)
        if (res < 0)
            return -1;
        else if (res < temp.length - 1 && !isNaN(parseInt(temp[res+1], 10)))
            return -3;                        // (B)
        else
            temp = temp.replace(temp[res],''); // (C)
    }
    // ...
}
```

**Three concrete code-level observations not in ASSESS.md:**

**(A) `temp.search(gameCard[i])` treats each digit as a regex pattern.**  
`String.prototype.search()` accepts a regex. Digits 0–9 have no regex special meaning, so this is safe for the current card format (4-digit strings). If cards ever included regex metacharacters (e.g. `.` or `*`), `search` would match unexpectedly. This is not a regression risk for the current data but is worth noting for any future card format change.

**(B) `temp[res+1]` combined-digit check has an edge case.**  
`res < temp.length - 1` guards against reading past the end. But if the digit being checked is the very last character of `temp`, `res === temp.length - 1`, so the combined-digit check is **skipped**. Consider `expr = '123+4'` with card `'1234'`: after stripping `1`, `2`, `3`, the remaining temp is `'+4'`. When searching for `4`, `res = 1`, `temp.length - 1 = 1`, so `res < temp.length - 1` is false — the combined check is skipped and the expression passes. This is correct behavior (`4` is the last digit and is isolated), but it demonstrates the guard is subtler than it appears.

**(C) `temp.replace(temp[res], '')` replaces only the first occurrence.**  
`String.prototype.replace(string, '')` replaces the first occurrence of the literal character. For a card like `'1113'` (three 1s), the loop iterates three times over `'1'`. Each iteration strips one `1`. This correctly enforces "use each digit once" because `replace` is called once per loop iteration. The logic is correct, but it is not obvious — this is a risk for anyone refactoring `validate()` who might reach for `replaceAll`.

---

## 5. Prioritised Risk Table for Remaining Steps

| Step | Finding(s) | Risk | Key regression test(s) | New gap identified here |
|------|-----------|------|------------------------|------------------------|
| 3 | F-12 (expr-eval) | MEDIUM | `evaluatedExpr===15`, `evaluatedExpr===24`, `invalidExpr 'Invalid.'` | Division-by-zero path untested but protected by try/catch |
| 4 | F-13 (server decoupling) | LOW-MEDIUM | All 18 — startup ordering must be preserved | `gameList`/`numConnections` globals become visible if server is re-required in same process |
| 5 | F-02/F-03/F-04/F-05/F-10 (Express 4) | HIGH | All 4 `http.test.js` tests | **`public/favicon.ico` does not exist** — `serve-favicon` requires an explicit file; Express 3's built-in default silently served one |
| 6 | F-06/F-07/F-08/F-09 (Socket.IO 4) | HIGH | All 14 socket+game-events tests | Harness breaks at 3 points: `socket.socket.connected` path, `Transport.websocket = null` patch, `io.connect` → `io` in SocketController |
| 7 | F-16/F-17/F-20 (KineticJS→Konva) | MEDIUM-HIGH | `http.test.js` `'Kinetic'` string + filename assertions | `shadowOffset` array→object is a silent breakage; 3 lines in StageController use array form |

---

## 6. Step 5 Pre-condition: `favicon.ico` Must Be Added

**This is the most actionable new finding in this document.**

`PLAN.md` Step 5 does not mention the favicon problem. `ASSESS.md` F-03 notes the middleware change but does not call out that the file is missing.

- Express 3's `express.favicon()` with no arguments serves a built-in 16×16 ICO from memory. `http.test.js` asserts `GET /favicon.ico` returns status 200.
- `serve-favicon` (the Express 4 replacement) requires an explicit file path: `serveFavicon(path.join(__dirname, '..', 'public', 'favicon.ico'))`.
- `public/favicon.ico` does not exist in the repository.
- If Step 5 is executed without adding a favicon file, `serve-favicon` will throw at startup: `Error: ENOENT: no such file or directory`.

**Resolution options for Step 5 (decision for Nidhi):**
1. Add a minimal `public/favicon.ico` (can be a 1×1 transparent ICO, 70 bytes) before executing Step 5.
2. Serve the favicon from a static `public/` route and remove the dedicated middleware (express.static already serves it if the file exists).
3. Update `http.test.js` to not assert a 200 for `/favicon.ico` — but this weakens the safety net.

Option 1 is recommended: add the file, keep the test as-is.

---

## 7. Recommended Actions for Nidhi

| Priority | Action | Reason |
|----------|--------|--------|
| **Before Step 5** | Add `public/favicon.ico` (any valid ICO) | `serve-favicon` will throw at startup without it; `http.test.js` will fail |
| **Before Step 6** | Update `socket.test.js` line 16: `a.socket.socket.connected` → `a.socket.connected` | Will fail on socket.io-client 4.x |
| **Before Step 6** | Update `game-events.test.js` line 198: same path fix | Same reason |
| **Before Step 6** | Update `harness.js` line 60: replace `CLIENT_IO.Transport.websocket = null` with socket.io-client 4.x transport option | Internal API removed in 4.x |
| **Before Step 6** | Update `public/js/SocketController.js` line 17: `io.connect('/')` → `io('/')` | `io.connect` removed in Socket.IO 4 |
| **Before Step 7** | Confirm `shadowOffset` format in all Konva.js shapes | 3 usages in `StageController.js` use array form — Konva requires object |

---

*Analysis produced using IBM Bob IDE — no production code modified.*  
*Baseline: `arati/risk-analysis` @ `3889bec` (baseline/import-get24 + Steps 1+2)*  
`ANALYSIS COMPLETE — NO PRODUCTION CODE MODIFIED`
