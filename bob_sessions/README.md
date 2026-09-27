# IBM Bob development evidence

This directory holds preserved session summaries related to Legacy Code Whisperer.
The summaries were produced with more than one tool; see each file's provenance
and [INDEX.md](INDEX.md) before attributing work to IBM Bob.

## What is in here

Each file is a dated **Task Session Summary**, named
`YYYY-MM-DD-<milestone>.md`. These historical records are preserved as written;
some headers contain attribution errors documented in
[`../IBM_BOB/README.md`](../IBM_BOB/README.md).

| File | Milestone |
|---|---|
| [`2026-09-26-execution-plan.md`](2026-09-26-execution-plan.md) | Execution plan |
| [`2026-09-26-validation-runner.md`](2026-09-26-validation-runner.md) | Milestone 1 — validation runner |
| [`2026-09-26-rollback-recovery.md`](2026-09-26-rollback-recovery.md) | Milestone 2 — rollback and recovery |
| [`2026-09-26-execute-verify-rollback.md`](2026-09-26-execute-verify-rollback.md) | Milestone 3 — Execute → Verify → Rollback → Recover orchestration |

See [INDEX.md](INDEX.md) for the evidence-to-area mapping.

## How the evidence maps to the project

The summaries cover planning and implementation work across the project. They
are not all IBM Bob sessions:

1. **Execution plan** — the modernization steps, each with its verification
   command and rollback condition (mirrors [`../PLAN.md`](../PLAN.md)).
2. **Validation runner** — capturing the legacy application's behavior as an
   executable safety net (mirrors [`../legacy/get24-baseline/tests/`](../legacy/get24-baseline/tests/))
   and the runner in [`../tools/validate.js`](../tools/validate.js).
3. **Rollback + recovery** — undoing a single modernization commit with
   `git revert` and proving the repository is clean afterwards
   ([`../tools/rollback.js`](../tools/rollback.js)).
4. **Execute → Verify → Rollback → Recover** — the orchestrator that ties them
   together and exposes it over the API
   ([`../tools/checkpoint.js`](../tools/checkpoint.js),
   [`../backend/src/routes/checkpoint.ts`](../backend/src/routes/checkpoint.ts)).

The longer-running usage log, change log and prompt log live in
[`../IBM_BOB/`](../IBM_BOB/); `IBM_BOB/README.md` states which tool produced
each record there.

## Rules these records follow

- **Nothing is edited after the fact.** Records are appended to, never
  rewritten, renumbered or tidied up after the session they describe.
- **No fabricated sessions.** Every file here corresponds to work that
  actually happened. Where a session covered tooling built with a different
  tool, the record says so explicitly instead of crediting it to Bob.
- **No secrets.** Credentials, tokens, API keys and environment values are
  excluded. Only variable names appear anywhere in this repository, and
  `.env` files are ignored by git.
- **No claim without a run.** Verdicts quoted in these records are copied from
  real command output, not from intent.
