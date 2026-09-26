# IBM Bob Prompts Log

Record of important prompts/tasks given to IBM Bob and the resulting work performed.

---

## Prompt 001 — Legacy Analysis + Risk Review (arati/risk-analysis branch)

**Date:** 2026-09-26  
**Team member:** Arati (IBM Bob IDE)  
**User Prompt Summary:**

> Improve and validate the existing modernization risk analysis for Get24. Focus on concrete evidence from the actual code. For every important finding record: finding, affected file, evidence, risk level, why it matters, affected behavior, modernization opportunity, existing behavioral test coverage. Do NOT invent metrics. Do NOT modify the legacy production application.

**Rules applied:**

1. Inspect current repo state before acting
2. Read ASSESS.md and PLAN.md before producing anything
3. Ground every claim in a specific file and line number
4. Do not repeat what ASSESS.md already covers accurately — add genuine value
5. Do not modify ASSESS.md, PLAN.md, or any application source
6. Stage only the file I created; push to my own branch

**Work Performed by IBM Bob:**

- Set up branch `arati/risk-analysis` from `baseline/import-get24` (Steps 1+2 applied)
- Performed full code inspection of all 11 application files + all 5 test infrastructure files
- Cross-referenced against ASSESS.md (22 findings) and PLAN.md (7 steps)
- Identified genuine gaps not in the existing documentation:
  - `public/favicon.ico` missing — `serve-favicon` will throw at Step 5 startup
  - 3 specific harness break points for Step 6 with exact lines
  - `validate()` regex/edge-case analysis
  - 7 untested behaviors that are regression risks
  - `playerCount` negative-value edge case
  - `gameList` memory leak
- Produced `legacy/get24-baseline/analysis/ASSESS-ARATI.md`

**Resulting Files Created:**

- `legacy/get24-baseline/analysis/ASSESS-ARATI.md`
- `IBM_BOB/BOB_USAGE.md` (this record)
- `IBM_BOB/BOB_CHANGES.md`
- `IBM_BOB/BOB_PROMPTS.md`

**Files NOT Modified:**

- `ASSESS.md` (Nidhi/OpenCode — not touched)
- `PLAN.md` (Nidhi/OpenCode — not touched)
- All legacy application source files

**Branch:** `arati/risk-analysis`  
**Commit:** `97ca37f`  
**Outcome:** ✅ Analysis committed and pushed. Stopping as instructed.

---

## Prompt 002 — Legacy Analysis + Risk Review v2 (arati/risk-analysis branch)

**Date:** 2026-09-26 (second session)
**Team member:** Arati (IBM Bob IDE)
**User Prompt Summary:**

> Improve and validate the existing modernization risk analysis for Get24. Focus on concrete evidence from the actual code. Use IBM Bob meaningfully for the analysis. For every important finding record: finding, affected file, evidence, risk level, why it matters, affected behavior, modernization opportunity, existing behavioral test coverage. DO NOT invent any metrics or claims not supported by the code. Do NOT modify the legacy production application.

**Rules applied:**

1. Re-read all source files before producing new analysis
2. Verify v1 claims are still accurate
3. Check whether PLAN.md was updated since v1 (it was — favicon gap resolved)
4. Add only findings grounded in specific file + line number
5. Do not touch ASSESS.md, PLAN.md, or application source
6. Stage only intended files; push to same branch

**Work Performed by IBM Bob:**

- Full re-inspection of all legacy source, test files, and tracking docs
- Verified PLAN.md Step 5 now addresses the favicon gap (v1's main new finding)
- Added 6 new findings (F-23 through F-28) with code evidence
- Expanded Step 6 harness break-point table from 3 to 5 entries
- Produced complete KineticJS → Konva 9.3.18 API mapping (50+ call sites)
- Comprehensive `validate()` analysis with whitespace trace and edge case table
- Updated IBM_BOB tracking files

**Resulting Files Modified:**

- `legacy/get24-baseline/analysis/ASSESS-ARATI.md` (v1 → v2)
- `IBM_BOB/BOB_USAGE.md`
- `IBM_BOB/BOB_CHANGES.md`
- `IBM_BOB/BOB_PROMPTS.md`

**Files NOT Modified:**

- `ASSESS.md` (Nidhi/OpenCode — not touched)
- `PLAN.md` (Nidhi/OpenCode — not touched)
- All legacy application source files

**Branch:** `arati/risk-analysis`
**Outcome:** ✅ Analysis v2 committed and pushed.

---

## Prompt 003 — Modernization Execution Specification (arati/risk-analysis branch)

**Date:** 2026-09-26 (third session)
**Team member:** Arati (IBM Bob IDE)
**User Prompt Summary:**

> Create a precise, implementation-ready modernization execution specification for Get24. Connect ASSESS findings to modernization steps, affected files, expected behavior, protecting tests, validation commands, success conditions, rollback conditions, and recovery actions. Document completed steps 1–2. Include a demo specification for Socket.IO modernization with controlled regression scenario. Use IBM Bob meaningfully. Create bob_sessions/ summary. Commit and push.

**Rules applied:**

1. Inspect all source files and test files before writing a word of the execution plan
2. Use only real test names, real commands, real file/line evidence — no invented results
3. Do not implement any modernization
4. Do not touch ASSESS.md, PLAN.md, application source, or test files
5. Create bob_sessions/ if it does not exist
6. Stage only intended documentation files; push to same branch

**Work Performed by IBM Bob:**

- Full re-inspection of: `server/index.js`, `server/game/index.js`, `package.json`, `index.js`, `public/js/SocketController.js`, `public/js/StageController.js`, `public/index.html`, all 3 test files, `harness.js`, `run.sh`, `tests/README.md`, `ASSESS.md`, `PLAN.md`, `ASSESS-ARATI.md`
- Confirmed `bob_sessions/` does not exist; created it
- Confirmed current Step 1 and Step 2 evidence in live code
- Created `legacy/get24-baseline/analysis/EXECUTION-PLAN-ARATI.md`
- Created `bob_sessions/2026-09-26-execution-plan.md`
- Updated IBM_BOB tracking files

**Resulting Files Created:**

- `legacy/get24-baseline/analysis/EXECUTION-PLAN-ARATI.md`
- `bob_sessions/2026-09-26-execution-plan.md`

**Files Updated:**

- `IBM_BOB/BOB_USAGE.md`
- `IBM_BOB/BOB_CHANGES.md`
- `IBM_BOB/BOB_PROMPTS.md`

**Files NOT Modified:**

- `ASSESS.md` (Nidhi/OpenCode — not touched)
- `PLAN.md` (Nidhi/OpenCode — not touched)
- All legacy application source files
- All test files

**Branch:** `arati/risk-analysis`
**Outcome:** ✅ Execution specification committed and pushed.
