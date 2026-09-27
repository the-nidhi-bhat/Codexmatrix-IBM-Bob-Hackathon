# validation/

This directory holds the structured JSON output from the Legacy Code Whisperer
validation runner and rollback tool.

---

## Contents

| File | Description |
|---|---|
| `last-result.json` | Result of the most-recently completed validation run |
| `last-rollback.json` | Result of the most-recently completed rollback operation |
| `last-checkpoint.json` | Result of the most-recently completed checkpoint (orchestration) run |
| `cp-*-tmp.json` | Intermediate validation/rollback results of a checkpoint run |
| `.gitkeep` | Keeps the directory tracked by Git before any runtime output is produced |

All `*.json` files in this directory are `.gitignore`d — they are ephemeral
runtime output, not source.

---

## Validation (`tools/validate.js`)

### Purpose

> "Did the current code preserve the protected behavior?"

Runs the full behavioral safety net inside a Node 6 Docker container and
produces a structured PASS/FAIL result.

### Usage

```bash
node tools/validate.js
node tools/validate.js --result-file validation/last-result.json
```

### Result schema

```json
{
  "status":    "PASS | FAIL",
  "passed":    "<count of passing tests>",
  "failed":    "<count of failing tests>",
  "skipped":   "<count of skipped tests>",
  "total":     "<total tests executed>",
  "exitCode":  "<process exit code from the test runner>",
  "command":   "<exact shell command that was executed>",
  "timestamp": "<ISO-8601 UTC timestamp of when the run started>",
  "output":    "<full combined stdout+stderr from the test container>",
  "error":     "<null, or an error message if the runner itself failed>"
}
```

### PASS / FAIL criteria

- **PASS**: `exitCode === 0` AND `failed === 0`
- **FAIL**: `exitCode !== 0` OR `failed > 0` OR runner process error

### Limitations

- Requires Docker to be available on the host.
- The named Docker volume `get24-nm` must already exist (or `npm install`
  re-runs inside the container on each invocation, which is slow but correct).
- `last-result.json` is ephemeral — workflows must always invoke
  `tools/validate.js` fresh; they must never read a stale `last-result.json`
  as a proxy for current test status.

---

## Rollback (`tools/rollback.js`)

### Purpose

> "How do we safely return the source tree to the last known-good
> modernization state after validation fails?"

Reverts a specific modernization commit using `git revert`, which creates a
new commit that undoes the targeted change. The full Git history is preserved.

**This tool does not run validation.** After rollback, run
`tools/validate.js` separately to confirm recovery.

### Usage

```bash
node tools/rollback.js <commit>
node tools/rollback.js <commit> --result-file validation/last-rollback.json
node tools/rollback.js --help
```

### Arguments

| Argument | Description |
|---|---|
| `<commit>` | Full or abbreviated hash of the modernization commit to revert. Must be an ancestor of HEAD on the current branch. |
| `--result-file <path>` | Write the JSON result here instead of the default `validation/last-rollback.json`. |

### Result schema

```json
{
  "status":             "ROLLED_BACK | REFUSED | FAILED",
  "targetCommit":       "<hash of the commit that was reverted>",
  "revertCommit":       "<hash of the new revert commit, or null>",
  "branch":             "<current branch name>",
  "reason":             "<human-readable explanation>",
  "originalAuthor":     "<author of the original commit>",
  "originalDate":       "<date of the original commit>",
  "filesChanged":       ["<files that changed in the revert>"],
  "validationRequired": true,
  "runtimeNote":        "<note about restarting a running server>",
  "timestamp":          "<ISO-8601 timestamp>"
}
```

### Safety checks (in order)

The tool refuses **without modifying the repository** if any of these fail:

| # | Check | Refused reason |
|---|---|---|
| 1 | `git` is on PATH | git not available |
| 2 | Working tree is clean | Uncommitted changes detected |
| 3 | Target commit exists | Hash not found in this repository |
| 4 | Target commit is an ancestor of HEAD | Commit is not in this branch's history |
| 5 | Target commit is not validation/rollback infrastructure | Would destroy the safety net |

