# Legacy Analysis + Risk Review — Get24 (v2)
### Legacy Code Whisperer · Team Codexmatrix · IBM Bob 2.0 Hackathon

**Author:** Arati (Legacy Analysis + Risk role) — IBM Bob IDE  
**Branch:** `arati/risk-analysis`  
**Baseline commit for this revision:** `97ca37f` (v1 analysis) → improved in this commit  
**Steps already applied at this revision:** Step 1 (F-18 type guard), Step 2 (node-uuid → uuid@9.0.1)  
**Reference:** [`ASSESS.md`](../../ASSESS.md) · [`PLAN.md`](../../PLAN.md)  
**Safety net:** 18/18 tests — not touched by this document

> **v2 improvements over v1:** Added new findings (F-23 through F-28) not covered
> by ASSESS.md or PLAN.md, expanded the `validate()` logic analysis with additional
> edge cases, refined the harness break-point table with exact required replacements,
> updated the Step 5 section to reflect the favicon resolution now in PLAN.md,
> and added a concrete concurrency race scenario with step-by-step trace.
> No production code is modified.

---

## 1. Current State After Steps 1 and 2

### Step 1 — F-18 resolved: `validate()` type guard ✅

**File:** [`server/game/index.js`](../../server/game/index.js) line 61  
**Evidence in current code:**
```js
socket.on('submitExpression', function (data) {
    if (typeof data.expression !== 'string') return;   // ← added by Step 1
    var res = validate(data.expression);
```
**Behavioral impact:** A malformed socket payload (missing or non-string `expression`) returns silently instead of crashing `temp.search()` on line 95 with a TypeError. All 18 safety net tests pass unchanged.

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
**Note:** `legacy/get24-baseline/repro/LEGACY_NPM_LS.txt` still shows `node-uuid@1.4.8` — this is expected. That file captures the resolved legacy dependency tree at baseline (before Step 2). It is a historical record, not a current snapshot.

---

## 2. Remaining Open Findings — Code Evidence

### F-12 — `node-expression-eval@0.1.x` unmaintained · **MEDIUM risk** · Step 3

**File:** [`server/game/index.js`](../../server/game/index.js) lines 12, 66–71  
**Evidence:**
```js
// line 12 — still the unmaintained package
var parser = require('node-expression-eval');

// lines 66–71 — the call site and its try/catch
try { data.evaluated = parser.evaluate(data.expression); }
catch(e) {
    passedEval = false;
    socket.emit('invalidExpr', {msg: 'Invalid.'});
} finally {
    if (passedEval) emitEvaluation(socket, data);
}
```
**Why it matters:** `node-expression-eval@0.1.0` was published once in 2013 with no subsequent releases. The `expr-eval@2.x` replacement is the maintained continuation of the same arithmetic-evaluator codebase (same algorithm, same operator precedence). The risk is not in the replacement itself but in any edge-case difference between the two implementations.

**Specific regression risks for Step 3:**

| Expression | Card | Expected result | Why it could differ |
|------------|------|-----------------|---------------------|
| `1+3+4+7` | `1347` | `evaluatedExpr { evaluated: 15 }` | Standard arithmetic — identical in both packages |
| `7*4-3-1` | `1347` | `evaluatedExpr { evaluated: 24 }` → roundOver `win` | Operator precedence `*` before `-` — identical in both |
| `(1+3+4+7` | `1347` | `invalidExpr { msg: 'Invalid.' }` | Both throw on unmatched paren — behavior preserved by `try/catch` regardless of error type |
| `1/(3-3)+4+7` | `1347` | `invalidExpr { msg: 'Invalid.' }` (division by zero) | Both throw — protected by `try/catch`, **no test covers this** |
| `1 + 3 + 4 + 7` | `1347` | `evaluatedExpr { evaluated: 15 }` | Whitespace handling may differ — **no test with spaces** |

**Tests that protect this change:**
- `game-events.test.js` — "a valid non-winning expression" → `evaluated === 15`
- `game-events.test.js` — "a winning expression ends the round" → `evaluated === 24`
- `game-events.test.js` — "an unparseable but legal-character expression produces invalidExpr 'Invalid.'"

---

### F-13 — Server start is a module side-effect · **MEDIUM risk** · Step 4

**File:** [`index.js`](../../index.js) line 1  
**File:** [`server/index.js`](../../server/index.js) lines 43–44  
**Evidence:**
```js
// index.js line 1 — require triggers HTTP bind immediately
var server = require('./server');

// server/index.js lines 43–44 — the side-effect: listen() called at module load time
var server = http.createServer(app).listen(app.get('port'), function() {
    console.log('\nExpress server listening port ' + app.get('port') + '\n');
});
```
**Why it matters:** Every test in the safety net works around this by spawning a separate child process (`child_process.spawn` in `harness.js` line 129). This prevents in-process test control and requires the 20-second startup timeout.

**Ordering invariant for Step 4:** Socket.IO must be attached **before** `listen()` resolves — or at minimum before any connection arrives. In the current code both happen synchronously in the same script tick, so there is no race. After Step 4, the `start()` function must maintain this ordering:

```
// correct — Socket.IO attached before listen completes
var server = http.createServer(app);
var io = require('socket.io')(server, { ... });
server.listen(port, callback);
```

