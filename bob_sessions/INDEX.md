# IBM Bob Evidence Index

Every row points to a file that exists in this repository. Nothing here is
inferred or reconstructed.

| Evidence | Development area | What it documents |
|---|---|---|
| [`2026-09-26-execution-plan.md`](2026-09-26-execution-plan.md) | Planning | Analysis → plan: the modernization steps, each with its exact change, verification command and rollback condition |
| [`2026-09-26-validation-runner.md`](2026-09-26-validation-runner.md) | Implementation, testing | Building the behavioral safety net and the validation runner that executes it in the legacy runtime |
| [`2026-09-26-rollback-recovery.md`](2026-09-26-rollback-recovery.md) | Implementation, recovery | `git revert` of a single modernization commit, and proving the tree is clean afterwards |
| [`2026-09-26-execute-verify-rollback.md`](2026-09-26-execute-verify-rollback.md) | Implementation, testing, verification | The Execute → Verify → Rollback → Recover orchestrator, its refusal tests and the milestone verification run |
| [`../IBM_BOB/BOB_USAGE.md`](../IBM_BOB/BOB_USAGE.md) | Repository analysis, development workflow | The long-running Bob usage log for this repository |
| [`../IBM_BOB/BOB_CHANGES.md`](../IBM_BOB/BOB_CHANGES.md) | Implementation | Change-oriented Bob record |
| [`../IBM_BOB/BOB_PROMPTS.md`](../IBM_BOB/BOB_PROMPTS.md) | Development workflow | Prompt-oriented Bob record |
| [`../IBM_BOB/README.md`](../IBM_BOB/README.md) | Evidence integrity | Which tool produced each record, and what has no evidence yet |

Repository analysis output that the sessions refer to is committed as
[`../ASSESS.md`](../ASSESS.md) and
[`../legacy/get24-baseline/analysis/`](../legacy/get24-baseline/analysis/).