On refusal the tool exits 1 and writes a `REFUSED` result. The repository is
**not modified**.

### Git mechanism

Uses `git revert --no-edit <commit>` — this creates a new commit that
reverses the targeted change. It does **not** use `git reset --hard` and does
**not** force-push. The history clearly shows:

```
modernization commit
    ↓
validation failure (detected externally)
    ↓
revert commit  ← created by this tool
```

### Runtime limitation

`git revert` restores source files on disk. It does **not** affect any
already-running Node.js server process. If the application server is running,
it must be restarted before re-running validation after a rollback.

### Recovery workflow

```
VALIDATION FAIL
      ↓
node tools/rollback.js <failed-modernization-commit>
      ↓
(restart server if running)
      ↓
node tools/validate.js
      ↓
PASS / FAIL
```

---

## Orchestration (`tools/checkpoint.js`)

### Purpose

> "Given a modernization commit that is already applied, did it preserve
> behavior — and if not, can the workflow get back to a known-good state
> without losing history?"

`tools/checkpoint.js` connects the two tools above into the
**Execute → Verify → Rollback → Recover** loop. It adds no validation logic and
no Git logic of its own: it runs `tools/validate.js` and `tools/rollback.js` as
child processes and reads their JSON results back.

### Usage

```bash
node tools/checkpoint.js <commit> [--result-file validation/last-checkpoint.json]
node tools/checkpoint.js --help
```

| Argument | Description |
|---|---|
| `<commit>` | The modernization commit to verify. It must already be applied and committed on the current branch. |
| `--result-file <path>` | Write the JSON result here instead of the default `validation/last-checkpoint.json`. |

### States

| State | Meaning | Exit code |
|---|---|---|
| `VERIFIED` | Validation passed. The commit becomes the new known-good checkpoint. | 0 |
| `VALIDATION_FAILED` | Validation failed **and** rollback was refused/failed. Manual intervention required. | 3 |
| `RECOVERY_VERIFIED` | Validation failed, the commit was rolled back, and validation passed again. | 1 |
| `RECOVERY_FAILED` | The commit was rolled back but validation still fails. The failure is not explained by that commit. | 2 |
| `REFUSED` | A pre-condition failed. The repository was not modified. | 3 |

`ROLLBACK_STARTED` and `ROLLED_BACK` are progress states: they are printed to
the console and recorded in `rollbackResult.status`, but they are never final —
a checkpoint always continues into recovery validation.

### Flow

```
                       ┌──────────────────────────────┐
                       │ 1. pre-flight safety checks  │──► REFUSED (exit 3)
                       └──────────────┬───────────────┘
                                      ▼
                       ┌──────────────────────────────┐
                       │ 2. VERIFYING                 │  tools/validate.js
                       └──────────────┬───────────────┘
                          PASS │              │ FAIL
                               ▼              ▼
                          VERIFIED      ┌────────────────────────────┐
                          (exit 0)      │ 3. ROLLBACK_STARTED        │  tools/rollback.js
                                         └─────────────┬──────────────┘
                                          ROLLED_BACK │      │ REFUSED / FAILED
                                                       ▼      ▼
                                         ┌──────────────────┐  VALIDATION_FAILED
                                         │ 4. RECOVERY      │  (exit 3)
                                         │    VERIFYING     │  tools/validate.js
                                         └────────┬─────────┘
                                    PASS │              │ FAIL
                                         ▼              ▼
                              RECOVERY_VERIFIED   RECOVERY_FAILED
                                 (exit 1)            (exit 2)
```

### Pre-flight safety checks (before anything runs)

The tool refuses **without modifying the repository** and without running the
test suite if:

