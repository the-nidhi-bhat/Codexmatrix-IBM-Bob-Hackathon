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

<!-- ===== integration merge: both branches recorded entries here; each side preserved verbatim ===== -->

# IBM Bob Prompts Log

Record of important prompts/tasks given to IBM Bob and the resulting work performed.

---

## Prompt 001 — Initial Setup and Project Inspection

**Date:** 2025-09-25  
**User Prompt Summary:**

> Set up IBM Bob documentation for the hackathon. Do NOT create an OpenCode folder. Create only one folder at the project root called IBM_BOB/. Before making changes, inspect the existing project, explain its structure, and identify what needs to be done. Create BOB_USAGE.md, BOB_CHANGES.md, and BOB_PROMPTS.md inside IBM_BOB/. Record this initial inspection as the first IBM Bob contribution. Then stop and wait for the next instruction.

**Rules established by user:**
1. No OpenCode folder — IBM_BOB/ only
2. Inspect before acting; do not rebuild working parts
3. No destructive changes, no secrets exposure
4. After every task: report what changed, which files, what tools, what IBM Bob contributed, what was verified, what failed, what remains
5. Keep IBM_BOB/ records as factual hackathon evidence
6. Do not falsely claim IBM Bob did work it did not do

**Work Performed by IBM Bob:**

- Recursively inventoried the workspace
- Read and analysed: `README.md`, `.opencode/memory/project.md`, `.gitignore`, `.opencode/package.json`
- Ran `git log --oneline -10` — found 3 commits (initial setup + .gitignore)
- Determined the project is a **bare Git scaffold** — project identity is "Codexmatrix", no app source code yet
- Created `IBM_BOB/` folder with all three required documentation files
- Reported findings and stopped as instructed

**Resulting Files:**
- `IBM_BOB/BOB_USAGE.md`
- `IBM_BOB/BOB_CHANGES.md`
- `IBM_BOB/BOB_PROMPTS.md`

**Outcome:** ✅ Completed successfully. Waiting for next instruction.

---

## Prompt 002 — Planning Attempt and Correction

**Date:** 2025-09-25
**User Prompt Summary (planning attempt):**

> Act as a product + technical planning assistant. Propose a concrete, buildable product for the hackathon. Include: product concept, user flow, MVP features, IBM Bob usage plan, tech stack, project structure, demo flow, differentiation, and risks.

**What IBM Bob did (planning attempt):**

- Produced a full product proposal based on the name "Codexmatrix", treating it as the product name
- Proposed a browser-based AI code review tool
- Proposed Next.js + Tailwind + TypeScript + OpenAI/watsonx.ai as the stack
- This work was **superseded by the correction below before any code or files were created**

---

**User Correction Prompt:**

> "Codexmatrix" is our TEAM NAME, not the application name. Do not assume a product concept. Wait for the actual hackathon challenge/problem statement before defining anything.

**Rules reinforced:**
1. Do not invent a product idea before the challenge is provided
2. Do not choose a tech stack before the challenge is provided
3. Do not create application code or install dependencies
4. Keep IBM_BOB/ as the only Bob-specific documentation folder
5. Update IBM_BOB records with this correction, then stop

**What IBM Bob did (correction):**

- Acknowledged the correction immediately
- Confirmed no application code or structure was created
- Updated `BOB_USAGE.md` with Entry 002 documenting the correction
- Updated `BOB_PROMPTS.md` (this file) with this record

**Outcome:** ✅ Correction recorded. Waiting for the actual hackathon problem statement/challenge.

---

## Prompt 003 — Build Legacy Code Whisperer Frontend Dashboard

**Date:** 2025-09-26

**User Prompt Summary:**

> Build the full frontend/dashboard for the Legacy Code Whisperer IBM Bob Hackathon project. Use React + Vite. Build 5 screens covering the Understand → Protect → Assess → Plan → Execute → Verify → Rollback → Recover workflow. Use mock data if backend isn't ready. The Rollback screen is the most important — it must clearly show: Regression detected → Rollback initiated → Previous state restored, then Bob's explanation and safer alternative. Include evidence of meaningful IBM Bob usage.

**Rules/Constraints from user:**

1. Use mock JSON/data for UI — don't wait for backend
2. Do NOT touch backend, rollback engine, AI architecture, or Bob configuration
3. Build clean, professional UI that makes the safety workflow visually obvious
4. Keep IBM_BOB/ records updated as hackathon evidence
5. Ask if stuck — don't redesign the whole project

**Work Performed by IBM Bob:**

- Inspected workspace (README, IBM_BOB docs, git status)
- Scaffolded `frontend/` with Vite + React + TypeScript
- Built complete design system and 5 screen components
- Wired all mock data and inter-screen navigation
- Verified build: 0 TS errors, production bundle clean
- Updated IBM_BOB documentation (BOB_USAGE.md Entry 003, BOB_CHANGES.md Change 002)

**Resulting Files:**

- `frontend/` — complete Vite + React + TypeScript project
- `frontend/src/mockData.ts` — typed mock data layer
- `frontend/src/App.tsx` — shell with header, sidebar, router
- `frontend/src/screens/OverviewScreen.tsx`
- `frontend/src/screens/RiskScreen.tsx`
- `frontend/src/screens/PlanScreen.tsx`
- `frontend/src/screens/ExecutionScreen.tsx`
- `frontend/src/screens/RollbackScreen.tsx`

**Outcome:** ✅ Complete. Dev server live at http://localhost:5173. All 5 screens functional with mock data.
