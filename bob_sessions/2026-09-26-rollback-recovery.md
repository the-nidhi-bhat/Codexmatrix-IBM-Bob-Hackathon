# Bob Task Session — Rollback + Recovery (Milestone 2)

**Project:** Legacy Code Whisperer
**Session date:** 2026-09-26
**Branch:** `nidhi/validation-rollback`
**Agent:** IBM Bob 2.0
**Starting commit:** `3ef19ad` (HEAD at session start after Milestone 1 + WIP commits)

---

## What Bob was asked to do

Design and implement Milestone 2 of the Legacy Code Whisperer **Rollback + Recovery** capability:

> Build a small, conservative rollback mechanism that can identify a specific failed modernization commit, safely revert it using `git revert` (preserving history), and produce a structured result. After rollback, recovery must be confirmed by re-running the real validation runner.

The complete required flow:

```
KNOWN-GOOD STATE → MODERNIZATION CHANGE → VALIDATION → FAIL
     → STOP → ROLLBACK → VALIDATION AGAIN → PASS
```

---

## What Bob inspected

| Artifact | What was learned |
|---|---|
| `git branch --show-current` | On `nidhi/validation-rollback`; working tree clean |
| `git log --oneline -15` | Branch history: Milestone 1 commits + WIP rollback commit `08a5728` + demo regression/revert pair |
| `tools/rollback.js` | Already implemented in WIP commit `08a5728` — full implementation with safety checks, `git revert`, structured JSON output |
| `tools/validate.js` | Complete Milestone 1 runner; no changes needed |
| `validation/last-rollback.json` | Populated from prior WIP run — `ROLLED_BACK` result from reverting commit `8a68cb2` |
| `validation/regression-fail-result.json` | FAIL result: 16 passed, 2 failed from prior WIP demo |
| `validation/last-result.json` | PASS result: 18 passed, 0 failed from prior WIP recovery |
| `validation/README.md` | Only documented validation; rollback section missing |
| `.gitignore` | `validation/*.json` already ignored |
| `server/index.js` line 92 | `socket.emit('connected', ...)` — clean state, regression NOT present |
| `bob_sessions/2026-09-26-validation-runner.md` | Milestone 1 evidence; rollback explicitly listed as "not yet implemented" |

---

## What Bob found about the WIP state

The rollback tool (`tools/rollback.js`) was already written in commit `08a5728` with a
"wip: rollback tool in progress" message. The full demo cycle had also been partially
run (regression commit `8a68cb2` + revert `3ef19ad`). However:

1. Tests A–D had not been formally captured with fresh execution
2. `validation/README.md` had no rollback documentation
3. No Milestone 2 Bob session evidence existed
4. The rollback tool had never been committed with a final milestone commit message

Bob ran all four required tests from scratch on the current HEAD and documented the
actual results.

---

## The rollback tool (`tools/rollback.js`)

**Zero new npm dependencies.** Uses only Node.js built-ins: `child_process`, `fs`, `path`.

### Safety checks (in order)

| # | Check | Behavior on failure |
|---|---|---|
| 1 | `git` is on PATH | Exit 1, REFUSED, no repo change |
| 2 | Working tree is clean | Exit 1, REFUSED, no repo change |
| 3 | Target commit exists | Exit 1, REFUSED, no repo change |
| 4 | Target commit is an ancestor of HEAD | Exit 1, REFUSED, no repo change |
| 5 | Target is not validation/rollback infrastructure | Exit 1, REFUSED, no repo change |

### Git mechanism

```bash
git revert --no-edit <commit>
```

Creates a new revert commit. Does NOT use `git reset --hard`. Does NOT force-push.
History is fully auditable:

```
modernization commit
        ↓
validation failure detected
        ↓
revert commit  ← new commit created by this tool
```

### Output schema

```json
{
  "status":             "ROLLED_BACK | REFUSED | FAILED",
  "targetCommit":       "<reverted commit hash>",
  "revertCommit":       "<new revert commit hash or null>",
  "branch":             "<current branch>",
  "reason":             "<human-readable explanation>",
  "originalAuthor":     "<author of original commit>",
  "originalDate":       "<date of original commit>",
  "filesChanged":       ["<files changed in revert>"],
  "validationRequired": true,
  "runtimeNote":        "<note about running server restart>",
  "timestamp":          "<ISO-8601>"
}
```

---

## Tests executed

### Test B — Invalid target

```bash
node tools/rollback.js deadbeef00000000000000000000000000000000
```

**Result:**
```
[rollback] REFUSED: Commit deadbeef... does not exist in this repository: ...
exit code: 1
```
Repository unchanged. ✅

```bash
node tools/rollback.js   # (no commit arg)
```

**Result:**
```
[rollback] REFUSED: No commit specified. Usage: node tools/rollback.js <commit>
exit code: 1
```
✅

### Test C — Dirty working tree

Appended a line to `server/index.js` without staging. Then:

```bash
node tools/rollback.js 3889bec
```

**Result:**
```
[rollback] REFUSED: Working tree is not clean. Stash or commit your changes before rolling back.
exit code: 1
dirtyFiles: ["M server/index.js"]
```
Repository unchanged. `server/index.js` manually restored with `git checkout -- server/index.js`. ✅

### Protected commit guard test

```bash
node tools/rollback.js 67f1b3b   # the Milestone 1 validation runner commit
```