If Socket.IO is attached *after* the `listen()` callback fires, a fast-connecting client could arrive before `io.sockets.on('connection', ...)` is registered, and the event would be silently dropped.

**Harness evidence — current workaround:**
```js
// harness.js line 129
var proc = spawn(process.execPath, ['-r', PRELOAD, path.join(APP_DIR, 'index.js')], {
    cwd: APP_DIR, env: env, stdio: ['ignore', 'pipe', 'pipe']
});
```

---

### F-14 — Global mutable `gameList` and `numConnections` · **MEDIUM risk** · Future phase

**File:** [`server/index.js`](../../server/index.js) lines 25–26  
**Evidence:**
```js
var gameList = [];
var numConnections = 0;
```

**`numConnections` analysis:** Incremented in `accept()` (line 92) and decremented in the global `socket.on('disconnect')` handler (line 84). The decrement is in `server/index.js`, not inside the `Game` class. The `Game` class also has its own `socket.on('disconnect')` handler (line 55 of `game/index.js`) that decrements `playerCount`. These are two separate handlers on the same socket — both fire on disconnect. This is correct and intentional, but it means `numConnections` and `playerCount` are decremented independently.

**`gameList` analysis:** Games are added to the list (`push`) on lines 62 and 78, but **never removed**. When all players leave a game, `playerCount` drops to 0 and `gameTimer.reset()` is called. The game object remains in `gameList`. The next incoming player will iterate `gameList`, find `isFull()` returns false (since `playerCount === 0 < 4`), and join that existing game object — re-using it. This is intentional recycling, not a traditional leak. However:

- The game's `gameId` (and therefore its Socket.IO room) never changes between player sessions
- A player who reconnects after everyone left will join a room with the same `gameId` as before
- Under very high load, `gameList` grows unboundedly if enough games are created faster than they can be recycled (e.g. 4-player games that fill up quickly)

**No test covers the recycling path** — the test suite uses fresh server processes per test, so `gameList` never has a recycled game during testing.

---

### F-15 — `setInterval` not cleared on process exit · **LOW risk** · Step 4 / future

**File:** [`server/game/timer.js`](../../server/game/timer.js) line 77  
**File:** [`server/index.js`](../../server/index.js) lines 103–106  
**Evidence:**
```js
// timer.js line 77 — interval stored in closure-local variable; no way to access from outside
timerInterval = setInterval(tick, resolution);

// server/index.js lines 103–106 — SIGINT calls process.exit(), not server.close()
process.on('SIGINT', function() {
    console.log('\nSIGINT signal received. Shutting down gracefully.');
    process.exit();
});
```
**`timer.stop()` is exposed** (line 105 of `timer.js`): `this.stop = stopTimer`. But `stopTimer()` is only called via `gameTimer.reset()` (when `playerCount` drops to 0) or `gameTimer.restart()` (on a win). There is no code path that stops all active timers on server shutdown. `process.exit()` discards the event loop so in production this is invisible, but it matters for in-process test teardown after Step 4.

---

### F-02 / F-03 / F-04 / F-05 / F-10 — Express 3 boot failure · **HIGH risk** · Step 5

**File:** [`server/index.js`](../../server/index.js) lines 29–40  
**Evidence — complete block that must be replaced:**
```js
var app = express();
app.configure(function () {
    app.set('port', process.env.PORT || config.port);    // port config
    app.use(express.favicon());                           // removed in Express 4
    app.use(express.logger('dev'));                       // removed in Express 4
    app.use(express.static(path.join(__dirname, '..', 'public')));
});
app.configure('development', function () {
    app.use(express.errorHandler());                      // removed in Express 4
});
```

**Favicon resolution — already in PLAN.md Step 5:** The initial v1 analysis identified `public/favicon.ico` as absent (a gap in the original PLAN.md). PLAN.md Step 5 has since been updated to address this: the resolution is to add a minimal `public/favicon.ico` and let `express.static` serve it, without using `serve-favicon` at all. This means the `serve-favicon` package is **not needed** — `express.static` handles it automatically when the file exists. The v1 analysis proposed `serve-favicon` as one option; PLAN.md selected the cleaner option of just adding the file.

**Confirmed: `public/favicon.ico` does not exist** as of this commit. It must be added in the Step 5 commit.

**`http.test.js` assertion that protects favicon behavior** (line 44):
```js
['/favicon.ico', null, null]
```
This asserts status 200 and non-zero body bytes. After Step 5, `express.static` serves the new file. The test passes unchanged.

