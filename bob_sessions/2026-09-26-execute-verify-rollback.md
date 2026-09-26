# Bob Task Session — Execute → Verify → Rollback → Recover orchestration (Milestone 3)

**Project:** Legacy Code Whisperer
**Session date:** 2026-09-26
**Branch:** `nidhi/validation-rollback`
**Starting commit:** `2a732d3` (`feat(rollback): add safe rollback and recovery workflow`, the remote tip)
**Milestone commit:** the commit containing this file, subject
`feat(validation): orchestrate execute verify rollback recovery`

## Provenance of this record (read first)

This file is a factual record of work that actually happened in this
repository. It is written in the project's `bob_sessions/` evidence format,
but honesty about attribution matters more than the format:

- The implementation and every test run recorded below were carried out by the
  **OpenCode coding agent** working in this repository on this branch, across
  two working sessions (an earlier session and the session that produced this
  file).
- **IBM Bob itself was not used to write or run any of it.** No Bob GUI
  session, prompt transcript, or screenshot exists for this milestone, so none
  is claimed here. Nothing below should be read as "Bob did this".
- Every number in this file comes from a real command whose output is quoted.
  No result was simulated, estimated, or copied from an earlier milestone.

---

## What the task was

> Build the smallest safe orchestration layer connecting
> EXECUTE → VERIFY → ROLLBACK ON FAILURE → RECOVER / RE-VERIFY, by reusing
> `tools/validate.js` and `tools/rollback.js`. No new npm dependencies, no
> dependency modernization, no second validation runner, no second rollback
> implementation, no `reset --hard`, no force-push, refuse unsafe conditions,
> and produce structured output a future UI can consume.

---

## Files inspected

| Artifact | What was learned |
|---|---|
| `git status --porcelain` | Working tree clean after safeguarding untracked `validation/*.json` leftovers (see Limitations) |
| `git log --oneline` | `2a732d3` remote tip; three unpushed WIP commits above it from an earlier session |
| `tools/validate.js` | 168 lines. Spawns the real Docker/Node 6 suites, parses the `# N tests, …` summaries, writes `{status, passed, failed, skipped, total, exitCode, command, timestamp, output, error}`, accepts `--result-file`, exits 0/1 |
| `tools/rollback.js` | 311 lines. Five safety checks, then `git revert --no-edit`, writes `{status, targetCommit, revertCommit, branch, reason, originalAuthor, originalDate, filesChanged, validationRequired, runtimeNote, timestamp}`, exits 0/1 |
| `tools/checkpoint.js` | 411 lines, added by the earlier session in the unpushed WIP commit `69fb68c` — a complete first implementation of the orchestrator, reviewed rather than rewritten |
| `validation/README.md` | 176 lines documenting validation and rollback; no orchestration section, no `last-checkpoint.json` row |
| `.gitignore` | `node_modules` and `validation/*.json` — all runtime output is ignored |
| `server/index.js` line 92 | `socket.emit('connected', { numUsers: ++numConnections })` — clean state before the controlled regression |

---

## Implementation decisions that were actually made

1. **Kept the existing `tools/checkpoint.js` instead of writing a second
   orchestrator.** The brief allowed improving a partial implementation; a
   second orchestrator would have been the duplicate the brief forbids. It was
   reviewed line by line against `tools/validate.js` and `tools/rollback.js`
   and its calls, result-field names and exit codes were confirmed to match
   both tools, so it was left functionally unchanged.
2. **Delegation, not reimplementation.** The orchestrator runs the two existing
   tools as child processes (`spawnSync('node', [validate.js, …])`) and reads
   their JSON result files back. It adds no test-running logic and no Git
   logic.
3. **No new npm dependencies.** Only Node built-ins: `child_process`, `fs`,
   `path`. It runs on the host Node (v24.13.0) while the legacy app still runs
   inside `node:6` via Docker.
4. **Final states:** `VERIFIED`, `RECOVERY_VERIFIED`, `RECOVERY_FAILED`,
   `VALIDATION_FAILED` (validation failed *and* rollback was refused/failed),
   `REFUSED`. `ROLLBACK_STARTED` and `ROLLED_BACK` are progress states: printed
   to the console and present in `rollbackResult.status`, never final, because
   a checkpoint always continues into recovery validation.
5. **Rollback status / commit / reason are not duplicated at the top level.**
   They are read from the nested `rollbackResult` object that
   `tools/rollback.js` already owns, so the two can never drift apart. The
   exact read-path for a UI is documented in `validation/README.md`.
