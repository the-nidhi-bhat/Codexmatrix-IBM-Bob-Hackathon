# Bob Task Session â€” Validation Runner (Milestone 1)

**Project:** Legacy Code Whisperer
**Session date:** 2026-09-26
**Branch:** `nidhi/validation-rollback`
**Agent:** IBM Bob 2.0

---

## What Bob was asked to do

Design and implement the first milestone of the Legacy Code Whisperer **Validation + Rollback** capability:

> Build a small, reliable validation layer that can invoke the existing behavioral safety net and produce a structured result â€” PASS or FAIL â€” based on real test execution. No mock data. No hardcoded counts.

---

## What Bob inspected

| Artifact | What was learned |
|---|---|
| `git log --oneline -8` | Branch `baseline/import-get24`; Steps 1 and 2 committed; working tree clean |
| `legacy/get24-baseline/tests/run.sh` | Runs three suite scripts sequentially; exits 0 or 1 |
| `legacy/get24-baseline/tests/harness.js` | TAP-ish runner; summary line format: `# N tests, N passed, N failed, 0 skipped`; exits with code = failed > 0 ? 1 : 0 |
| `legacy/get24-baseline/tests/README.md` | Docker one-liner; Node 6.17.1 requirement; named volume `get24-nm` |
| `PLAN.md` Step 2 | Already committed; pre-check passed; uuid@9.0.1 installed |
| `server/index.js` | `connected` event on line 92 â€” the documented demo regression target |
| `.gitignore` | Only `node_modules` excluded |

---

## What Bob implemented

### `tools/validate.js`

A single Node.js script with **zero new npm dependencies** (uses only Node built-ins: `child_process`, `fs`, `path`).

**Behavior:**
1. Spawns the exact Docker command from `PLAN.md` / `README.md`
2. Streams stdout and stderr live to the terminal (operator can see the test run in real time)
3. Parses all `# N tests, N passed, N failed, N skipped` summary lines from all three suites and sums the counters
4. Captures the process exit code
5. Writes a structured JSON result to `validation/last-result.json` (path overridable via `--result-file`)
6. Prints a human-readable summary
7. Exits 0 (PASS) or 1 (FAIL)

**PASS criteria:** `exitCode === 0` AND `failed === 0`
**FAIL criteria:** `exitCode !== 0` OR `failed > 0` OR runner process error

### `validation/README.md`

Documents the result schema, PASS/FAIL criteria, limitations, and the fact that `last-result.json` is ephemeral (not committed).

### `validation/.gitkeep`

Keeps the directory tracked in Git before any run produces `last-result.json`.

### `.gitignore` update

Added `validation/last-result.json` â€” ephemeral runtime output, not source.

---

## Verification performed

### PASS case

```
node tools/validate.js
```

**Result:**
```
Validation result : PASS
  passed  : 18
  failed  : 0
  skipped : 0
  total   : 18
  exit    : 0
```

Exit code: 0 âœ…

### FAIL case (controlled regression + immediate revert)

Temporarily changed `server/index.js` line 92:
```diff
-  socket.emit('connected', { numUsers: ++numConnections });
+  socket.emit('connected2', { numUsers: ++numConnections }); /* TEMPORARY REGRESSION TEST */
```

```
node tools/validate.js --result-file validation/fail-test-result.json
```

**Result:**
```
Validation result : FAIL
  passed  : 16
  failed  : 2
  skipped : 0
  total   : 18
  exit    : 1
```

Exit code: 1 âœ… â€” regression correctly detected.

The regression was immediately reverted (`server/index.js` restored to committed state). Confirmed with `git diff server/index.js` â†’ no output.

---

## Files changed

| File | Change |
|---|---|
| `tools/validate.js` | **New** â€” validation runner script |
| `validation/README.md` | **New** â€” schema and usage documentation |
| `validation/.gitkeep` | **New** â€” directory tracking |
| `.gitignore` | **Modified** â€” added `validation/last-result.json` |

**Files NOT changed:** `server/`, `public/`, `legacy/`, `package.json`, `PLAN.md`, `ASSESS.md`, `.opencode/`, `IBM_BOB/`

---

## Limitations

- The runner requires Docker to be installed and running on the host
- The `get24-nm` named Docker volume must exist (or `npm install` re-runs inside the container on each invocation)
- Git rollback restores source files only â€” it does not restart a running server process
- `last-result.json` is ephemeral; workflows must invoke `tools/validate.js` fresh rather than reading stale JSON
- Rollback is **not yet implemented** in this milestone (Milestone 1 scope is validation only)

---

## Status

**Validation milestone complete; rollback not yet implemented.**

Next milestone: implement `tools/rollback.js` â€” identify last known-good Git checkpoint, apply `git revert`, re-run validation to confirm recovery.