**Tests that protect Step 5:**
- All 4 `http.test.js` tests
- Socket.IO layer (Step 6's territory) is not touched

---

### F-06 / F-07 / F-08 / F-09 — Socket.IO 0.9 boot failure · **HIGH risk** · Step 6

**File:** [`server/index.js`](../../server/index.js) lines 48–56  
**Evidence — complete block that must be replaced:**
```js
var io = require('socket.io').listen(server);    // line 48 — .listen() still works in Socket.IO 4

io.configure('development', function () {        // lines 50–52 — REMOVED in Socket.IO 1.x
    io.set('origins', 'http://localhost:' + app.get('port'));
});
io.configure('production', function () {         // lines 54–56 — REMOVED in Socket.IO 1.x
    io.set('origins', 'http://get24.jit.su:80'); // F-21: defunct Nodejitsu PaaS URL
});
```

**`socket.disconnect()` at line 97 — behavioral impact if not updated:**
```js
// current
socket.disconnect();

// required for Socket.IO 4
socket.disconnect(true);
```
Without the `true` argument, Socket.IO 4's `disconnect()` closes only the namespace connection but leaves the underlying transport open. The rejected client in `accept()` would not actually be dropped — it could immediately reconnect. The `overCapacity` behavior (already undeliverable over xhr-polling, as documented in `tests/README.md`) would be even more broken.

---

#### Test harness impact for Step 6 — complete break-point table

This is the highest-risk step. The safety net makes three assumptions about socket.io-client internals that break when upgrading to Socket.IO 4. All three must be resolved in the **same** Step 6 commit.

| Break | Location | Current code | Required fix | Reason |
|-------|----------|-------------|--------------|--------|
| **1** | `socket.test.js` line 16 | `a.socket.socket.connected` | `a.socket.connected` | Socket.IO 4 client exposes `connected` directly on the socket; the 0.9 `.socket.socket` double-hop is gone |
| **2** | `game-events.test.js` line 198 | `c.socket.socket.connected` | `c.socket.connected` | Same reason |
| **3** | `harness.js` line 60 | `CLIENT_IO.Transport.websocket = null;` | Replace with `transports: ['polling']` in each `CLIENT.connect()` call in `harness.js` Client constructor | `CLIENT_IO.Transport` does not exist in socket.io-client 4.x; transport restriction must use the connect options API |
| **4** | `public/js/SocketController.js` line 17 | `socket = io.connect('/');` | `socket = io('/');` | `io.connect` was removed in Socket.IO 4; browser game breaks without this fix |
| **5** | `harness.js` line 37–43 | `require.cache[xhrShimPath] = { exports: require('./xhr-shim.js') };` | Verify whether socket.io-client 4.x still uses `xmlhttprequest` for polling transport | Socket.IO 4 client uses its own fetch/XHR abstraction; the `xmlhttprequest` shim may no longer be in the dependency tree at all |

**Break 5 — xhr-shim investigation (to be done during Step 6 execution):**

The current `harness.js` (lines 37–43) replaces the `xmlhttprequest` module in `require.cache` before loading the Socket.IO 0.9 client:
```js
var xhrShimPath = require.resolve('xmlhttprequest');
require.cache[xhrShimPath] = {
    id: xhrShimPath, filename: xhrShimPath, loaded: true,
    exports: require('./xhr-shim.js')
};
```
This is necessary because `socket.io-client@0.9.16` depends on `xmlhttprequest@1.4.2` (confirmed in `LEGACY_NPM_LS.txt` line 39), which fails to complete handshakes on Node.js 6 and cannot set the `Origin` header that the legacy server's `io.set('origins', ...)` requires.

In socket.io-client 4.x, the polling transport is implemented directly (no `xmlhttprequest` package dependency). Steps for the executor:
1. Check `node_modules/socket.io-client/package.json` after `npm install socket.io@4.x` — if `xmlhttprequest` is not listed as a dependency, `require.resolve('xmlhttprequest')` will throw and the harness will crash.
2. If `xmlhttprequest` is absent: remove the entire `require.cache` injection block from `harness.js` (lines 37–43) and delete the `require('./xhr-shim.js')` reference.
3. If `xmlhttprequest` is still present: keep the shim injection but update `xhr-shim.js` to match the new client's expected interface.

**What is NOT broken by Step 6:** The nine event names (`connected`, `overCapacity`, `gameJoined`, `playerJoined`, `playerQuit`, `evaluatedExpr`, `invalidExpr`, `timer`, `roundOver`) and every payload key. `socket.emit`, `socket.on`, `socket.broadcast`, `socket.join` all work identically in Socket.IO 4.

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
`layer` is not declared in the file. The canvas layer variable is `activeLayer` (declared line 36). Fix: `layer.add(helpDialog)` → `activeLayer.add(helpDialog)`.

**Test coverage:** None — 18 tests cover server-side behavior only.

---

### F-17 — `blink || true` ignores the `blink` parameter · **LOW risk** · Step 7

**File:** [`public/js/StageController.js`](../../public/js/StageController.js) lines 281, 312  
**Evidence:**
```js
// line 281 — willBlink is always true regardless of argument
var willBlink = blink || true;

// line 312 — caller passes false to suppress blink on the losing player's expression
this.showEvaluatedText(data.expression, '#dd0000', false, 5000);
```
`false || true` is always `true`. The losing player's expression display always blinks, ignoring the `false` argument. Fix: `blink || true` → `blink !== false`.

**Test coverage:** None — client-side only.

---

### F-20 — KineticJS 4.6.0 abandoned · **MEDIUM-HIGH risk** · Step 7

**File:** [`public/js/StageController.js`](../../public/js/StageController.js) — throughout  
**File:** [`public/index.html`](../../public/index.html) line 12  

**All KineticJS API calls and their Konva 9.3.18 status:**

| Line | Current call | Konva.js 9.3.18 equivalent | Change type |
|------|-------------|---------------------------|-------------|
| 25 | `new Kinetic.Stage({container, width, height})` | `new Konva.Stage({container, width, height})` | Rename only |
| 35 | `new Kinetic.Layer()` | `new Konva.Layer()` | Rename only |
| 36 | `new Kinetic.Layer()` | `new Konva.Layer()` | Rename only |
| 39 | `new Kinetic.Text({..., shadowOffset: [0,7], ...})` | `shadowOffset: {x:0, y:7}` | **BREAKING — array → object** |
| 45 | `titleText.setX(...)` | `titleText.x(...)` | Method rename (setter form) |
| 45 | `titleText.getWidth()` | `titleText.width()` | Method rename (getter form) |
| 46 | `titleText.setY(...)` | `titleText.y(...)` | Method rename |
| 46 | `titleText.getHeight()` | `titleText.height()` | Method rename |
| 47 | `new Kinetic.Text({x, y, ...})` | `new Konva.Text({x, y, ...})` | Rename only |
| 52 | `descText.setX(...)` | `descText.x(...)` | Method rename |
| 52 | `descText.getWidth()` | `descText.width()` | Method rename |
| 61 | `this.children[0].setFill(...)` | `this.children[0].fill(...)` | Method rename |
| 68 | `this.children[0].setFill(...)` | `this.children[0].fill(...)` | Method rename |
| 73 | `new Kinetic.Group({x, y, fill})` | `new Konva.Group({x, y, fill})` | Rename only |
| 77 | `new Kinetic.Rect({...})` | `new Konva.Rect({...})` | Rename only |
| 81 | `new Kinetic.Text({...})` | `new Konva.Text({...})` | Rename only |
| 92 | `new Kinetic.Group({x, y})` | `new Konva.Group({x, y})` | Rename only |
| 103 | `new Kinetic.Rect({...})` | `new Konva.Rect({...})` | Rename only |
| 104 | `stage.getWidth()` | `stage.width()` | Method rename |
| 104 | `stage.getHeight()` | `stage.height()` | Method rename |
| 108 | `new Kinetic.Text({...})` | `new Konva.Text({...})` | Rename only |
| 113 | `.setText(...)` | `.text(...)` | Method rename |
| 124 | `new Kinetic.Group({x, y})` | `new Konva.Group({x, y})` | Rename only |
| 127 | `new Kinetic.Rect({...})` | `new Konva.Rect({...})` | Rename only |
| 131 | `new Kinetic.Text({...})` | `new Konva.Text({...})` | Rename only |
| 147 | `new Kinetic.Text({..., shadowOffset: [0,7], ...})` | `shadowOffset: {x:0, y:7}` | **BREAKING — array → object** |
| 157 | `new Kinetic.Text({..., shadowOffset: [0,7], ...})` | `shadowOffset: {x:0, y:7}` | **BREAKING — array → object** |
| 163 | `new Kinetic.Animation(fn, layer)` | `new Konva.Animation(fn, layer)` | Rename only |
| 164 | `mainMsg.setOpacity(...)` | `mainMsg.opacity(...)` | Method rename |
| 170 | `new Kinetic.Text({...})` | `new Konva.Text({...})` | Rename only |
| 175 | `new Kinetic.Text({...})` | `new Konva.Text({...})` | Rename only |
| 182 | `new Kinetic.Text({...})` | `new Konva.Text({...})` | Rename only |
| 194 | `cardText[i].setVisible(true)` | `cardText[i].visible(true)` | Method rename |
| 194 | `cardText[i].setText(...)` | `cardText[i].text(...)` | Method rename |
| 195 | `new Kinetic.Tween({..., easing: Kinetic.Easings.EaseIn, ...})` | `Kinetic.Easings` → `Konva.Easings` | **Namespace rename** |
| 214 | `new Kinetic.Tween({..., onFinish: fn})` | `new Konva.Tween({..., onFinish: fn})` | Rename only |
| 226 | `cardText[i].setVisible(false)` | `cardText[i].visible(false)` | Method rename |
| 227 | `cardText[i].setOpacity(1)` | `cardText[i].opacity(1)` | Method rename |
| 228 | `cardText[i].setX(-150)` | `cardText[i].x(-150)` | Method rename |
| 235 | `mainMsg.setText(...)` | `mainMsg.text(...)` | Method rename |
| 235 | `mainMsg.getWidth()` | `mainMsg.width()` | Method rename |
| 236 | `mainMsg.setX(...)` | `mainMsg.x(...)` | Method rename |
| 239 | `new Kinetic.Tween({...})` | `new Konva.Tween({...})` | Rename only |
| 276 | `evaluatedText.setText(...)` | `evaluatedText.text(...)` | Method rename |
| 276 | `evaluatedText.setFill(...)` | `evaluatedText.fill(...)` | Method rename |
| 276 | `evaluatedText.getWidth()` | `evaluatedText.width()` | Method rename |
| 277 | `evaluatedText.setX(...)` | `evaluatedText.x(...)` | Method rename |
| 278 | `evaluatedText.setVisible(true)` | `evaluatedText.visible(true)` | Method rename |
| 283 | `clearInterval(blinkInterval)` | unchanged | Not KineticJS |
| 284 | `evaluatedText.setVisible(false)` | `evaluatedText.visible(false)` | Method rename |
| 289 | `evaluatedText.setVisible(!evaluatedText.getVisible())` | `evaluatedText.visible(!evaluatedText.visible())` | Method rename (getter+setter) |
| 295 | `playersText.setText(...)` | `playersText.text(...)` | Method rename |
| 300 | `timerText.setText(...)` | `timerText.text(...)` | Method rename |

**Summary of BREAKING changes (3 items require more than a rename):**
1. Lines 39, 149, 162: `shadowOffset: [0, 7]` → `shadowOffset: { x: 0, y: 7 }` (3 occurrences)
2. Line 199: `Kinetic.Easings.EaseIn` → `Konva.Easings.EaseIn` (namespace rename, but note Konva uses `'EaseIn'` string form in some contexts — verify against Konva 9.3.18 docs)
3. Line 63: `this.getLayer()` is called on a `Kinetic.Group` event handler — `getLayer()` exists in Konva 9.3.18 as `.getLayer()` (unchanged, not a method-rename case)

**`http.test.js` assertions that must be updated in Step 7 commit:**

| Location | Current assertion | Updated assertion |
|----------|------------------|-------------------|
| `http.test.js` line 24 | `'js/kinetic-v4.6.0.min.js'` in `index.html` body | `'js/konva.min.js'` |
| `http.test.js` line 41 | `['/js/kinetic-v4.6.0.min.js', /javascript/, ['Kinetic']]` | `['/js/konva.min.js', /javascript/, ['Konva']]` |
| `http.test.js` line 43 | `['/js/StageController.js', /javascript/, ['Kinetic']]` | `['/js/StageController.js', /javascript/, ['Konva']]` |

---

## 3. New Findings — Not in ASSESS.md or PLAN.md

---

### F-23 — `gameList` recycling is silent and unobservable · **LOW risk** · Note for future phase

**File:** [`server/index.js`](../../server/index.js) lines 61–80  
**Evidence:**
```js
if (gameList.length === 0) {
    gameList.push(new Game(io));
    gameList[0].join(socket);
} else {
    var allGamesFull = true;
    for (var i = 0; i < gameList.length; i++) {
        var game = gameList[i];
        if (!game.isFull()) {
            game.join(socket);
            allGamesFull = false;
            break;
        }
    }
    if (allGamesFull) {
        gameList.push(new Game(io));
        gameList[gameList.length - 1].join(socket);
    }
}
```
**Finding:** Games are never removed from `gameList`. When all 4 players disconnect from a game, `playerCount` drops to 0 via the `--playerCount` in the disconnect handler (`game/index.js` line 56). `isFull()` returns `playerCount === config.maxPlayers` = `0 === 4` = `false`. So the empty game is detected as "not full" and the next connecting player joins it — re-using the existing `Game` object, its existing `gameId`, and its existing Socket.IO room.

**Implication for modernization:** The Socket.IO room named by `gameId` persists across multiple player sessions. In Socket.IO 4, room cleanup after all sockets leave is automatic, but a game object in `gameList` can still reference that room name and re-join new sockets to it. This is architecturally the same as before. No behavioral change is expected.

**What is not covered by any test:** The behavior when a game is fully vacated and then a new player arrives. The test suite creates a fresh server process per test (via `spawn`), so `gameList` always starts empty.

---

### F-24 — `timer.js` initializes 7 variables to `undefined` explicitly · **NEGLIGIBLE risk** · Code quality note

**File:** [`server/game/timer.js`](../../server/game/timer.js) lines 40–46  
**Evidence:**
```js
var time = undefined;
var resolution = undefined;
var initialTime = undefined;
var timerInterval = undefined;
var timerCallback = undefined;
var intervalCallback = undefined;
var loop = undefined;
```
`var x = undefined` is redundant in JavaScript — unassigned `var` declarations are already `undefined`. This is a code style issue from 2013 Node.js conventions. No behavioral risk. No test impact.

**Modernization opportunity:** If the project ever adopts `strict mode` or a linter, these would be flagged. They are inert but noisy. Can be cleaned up in any future quality pass without any test change.

---

### F-25 — `getRandomCard()` difficulty distribution: `mediumCutoff` value creates 50/30/20 split, not 33/33/33 · **NEGLIGIBLE risk** · Documentation gap

**File:** [`server/game/config.json`](../../server/game/config.json)  
**File:** [`server/game/index.js`](../../server/game/index.js) lines 143–161  
**Evidence:**
```json
{ "maxPlayers": 4, "initialTimer": 300, "mediumCutoff": 0.5, "easyCutoff": 0.8 }
```
```js
function getRandomCard() {
    var rnd = Math.random();
    if (rnd < config.mediumCutoff)       // < 0.5 → 50% medium
        return cards.med[Math.floor(Math.random() * cards.med.length)];
    else if (rnd < config.easyCutoff)    // 0.5–0.8 → 30% easy
        return cards.easy[Math.floor(Math.random() * cards.easy.length)];
    else                                 // 0.8–1.0 → 20% hard
        return cards.hard[Math.floor(Math.random() * cards.hard.length)];
}
```
**Finding:** The comment in ASSESS.md (and the general description) says "50% medium, 30% easy, 20% hard." The code confirms this. The naming — `mediumCutoff` and `easyCutoff` — matches the intent. No bug.

**Regression risk for Step 3 (expr-eval):** The test suite seeds `Math.random` via `preload.js` (Lehmer LCG, seed=1). The seeded sequence produces `1347` (medium) then `3455` (easy). These are hardcoded in `game-events.test.js` lines 13–14:
```js
var FIRST_CARD = '1347';
var NEXT_CARD = '3455';
```
Any change to `getRandomCard()` or the RNG seed would invalidate these constants. **Step 3 does not change `getRandomCard()` or the RNG** — this is only a note for any future refactoring.

**Additional RNG note:** `getRandomCard()` calls `Math.random()` **twice**: once to determine the difficulty bracket, and once to pick the card within that bracket (lines 144, 148, 153, 158). The seeded LCG in `preload.js` is stateful — both calls consume values from the same sequence. This is correct and expected, but anyone adding a third `Math.random()` call inside `getRandomCard()` would shift the card sequence and break the seeded test fixtures.

---

### F-26 — `cards.json` contains multi-digit repeated-digit cards: `validate()` handles them correctly but the path is non-obvious · **LOW risk** · Code analysis

**File:** [`server/game/cards.json`](../../server/game/cards.json) — easy and hard cards  
**File:** [`server/game/index.js`](../../server/game/index.js) lines 89–122  
**Evidence (examples of cards with repeated digits):**
```
easy: "1266" (two 6s), "2488" (two 8s), "1148" (two 1s), "1156" (two 5s)
hard: "2258" (two 2s), "2235" (two 2s)
```

**How `validate()` handles repeated digits — traced for card `'1148'`:**

```js
for (var i = 0; i < gameCard.length; i++) {   // iterates: '1', '1', '4', '8'
    var res = temp.search(gameCard[i]);         // regex search for character
    // ...
    temp = temp.replace(temp[res], '');         // removes first occurrence of character at res
}
```

For expression `1+1+4+8` with card `'1148'`:
1. **i=0, `gameCard[0]='1'`:** `temp='1+1+4+8'`. `search('1')` = 0. `temp[0+1]='+'` (not a digit). `replace('1','')` → `temp='+1+4+8'`.
2. **i=1, `gameCard[1]='1'`:** `temp='+1+4+8'`. `search('1')` = 1. `temp[1+1]='+'` (not a digit). `replace('1','')` → `temp='++4+8'`.
3. **i=2, `gameCard[2]='4'`:** `temp='++4+8'`. `search('4')` = 2. `temp[2+1]='+'` (not a digit). `replace('4','')` → `temp='+++8'`.
4. **i=3, `gameCard[3]='8'`:** `temp='+++8'`. `search('8')` = 3. `temp.length - 1 = 3`, so `res < temp.length - 1` is false → combined-digit check skipped. `replace('8','')` → `temp='+++'`.
5. Second loop: `+` is legal. Returns 0. ✅

For expression `11+4+8` with card `'1148'` (attempting to combine two 1s into `11`):
1. **i=0, `gameCard[0]='1'`:** `search('1')` = 0. `temp[0+1]='1'` — `isNaN(parseInt('1', 10))` = false → returns `-3` ("Digits can't be combined."). ✅

The validate logic correctly handles repeated-digit cards. No bug exists here, but the path is non-obvious and worth documenting for anyone refactoring `validate()`.

---

### F-27 — `run.sh` `set -e` combined with `|| status=1` is correct but subtle · **NEGLIGIBLE risk** · Test infrastructure note

**File:** [`legacy/get24-baseline/tests/run.sh`](../tests/run.sh)  
**Evidence:**
```sh
set -e
status=0
for suite in http socket game-events; do
    node "legacy/get24-baseline/tests/$suite.test.js" || status=1
done
exit $status
```
**Finding:** `set -e` would normally abort the script on the first non-zero exit code. The `|| status=1` pattern prevents `set -e` from aborting — because the `||` makes the overall expression succeed even when `node ... .test.js` exits 1. All three test suites always run, and `status` accumulates any failure. The final `exit $status` propagates the overall result. This is correct behavior.

**Modernization impact:** When upgrading to a new Node.js runtime (Steps 5, 6), the test suites must run completely — not abort on the first failing suite — so the full failure picture is visible. The current `run.sh` correctly provides this. No change needed.

---

### F-28 — `harness.js` `Client` constructor's `'force new connection': true` option is Socket.IO 0.9 specific · **MEDIUM risk** · Step 6

**File:** [`legacy/get24-baseline/tests/harness.js`](../tests/harness.js) line 174  
**Evidence:**
```js
this.socket = CLIENT.connect('http://127.0.0.1:' + port, {
    reconnect: false,
    'force new connection': true    // ← Socket.IO 0.9 specific option name
});
```
**Finding:** `'force new connection': true` is the Socket.IO 0.9 client option that creates a new manager instance instead of reusing an existing one (the 0.9 client caches managers by URL). In socket.io-client 4.x the equivalent is `forceNew: true` (camelCase). The string-key form is not recognized.

**Without this fix:** Multiple calls to `server.client()` in the same test will reuse the same socket manager in Socket.IO 4, causing all clients to share a single underlying connection. Tests that rely on multiple distinct connections (e.g., the second-player join test, the capacity test) would fail non-deterministically or silently.

**Required fix for Step 6:**
```js
// current
this.socket = CLIENT.connect('http://127.0.0.1:' + port, {
    reconnect: false,
    'force new connection': true
});

// Socket.IO 4
this.socket = CLIENT('http://127.0.0.1:' + port, {
    reconnect: false,
    forceNew: true,
    transports: ['polling']    // transport restriction (replaces CLIENT_IO.Transport.websocket = null)
});
```

This change also incorporates the transport restriction (Break 3 from Section 2), consolidating two fixes in one place.

---

## 4. `validate()` Logic — Comprehensive Analysis

**File:** [`server/game/index.js`](../../server/game/index.js) lines 89–122

### 4.1 Already documented

- Line 95: `temp.search(gameCard[i])` treats each digit as a regex — safe for 0–9 but would break for regex metacharacters
- Line 98–99: combined-digit check skips the guard when the digit is the last character in `temp`
- Line 101: `replace(temp[res], '')` correctly strips one instance per loop iteration

### 4.2 New analysis: `search()` as regex vs. literal on digit characters

`String.prototype.search()` always interprets its argument as a regular expression. For single-digit characters `'0'`–`'9'`, the regex interpretation is identical to a literal character match — digits have no special regex meaning. This is safe for all cards in `cards.json`.

However: `temp.search(gameCard[i])` where `gameCard[i]` is the character at position `i` of the card string. Cards are 4-character digit strings like `'1347'`. `gameCard[0]` is the string `'1'` (a single character), not the integer `1`. `'1347'[0]` = `'1'`. This is correct — JavaScript string indexing returns a one-character string.

### 4.3 New analysis: edge case when `expr` contains only whitespace

Expression `'   '` (three spaces) with any card:
1. First loop: `search('1')` on `'   '` returns -1 → returns `-1` ("Must use all 4 digits."). ✅

Expression `''` (empty string) with any card:
1. First loop: `search('1')` on `''` returns -1 → returns `-1`. ✅

Both are correctly handled by the existing guard. The F-18 type guard (Step 1) already prevents non-strings from reaching this code.

### 4.4 New analysis: whitespace in expression after digit stripping

Expression `'1 + 3 + 4 + 7'` (card `'1347'`):
1. `search('1')` = 0. `temp[0+1]=' '` — `isNaN(parseInt(' ', 10))` → `parseInt(' ', 10)` = `NaN` → `isNaN(NaN)` = true → combined check passes. Strip `'1'`: `temp=' + 3 + 4 + 7'`.
2. `search('3')` on `' + 3 + 4 + 7'` = 3. `temp[3+1]=' '` — same, passes. Strip: `temp=' +  + 4 + 7'`.
3. `search('4')` on `' +  + 4 + 7'` = 5. `temp[5+1]=' '` — passes. Strip: `temp=' +  +  + 7'`.
4. `search('7')` on `' +  +  + 7'` = 9. Position 9 is the last char — `res < temp.length - 1` = false → combined check skipped. Strip: `temp=' +  +  + '`.
5. Second loop: `' '`, `'+'` — all legal. Returns 0. ✅

Whitespace-padded expressions pass `validate()` and reach `parser.evaluate()`. This is the intended behavior. For Step 3, `expr-eval@2.x` also handles whitespace in expressions — no behavioral change.

### 4.5 Correctness summary table

| Input | Card | validate() result | Reason |
|-------|------|-------------------|--------|
| `'7*4-3-1'` | `1347` | 0 (valid) | All digits found, legal operators |
| `'1+3+4'` | `1347` | -1 (missing digit) | `7` not found |
| `'1%3+4+7'` | `1347` | -2 (illegal char) | `%` not in whitelist |
| `'13+4+7'` | `1347` | -3 (combined digits) | `3` follows `1` |
| `'1 + 3 + 4 + 7'` | `1347` | 0 (valid) | Spaces are legal |
| `'1/(3-3)+4+7'` | `1347` | 0 (valid, then eval throws) | Passes validate, caught by try/catch |
| `'1+1+4+8'` | `1148` | 0 (valid) | Two 1s handled correctly |
| `'11+4+8'` | `1148` | -3 (combined) | `1` followed by `1` |

---

## 5. Missing Coverage — Gaps in the Safety Net

| Gap | File / Lines | Why it matters for modernization |
|-----|-------------|----------------------------------|
| **Game recycling** | `server/index.js` lines 61–80 | Empty games are recycled, not removed. No test exercises a second player session on a recycled game object. |
| **Whitespace-in-expression evaluation** | `server/game/index.js` line 66 | `'1 + 3 + 4 + 7'` passes `validate()` and reaches `parser.evaluate()`. If `expr-eval` rejects whitespace, Step 3 would introduce a regression with no test catching it. |
| **Division by zero** | `server/game/index.js` line 66 | `'1/(3-3)+4+7'` passes `validate()`, throws at `evaluate()`, caught by `try/catch` → `invalidExpr`. No test sends this. Protected by the catch, not by a test. |
| **`playerCount` below zero** | `server/game/index.js` line 56 | Socket.IO reconnect or transport retry could cause a second disconnect event for the same logical player. `--playerCount` would go negative. `isFull()` never returns true. No test exercises this. |
| **Concurrent win submissions** | `server/game/index.js` lines 129–138 | Two players submitting `= 24` in the same event-loop tick both pass `emitEvaluation`. Both calls see `data.evaluated === 24`, both call `gameTimer.restart()` and reassign `gameCard`. Second caller overwrites first caller's new `gameCard`. Both send `roundOver win` with potentially different `card` values. No test exercises two simultaneous wins. |
| **`overCapacity` advisory undeliverable** | `server/index.js` lines 96–98 | `socket.emit('overCapacity')` followed immediately by `socket.disconnect()` in the same tick. Over xhr-polling the advisory packet never reaches the client. Documented in `tests/README.md`. The `SocketController.js` `alert()` for `overCapacity` is dead code in practice. |
| **Timer ticks when `initialTimer` is 0** | `server/game/timer.js` lines 52–56 | `config.initialTime || 0` — if `initialTimer` is set to 0 in config, `initialTime` becomes 0, and the first tick fires immediately with `time = -1`. `if (--time > 0)` is false, so `timerCallback()` fires on tick 1. Not a real scenario with the default config of 300, but a latent edge case. |
| **`'force new connection'` in harness** | `harness.js` line 175 | Socket.IO 0.9 specific option — silently ignored by socket.io-client 4.x; `forceNew: true` is the 4.x equivalent. Multi-client tests would fail or behave incorrectly without this fix (now documented as F-28). |

---

## 6. Prioritised Risk Table for Remaining Steps

| Step | Finding(s) | Risk | Key regression test(s) | New issues identified in v2 |
|------|-----------|------|------------------------|----------------------------|
| 3 | F-12 (`expr-eval`) | MEDIUM | `evaluatedExpr===15`, `evaluatedExpr===24`, `invalidExpr 'Invalid.'` | No test covers whitespace-padded expression evaluation — verify manually |
| 4 | F-13 (server decoupling) | LOW-MEDIUM | All 18 | Socket.IO must be attached before `listen()` fires |
| 5 | F-02/F-03/F-04/F-05/F-10 (Express 4) | HIGH | All 4 `http.test.js` tests | `public/favicon.ico` must be added in same commit (now in PLAN.md Step 5) |
| 6 | F-06/F-07/F-08/F-09 (Socket.IO 4) | HIGH | All 14 socket+game-events tests | **5 harness break-points** (v1 identified 3; v2 adds Break 4 `io.connect` in SocketController and Break 5 xhr-shim investigation) |
| 6 | F-28 (`'force new connection'`) | MEDIUM | Multi-client tests: second player join, capacity test | **New finding** — `'force new connection': true` must become `forceNew: true` in socket.io-client 4.x; multi-client tests fail without this |
| 7 | F-16/F-17/F-20 (KineticJS→Konva) | MEDIUM-HIGH | `http.test.js` 3 assertions | Full API mapping table with 50+ call sites confirmed; 3 `shadowOffset` breaking changes + `Kinetic.Easings` namespace rename |

---

## 7. Complete Recommended Actions for Nidhi (v2)

Actions from v1 that are still open, plus new items from this revision:

| Priority | Step | Action | Source |
|----------|------|--------|--------|
| **Before Step 5** | 5 | Add `public/favicon.ico` (any valid ICO file) | PLAN.md now documents this — no action needed from this document beyond confirming the file must be added |
| **Before Step 6** | 6 | Update `socket.test.js` line 16: `a.socket.socket.connected` → `a.socket.connected` | v1 + v2 |
| **Before Step 6** | 6 | Update `game-events.test.js` line 198: same path fix | v1 + v2 |
| **Before Step 6** | 6 | Update `harness.js` line 60: remove `CLIENT_IO.Transport.websocket = null` | v1 + v2 |
| **Before Step 6** | 6 | Update `harness.js` `Client` constructor: `CLIENT.connect(..., {'force new connection': true})` → `CLIENT(..., {forceNew: true, transports: ['polling']})` | **v2 NEW (F-28)** |
| **Before Step 6** | 6 | Update `harness.js` lines 37–43: investigate and handle xhr-shim for socket.io-client 4.x | v1 + v2 |
| **Before Step 6** | 6 | Update `public/js/SocketController.js` line 17: `io.connect('/')` → `io('/')` | v1 + v2 |
| **Before Step 7** | 7 | Replace `shadowOffset: [0, 7]` → `{x:0, y:7}` in `StageController.js` lines 39, 149, 162 | v1 + v2 (v2 adds exact line numbers) |
| **Optional** | 7 | Verify `Kinetic.Easings.EaseIn` → `Konva.Easings.EaseIn` or string `'EaseIn'` in Konva 9.3.18 | v2 |
| **After Step 3** | 3 | Manually test whitespace-padded expression (e.g. `'1 + 3 + 4 + 7'`) with `expr-eval@2.x` | **v2 NEW** |

---

*Analysis produced using IBM Bob IDE — no production code modified.*  
*v1 baseline: `arati/risk-analysis` @ `97ca37f` · v2: this commit*  
`ANALYSIS COMPLETE — NO PRODUCTION CODE MODIFIED`