6. **`startingCommit` equals `modernizationCommit` in practice**, because the
   commit under test is already applied. This was documented rather than
   "fixed" with an invented second notion of known-good.
7. **The cheap safety checks were automated; the two Docker-backed paths were
   not.** `tools/checkpoint.test.js` runs six refusal checks (usage, missing
   commit, dirty tree, unknown commit, commit outside the branch history,
   infrastructure protection) in about a second with no Docker and no
   repository mutation. `VERIFIED` and `RECOVERY_VERIFIED` each need the real
   behavioral suite, so they were verified by running the tool for real; the
   outputs are quoted below.
8. **History was consolidated into one milestone commit.** The three unpushed
   WIP commits from the earlier session and the commits made while testing this
   milestone were folded into a single commit on top of `2a732d3` with
   `git reset --soft` (no `--hard`, no file discarded, no force-push). The old
   hashes remain in the reflog and are listed at the end of this file.

---

## Tests actually executed

### Test A — PASS path (Execute → Verify → VERIFIED)

Target: `6393892` — `Reapply "refactor(game): replace node-uuid with uuid 9.0.1 (F-11)"`,
a real behavior-preserving modernization step already in the branch history.

```bash
node tools/checkpoint.js 6393892 --result-file validation/last-checkpoint.json
```

```
# 4 tests, 4 passed, 0 failed, 0 skipped      (http)
# 4 tests, 4 passed, 0 failed, 0 skipped      (socket)
# 10 tests, 10 passed, 0 failed, 0 skipped    (game events)

Validation result : PASS
  passed  : 18
  failed  : 0
  skipped : 0
  total   : 18
  exit    : 0

Checkpoint status : VERIFIED
  commit          : 6393892aca3d — Reapply "refactor(game): replace node-uuid with uuid 9.0.1 (F-11)"
  tests passed    : 18
  tests failed    : 0
exit code: 0
```

No rollback, no recovery run. ✅

### Test B — failure path (Execute → Verify → FAIL → Rollback → Recover → PASS)

**Step 1 — controlled regression.** `server/index.js` line 92:

```diff
-        socket.emit('connected', { numUsers: ++numConnections });
+        socket.emit('connected2', { numUsers: ++numConnections });
```

Committed as `82c63a6 test-regression: controlled connected2 for checkpoint Test B (temporary)`.

**Step 2 — one command for the whole cycle.**

```bash
node tools/checkpoint.js 82c63a6 --result-file validation/last-checkpoint.json
```

Verification phase:

```
not ok 2 - server emits connected with an incrementing numUsers count
  Error: timed out after 5000ms waiting for "connected" x1; received: connect, gameJoined, timer, …
not ok 10 - a connection past maxConnections is rejected: no connected, no gameJoined, disconnect
  Error: timed out after 5000ms waiting for "connected" x1; received: connect, gameJoined, timer, …

Validation result : FAIL
  passed  : 16
  failed  : 2
  skipped : 0
```

Rollback phase:

```
Rollback result   : ROLLED_BACK
  revert commit   : ea49fc93b638
  files changed   : server/index.js
```

Recovery phase:

```
# 4 tests, 4 passed, 0 failed, 0 skipped
# 4 tests, 4 passed, 0 failed, 0 skipped
# 10 tests, 10 passed, 0 failed, 0 skipped
Validation result : PASS
  passed  : 18
  failed  : 0

Checkpoint status : RECOVERY_VERIFIED
  revert commit   : ea49fc93b638
  recovery        : PASS (18/18 passed)
exit code: 1
```

`git diff` against the pre-regression tree was empty afterwards and
`server/index.js` again emits `connected`. The regression commit and its revert
remain in the reflog as the audit trail; the final branch state is clean. ✅

### Tests C and D — safety paths

```bash
node tools/checkpoint.test.js
```

```
ok 1 - --help prints usage and exits 0
ok 2 - no commit is refused
ok 3 - a dirty working tree is refused and left untouched
ok 4 - an unknown commit is refused
ok 5 - a commit outside the branch history is refused
ok 6 - the validation/rollback infrastructure cannot be checkpointed
# 6 tests, 6 passed, 0 failed, 0 skipped
exit code: 0
```

- **C (dirty tree):** an untracked probe file was created in the repository
  root; the tool exited 3 with `status: REFUSED` and the reason
  "Working tree is not clean…", listing the probe in `dirtyFiles`. The probe
  was removed by the test's `finally` block, and the test asserts
  `git status --porcelain` is empty afterwards. The test suite was never run,
  so a refusal can never cost a Docker run.
