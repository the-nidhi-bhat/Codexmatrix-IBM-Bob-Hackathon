# validation/

This directory holds the structured JSON output from the Legacy Code Whisperer validation runner.

## Contents

| File | Description |
|---|---|
| `last-result.json` | Result of the most-recently completed validation run |
| `.gitkeep` | Keeps the directory tracked by Git even before any run |

## Result schema

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

## PASS / FAIL criteria

- **PASS**: `exitCode === 0` AND `failed === 0`
- **FAIL**: `exitCode !== 0` OR `failed > 0` OR runner process error

## What `last-result.json` is NOT

- It is not a substitute for the live test run.
- It captures the state at the moment `tools/validate.js` was last invoked.
- The workflow runner must always invoke `tools/validate.js` fresh; it must never
  read a stale `last-result.json` as a proxy for current test status.

## Limitations

- `last-result.json` is `.gitignore`d — it is ephemeral runtime output, not source.
- The runner requires Docker to be available on the host.
- The Docker named volume `get24-nm` must already exist (or `npm install` inside
  the container re-installs on each run, which is slow but correct).
- Git rollback restores source files only; it does not restart any running server
  process. The server must be restarted before re-running validation after a revert.
