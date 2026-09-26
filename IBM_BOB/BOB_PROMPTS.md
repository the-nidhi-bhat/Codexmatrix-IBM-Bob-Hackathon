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