**Result:**
```
[rollback] REFUSED: Commit 67f1b3b (feat(validation): add validation runner...)
is the validation/rollback infrastructure itself. Rolling it back would destroy the safety net.
exit code: 1
```
✅

### Test A — Normal rollback (real modernization commit)

Target: `3889bec` — `refactor(game): replace node-uuid with uuid 9.0.1 (F-11)`

```bash
node tools/rollback.js 3889bec
```

**Result:**
```
Rollback result   : ROLLED_BACK
  reverted        : 3889bec2b6b4 — refactor(game): replace node-uuid with uuid 9.0.1 (F-11)
  revert commit   : 92f63c8d2e64
  branch          : nidhi/validation-rollback
  files changed   : package.json, server/game/index.js
exit code: 0
```
Revert commit `92f63c8` created. ✅

The revert was itself reverted (`6393892`) to restore the modernization for the milestone's
final committed state.

### Test D — Full FAIL → ROLLBACK → VALIDATION PASS

#### Step 1: Introduce controlled regression

Changed `server/index.js` line 92:

```diff
-        socket.emit('connected', { numUsers: ++numConnections });
+        socket.emit('connected2', { numUsers: ++numConnections }); // CONTROLLED REGRESSION
```

Committed as: `7beb787 test-regression: controlled connected2 regression for Milestone 2 Test D`

#### Step 2: Validation FAIL

```bash
node tools/validate.js --result-file validation/testd-regression-fail.json
```

```
Validation result : FAIL
  passed  : 16
  failed  : 2
  skipped : 0
  total   : 18
  exit    : 1
```

Failures:
- `not ok 2 - server emits connected with an incrementing numUsers count` — timed out waiting for `connected`; received `connected2` events
- `not ok 10 - a connection past maxConnections is rejected: no connected` — same root cause

Regression correctly detected. ✅

#### Step 3: Rollback

```bash
node tools/rollback.js 7beb787 --result-file validation/testd-rollback.json
```

```
Rollback result   : ROLLED_BACK
  reverted        : 7beb78759474 — test-regression: controlled connected2 regression...
  revert commit   : c5df176f1ddd
  branch          : nidhi/validation-rollback
  files changed   : server/index.js
exit code: 0
```

Revert commit `c5df176` created. Git history now shows the full audit trail:

```
7beb787  test-regression: controlled connected2 regression...
c5df176  Revert "test-regression: controlled connected2 regression..."
```
✅

#### Step 4: Recovery validation PASS

```bash
node tools/validate.js --result-file validation/testd-recovery-pass.json
```

```
Validation result : PASS
  passed  : 18
  failed  : 0
  skipped : 0
  total   : 18
  exit    : 0
```

All 18 tests pass after rollback. Protected behavior fully restored. ✅

---

## Full FAIL → ROLLBACK → PASS sequence confirmed

```
REGRESSION COMMITTED (connected → connected2)
      ↓
node tools/validate.js
      ↓
FAIL (16/18, exit 1)
      ↓
node tools/rollback.js 7beb787
      ↓
ROLLED_BACK (revert commit c5df176, exit 0)
      ↓
node tools/validate.js
      ↓
PASS (18/18, exit 0)
```

---

## Runtime limitation

`git revert` restores source files on disk. It does **not** affect any already-running
Node.js server process. In a live deployment scenario, the application server must be
restarted before re-running validation after a rollback. This is documented in both
`tools/rollback.js` (the `runtimeNote` field in the result) and `validation/README.md`.

---

## Files changed in this milestone

| File | Change |
|---|---|
| `tools/rollback.js` | New — safe rollback tool (committed in WIP `08a5728`, finalized here) |
| `validation/README.md` | Updated — added full rollback documentation section |
| `bob_sessions/2026-09-26-rollback-recovery.md` | New — this file |

**Files NOT changed:** `tools/validate.js`, `server/index.js` (final state: clean),
`PLAN.md`, `ASSESS.md`, `package.json` (final state: uuid 9.0.1 present),
`.gitignore`, `legacy/`

---

## Git log after this milestone (relevant commits)

```
6393892  Reapply "refactor(game): replace node-uuid with uuid 9.0.1 (F-11)"  ← Test A cleanup
92f63c8  Revert "refactor(game): replace node-uuid with uuid 9.0.1 (F-11)"  ← Test A rollback
c5df176  Revert "test-regression: controlled connected2 regression..."  ← Test D rollback
7beb787  test-regression: controlled connected2 regression...  ← Test D regression
3ef19ad  Revert "demo-regression: rename connected event to connected2..."  ← prior WIP revert
2cc8316  chore: ignore all validation/*.json runtime outputs
8a68cb2  demo-regression: rename connected event to connected2...  ← prior WIP regression
08a5728  wip: rollback tool in progress (temporary — will be amended)
67f1b3b  feat(validation): add validation runner for behavioral safety net
```

---

## Limitations noted

- Rollback does not restart running server processes — operator must do this manually
- The rollback tool does not automatically identify *which* modernization commit failed;
  the caller (operator or future UI) must specify the commit hash
- No automatic "safer retry" logic is implemented (by design — that is a future milestone)
- The tool only works with commits that are ancestors of HEAD on the current branch

---

## Status

**Rollback + Recovery milestone complete.**

The full cycle `FAIL → ROLLBACK → PASS` has been demonstrated with real Git commits
and real Docker-based test execution. No mocked results. No hardcoded counts.

Next milestone: connect rollback/recovery to the Legacy Code Whisperer UI workflow.
