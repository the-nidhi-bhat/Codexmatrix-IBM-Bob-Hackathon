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
