# Get24 behavioral safety net (Phase 1 - PROTECT)

Characterization tests for the **unmodified** Get24 app at the repository root.
They lock down the observable behavior that later modernization work has to
preserve. No application file is modified, no game rule is changed, and no new
dependency is added: the Socket.IO client used here is the
`socket.io-client@0.9.16` copy that already ships inside `socket.io@0.9.19`
and that the server serves at `/socket.io/socket.io.js`.

Upstream: Cory Gross, <https://github.com/CoryG89/Get24> (MIT, see `LICENSE.md`).
Baseline: branch `baseline/import-get24`, tag `legacy-baseline` = upstream `4749d7a`.

## Running

The legacy stack needs node 6.17.1 (see `../repro/LEGACY_NPM_LS.txt`); node 0.12
cannot boot it because a floating transitive `debug` now ships ES6 syntax.

From the repository root, with the app's `node_modules` present:

```sh
sh legacy/get24-baseline/tests/run.sh
```

Isolated, without touching the host Node (named volume caches `node_modules`):

```sh
docker run --rm -v "${PWD}:/app" -v get24-nm:/app/node_modules -w /app node:6 \
  bash -c "npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh"
```

Each file also runs standalone (`node legacy/get24-baseline/tests/socket.test.js`)
and prints a TAP-ish summary plus a non-zero exit code when anything fails.

## What is covered

| File | Tests | Covers |
| --- | --- | --- |
| `http.test.js` | 4 | `GET /` serves the real app page; every static asset the page references; the Socket.IO 0.9 client build; 404 for an unknown path |
| `socket.test.js` | 4 | a client connects; `connected {numUsers}`; `gameJoined {room, card, numPlayers}`; the round timer ticks |
| `game-events.test.js` | 10 | `playerJoined`; `evaluatedExpr`; all four `invalidExpr` messages; `roundOver` win/loss; `playerQuit`; `roundOver` type `timer`; capacity rejection |

## Test-only seams (nothing in the app is touched)

* `PORT` - the app already reads `process.env.PORT`.
* `Math.random` - `preload.js` installs a seeded Lehmer LCG, which is how
  `getRandomCard()` becomes deterministic (seed 1 deals `1347`, then `3455`).
* `server/config.json` `maxConnections` and `server/game/config.json`
  `initialTimer` - `preload.js` mutates the **in-memory** config objects; the
  files on disk are never written.
* `xmlhttprequest` - `harness.js` swaps the 2014 module for `xhr-shim.js` in
  `require.cache` of the test process only. The 2014 shim cannot finish a
  handshake on node 6 and cannot send the `Origin` header that
  `server/index.js` (`io.set('origins', ...)`) requires.
* the client's websocket transport is removed in the test process
  (`harness.js`). `io.util.merge` in socket.io-client 0.9.16 concatenates
  arrays, so the `transports` connect option cannot narrow the list, and node
  sends a `host:port` websocket Origin that the app's origin whitelist rejects.
  xhr-polling is the transport a browser really ends up on here.

## Captured legacy behavior worth knowing

* `overCapacity` is advisory and effectively undeliverable over xhr-polling:
  `server/index.js` `accept()` emits it and disconnects in the same tick, so the
  packet is discarded before a client can read it. The capacity test therefore
  asserts the protection itself - a rejected socket is never told it connected,
  never joins a game, and is dropped.
* The origin whitelist only works by accident for xhr-polling: the configured
  value is `http://localhost:<port>` and the check is a substring search for
  `localhost:<port>`.
* `server/index.js` and `README.md` disagree on the default port
  (4000 vs 3001); `PORT` wins at runtime.