- **D (infrastructure protection):** the newest `feat(validation):` /
  `feat(rollback):` commit in the history (`2a732d3`) was passed as the target;
  the tool exited 3 with "…is the validation/rollback infrastructure. …".
  `tools/rollback.js` enforces the same rule independently, so even a manual
  rollback of the safety net is refused.

### A finding from testing the tests

The first version of check 5 used `upstream/master` as "a commit outside this
branch history". It is **not** outside: this branch was created from
`upstream/master` (the Get24 import), so `4749d7a` is an ancestor of `HEAD` and
the tool correctly proceeded to a full validation run instead of refusing. The
check was rewritten to scan local branches for a tip that is genuinely not an
ancestor. The tool was right; the test's assumption was wrong.

---

## Files changed in this milestone

| File | Change |
|---|---|
| `tools/checkpoint.js` | Orchestrator (written in the earlier session's WIP commit `69fb68c`, reviewed and kept) |
| `tools/checkpoint.test.js` | New — six fast refusal checks, no Docker, no repository mutation |
| `validation/README.md` | Updated — orchestration section: states, flow diagram, pre-flight checks, result schema and UI read-path, server-restart limitation, what the tool does not do, how to run the checks |
| `bob_sessions/2026-09-26-execute-verify-rollback.md` | New — this file |

**Files NOT changed:** `tools/validate.js`, `tools/rollback.js`, `server/**`,
`public/**`, `legacy/get24-baseline/tests/**` (the 18 behavioral tests are
untouched and unweakened), `package.json`, `.gitignore`, `IBM_BOB/**`,
`.opencode/**`.

**No dependency modernization was performed in this milestone.** Express 3,
Socket.IO 0.9 and Konva were left exactly as they were.

---

## Runtime limitation

`git revert` restores source files only; it does not affect an already-running
Node process. Inside the Docker harness every suite starts a fresh server
subprocess, so recovery validation always sees the rolled-back source and no
manual restart was needed for Test B. If the app is run on the host outside the
harness, it must be restarted before a recovery run is trustworthy. This is
recorded in `runtimeNote` on every rollback path.

---

## Limitations

- The tool does not apply changes. The modernization commit must already exist
  and be applied; validation always runs against the current working tree, so
  a multi-commit step is verified as a whole, not commit by commit.
- It does not push, merge, rebase, `reset --hard`, force-push, change branches,
  or touch `main`.
- It never stashes or discards a dirty tree — it refuses.
- It does not restart a running server, does not retry or repair a failing
  step (`RECOVERY_FAILED` is a hand-off to a human), and does not work out
  which commit caused a failure; the operator supplies the commit.
- It needs Docker on the host and takes a few minutes per validation.
- The commit argument is interpolated into `execSync`/`spawnSync` git commands
  exactly as the two existing tools do, so a shell-metacharacter argument is
  not sanitized. These are local developer-run tools; this was left consistent
  with `tools/validate.js` and `tools/rollback.js` rather than diverging.
- Intermediate `validation/cp-*-tmp.json` files stay on disk after a run. They
  are gitignored ephemeral output, like `last-result.json`.
- Untracked `validation/*.json` leftovers from the earlier rollback testing
  (20 files) were copied to
  `%LOCALAPPDATA%\Temp\opencode\validation-artifacts-backup\` and removed from
  the working tree so the checkpoint's clean-tree check could run and the final
  tree could be clean. They were not committed and were not destroyed.

---

## Status

**Orchestration milestone complete.** The cycle
`Execute → Verify → Rollback on failure → Recover` was demonstrated end to end
with real Git commits and real Docker-based test execution: one command
produced a verified checkpoint, and one command turned a regression into a
revert plus a passing recovery run. Six refusal paths were verified
separately.

Commits folded into the single milestone commit (all still in the reflog):

```
69fb68c  wip: checkpoint orchestrator (testing in progress — will be amended)
af38d4a  test-regression: controlled connected2 for checkpoint Test B …
2fcb19f  Revert "test-regression: controlled connected2 for checkpoint Test B …"
82c63a6  test-regression: controlled connected2 for checkpoint Test B (temporary)
ea49fc9  Revert "test-regression: controlled connected2 for checkpoint Test B (temporary)"
701405a  test(validation): add checkpoint refusal safety checks
90eb24f  test(validation): fix history-isolation check in checkpoint self-test
```

Recommended next milestone: point the Legacy Code Whisperer UI at
`validation/last-checkpoint.json` so a modernization step can be executed,
verified and rolled back from the dashboard, instead of from the command line.
