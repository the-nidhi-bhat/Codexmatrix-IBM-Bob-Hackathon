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

## Prompt 003 — Legacy Analysis + Risk Assessment (Arati's task)

**Date:** 2026-09-26  
**Team member:** Arati (IBM Bob IDE)  
**User Prompt Summary:**

> Create a structured, evidence-based modernization analysis that the Legacy Code Whisperer product can use. Focus on legacy runtime/dependency risks, deprecated APIs, untested/high-risk behavior, affected files/modules, risk level and WHY, modernization opportunity, expected blast radius, relevant existing behavioral tests, and recommended modernization order. Keep it grounded in the real Get24 repository. Make it easy for the UI/backend to consume later. Do NOT modify the actual legacy application code, Nidhi's ASSESS.md/PLAN.md, or .opencode/.

**Rules applied:**

1. Do not modify any legacy application source code
2. Do not modify ASSESS.md or PLAN.md (Nidhi/OpenCode work)
3. Do not invent metrics, coverage percentages, or vulnerability scores
4. Ground every finding in a specific file and line number
5. Stage only the files I created; do not commit Nidhi's files
6. Commit with a descriptive message; push to a named branch
7. Record what IBM Bob actually did — not what it reviewed or read

**Work Performed by IBM Bob:**

- Pulled latest main and fetched all remote branches
- Discovered `baseline/import-get24` branch (Nidhi's Get24 import)
- Checked out legacy app files read-only to analyse without modifying
- Performed full source inspection of all 11 application files
- Cross-referenced existing `ASSESS.md` (22 findings) and `PLAN.md` (7 steps) — both by Nidhi/OpenCode, not modified
- Analysed all 3 test files + test harness to understand the 18-test safety net in detail
- Synthesised findings into two structured JSON artifacts:
  - `legacy/get24-baseline/analysis/legacy-analysis.json`
  - `legacy/get24-baseline/analysis/risk-report.json`
- Verified no secrets in output; staged only the 2 intended files; committed and pushed

**Resulting Files Created:**

- `legacy/get24-baseline/analysis/legacy-analysis.json`
- `legacy/get24-baseline/analysis/risk-report.json`

**Files Explicitly NOT Modified:**

- `ASSESS.md` (Nidhi/OpenCode)
- `PLAN.md` (Nidhi/OpenCode)
- `.opencode/` (not present on this machine; not touched)
- All legacy application source files

**Branch:** `arati/legacy-analysis`  
**Commit:** `04176aa`  
**Outcome:** ✅ Completed. Artifacts pushed. Stopping as instructed — no UI, backend, rollback, or code modernization work started.