1. no commit was given;
2. the working tree is not clean;
3. the commit does not exist in this repository;
4. the commit is not an ancestor of `HEAD` (the change is not applied yet);
5. the commit is the validation/rollback infrastructure itself
   (subject starting with `feat(validation):` or `feat(rollback):`) — rolling
   back the safety net must be impossible from here.

`tools/rollback.js` repeats checks 2–5 for its own operation, so the rollback
inside a checkpoint is refused independently of this tool.

### Result schema (`validation/last-checkpoint.json`)

```json
{
  "status":              "VERIFIED | VALIDATION_FAILED | RECOVERY_VERIFIED | RECOVERY_FAILED | REFUSED",
  "modernizationStep":   "<commit subject line>",
  "startingCommit":      "<HEAD when the checkpoint started — equal to modernizationCommit, because the change is already applied>",
  "modernizationCommit": "<full hash of the commit being verified>",
  "branch":              "<current branch name>",
  "validationResult":    "<tools/validate.js result object, or null if refused>",
  "rollbackResult":      "<tools/rollback.js result object, or null when not needed>",
  "recoveryValidation":  "<second tools/validate.js result object, or null>",
  "finalStatus":         "<one-line human-readable explanation>",
  "timestamp":           "<ISO-8601 timestamp>",
  "runtimeNote":         "<server-restart note, set on the rollback paths>"
}
```

Rollback status, rollback commit and rollback reason are **not duplicated** at
the top level; read them from the nested objects the sub-tools already own:

| What the UI needs | Where it is |
|---|---|
| validation status | `validationResult.status` |
| total / passed / failed / skipped | `validationResult.total` / `.passed` / `.failed` / `.skipped` |
| rollback status | `rollbackResult.status` (`ROLLED_BACK` / `REFUSED` / `FAILED`) |
| rollback commit | `rollbackResult.revertCommit` |
| rollback reason | `rollbackResult.reason` |
| recovery status | `recoveryValidation.status` (+ counts) |
| final workflow status | `status` |
| human-readable summary | `finalStatus` |

### Server restart limitation

`git revert` restores source **files only**. It does not affect an
already-running Node process. When validation runs through the Docker harness
each suite starts a fresh server subprocess, so a restart is not needed and
recovery validation always sees the rolled-back source. If the application is
running on the host outside the harness, restart it before trusting a recovery
run. `runtimeNote` in the result records this on every rollback path.

### What this tool does NOT do

- It does **not** apply a change. The modernization commit must already exist.
- It does **not** push, merge, rebase, `reset --hard`, or force-push anything.
- It does **not** modify `main`, and it does not check out branches.
- It does **not** stash or discard a dirty working tree — it refuses.
- It does **not** restart a running server.
- It does **not** re-run or replace `tools/validate.js` / `tools/rollback.js`.
- It does **not** retry or repair a failing modernization step; `RECOVERY_FAILED`
  is a hand-off to a human, not a retry loop.
- It is **not** a CI gate: it needs Docker on the host and takes minutes.

### Checking the refusals

```bash
node tools/checkpoint.test.js
```

Six fast checks, no Docker and no repository mutation: usage, missing commit,
dirty working tree, unknown commit, commit outside the branch history, and
infrastructure protection. The two Docker-backed paths (VERIFIED and
RECOVERY_VERIFIED) are verified by running the tool for real — the recorded
results are in `bob_sessions/2026-09-26-execute-verify-rollback.md`.

---

## Relationship between Validation and Rollback

| Tool | Question it answers |
|---|---|
| `tools/validate.js` | Did the current code preserve the protected behavior? |
| `tools/rollback.js` | How do we safely return to the last known-good state after a failure? |
| `tools/validate.js` (again) | Did the rollback actually restore correct behavior? |
| `tools/checkpoint.js` | Which of the three above should run now, and in which order? |

These are three distinct operations. They must not be merged into a single
opaque function. `tools/checkpoint.js` only *sequences* them as child
processes and reports their results; each tool keeps its own logic, its own
result file and its own exit code.
