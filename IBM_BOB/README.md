# IBM Bob records — what is real, and what is not

This folder is the **only** place where IBM Bob usage is recorded. This file indexes the records, states who actually produced each one, and lists the evidence that does not exist. Nothing here is inferred, tidied up, or flattering.

Read this before reading the logs. Two of the four session summaries in `bob_sessions/` carry an `Agent: IBM Bob 2.0` header for work that was done with OpenCode; the records are left exactly as written, and the correction lives here.

## The three records

| File | What it logs | Authored by |
|---|---|---|
| `BOB_USAGE.md` | Chronological entries: what was done, what was deliberately not done, status | two independent sources, see below |
| `BOB_CHANGES.md` | Per-change record: files created, files read, commands, verification | two independent sources |
| `BOB_PROMPTS.md` | The prompts that were issued and what came of them | two independent sources |

Each file contains **two complete logs that were written independently** and then met during integration:

- **First half — Arati A Patil, `arati/risk-analysis`** (commits `97ca37f` … `d3a5651`). Three sessions: risk review v1, risk review v2, and the modernization execution specification. The matching session summary `bob_sessions/2026-09-26-execution-plan.md` states the tool as *IBM Bob IDE (Agent mode)*, so these entries are attested by their author as Bob work.
- **Second half — Nidhi Bhat, project scaffold line** (commits `c5cc6da`, `581058c`, `67edb3f`). Initial project inspection, the "Codexmatrix is the team name" correction, and the first dashboard build. These entries are written in the third person as *what IBM Bob did*; the work was performed in this repository with **OpenCode**, Nidhi's coding agent, not with IBM Bob.

The two halves are joined by a single HTML comment divider in each file. No entry was renumbered, reworded, reordered or removed, so both versions can be read as written. This index is the only correction.

## Session summaries in `bob_sessions/`

| File | Subject | Produced with |
|---|---|---|
| `2026-09-26-execution-plan.md` | Modernization execution specification, steps 1–7, checkpoint model, demo plan | **IBM Bob IDE (agent mode)** — stated in the file |
| `2026-09-26-validation-runner.md` | Milestone 1: `tools/validate.js` | OpenCode. The file's `Agent: IBM Bob 2.0` header is inaccurate; the file is unmodified |
| `2026-09-26-rollback-recovery.md` | Milestone 2: `tools/rollback.js`, the regression rehearsal and its revert | OpenCode. Same header inaccuracy; the file is unmodified |
| `2026-09-26-execute-verify-rollback.md` | Milestone 3: `tools/checkpoint.js` and `tools/checkpoint.test.js` | OpenCode, stated in the file's "Provenance of this record" section |

## What evidence does not exist

Stated plainly so nobody has to guess:

- There are **no IBM Bob screenshots** in this repository.
- There are **no Bob transcripts, chat logs, or exported session files**.
- The only positive evidence of Bob use is the **authors' own statements** in the records above, plus the artifacts they produced (`legacy/get24-baseline/analysis/ASSESS-ARATI.md`, `EXECUTION-PLAN-ARATI.md`).
- Nothing in this folder was reconstructed after the fact to fill a gap, and no entry describes work that did not happen.

If official Bob evidence — a screenshot or an exported session — becomes available, it belongs in `bob_sessions/` next to the session it documents, named for the date, and must not replace the plain statement above.

## Rules for these records

1. **Append, never rewrite.** A correction goes in a new entry that says what was wrong. Existing entries stay as written, including the ones this file flags.
2. **One log, one author, one branch.** If two people record work in the same file, keep the entries in separate, clearly titled blocks rather than interleaving them.
3. **State the tool in the entry.** Every entry says which tool did the work. If the tool is not IBM Bob, the entry does not belong in this folder as Bob work.
4. **Record the negative.** "What was not done" is part of the value: no production file was edited to make a test pass, no secrets touched, no force-push, no history rewritten.
5. **Bob work and OpenCode work stay separate.** OpenCode is a personal development tool, not part of the product. Its work is documented in `bob_sessions/` with its provenance stated, and is never presented as an IBM Bob contribution.
6. **No fabrication, ever.** No invented screenshots, transcripts, timings, test results, or tool claims. If it did not happen, it is not written down.

## Where the rest of the evidence lives

- `ASSESS.md`, `PLAN.md` — the findings and the step-by-step plan.
- `legacy/get24-baseline/analysis/` — the independent second-pass assessment and execution specification.
- `legacy/get24-baseline/tests/` — the 18 protected behavioral tests.
- `validation/README.md` — how the safety net, rollback and checkpoint tools work, and what they refuse to do.
- `bob_sessions/` — chronological session records, each stating its own provenance.
