# validation/

This directory holds the structured JSON output from the Legacy Code Whisperer
validation runner and rollback tool.

---

## Contents

| File | Description |
|---|---|
| `last-result.json` | Result of the most-recently completed validation run |
| `last-rollback.json` | Result of the most-recently completed rollback operation |
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

## Relationship between Validation and Rollback

| Tool | Question it answers |
|---|---|
| `tools/validate.js` | Did the current code preserve the protected behavior? |
| `tools/rollback.js` | How do we safely return to the last known-good state after a failure? |
| `tools/validate.js` (again) | Did the rollback actually restore correct behavior? |

These are three distinct operations. They must not be merged into a single
opaque function.
