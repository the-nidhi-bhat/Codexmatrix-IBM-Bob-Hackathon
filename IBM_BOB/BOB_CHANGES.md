# IBM Bob Changes Log

Concise technical record of every change made with IBM Bob — files affected, tools used, and verification status.

---

## Change 001 — IBM_BOB Documentation Folder Created

**Date:** 2025-09-25  
**Related Usage Entry:** BOB_USAGE.md Entry 001

### Files Created

| File | Action | Description |
|------|--------|-------------|
| `IBM_BOB/BOB_USAGE.md` | Created | Chronological log of IBM Bob contributions |
| `IBM_BOB/BOB_CHANGES.md` | Created | This file — technical change record |
| `IBM_BOB/BOB_PROMPTS.md` | Created | Record of user prompts and resulting work |

### Tools/Commands Used

| Tool | Purpose |
|------|---------|
| `list_files` (recursive) | Full workspace inventory |
| `read_file` | Read README.md, .opencode/memory/project.md, .gitignore, .opencode/package.json |
| `execute_command` (`git log`) | Reviewed commit history |
| `write_file` | Created all three IBM_BOB documentation files |

### Verification

- Files created successfully (confirmed by tool output)
- No existing files were modified or deleted
- No secrets or .env files were touched
- `.opencode/` folder was read-only inspected, not modified

### Notes

No application source code exists in the project yet. The workspace is a bare Git scaffold. All three IBM_BOB files were net-new additions with no destructive impact.

---

## Change 002 — Frontend Dashboard Scaffolded (React + Vite + TypeScript)

**Date:** 2025-09-26  
**Related Usage Entry:** BOB_USAGE.md Entry 003

### Files Created

| File | Action | Description |
|------|--------|-------------|
| `frontend/` | Created (directory) | Vite + React + TypeScript project root |
| `frontend/src/mockData.ts` | Created | Full mock data layer — repoInfo, safetyNet, risks, planSteps, executionState, rollbackScenario |
| `frontend/src/index.css` | Replaced | Dark-mode design system tokens, utility classes |
| `frontend/src/App.css` | Replaced | Animation keyframes (fadeIn, pulse) |
| `frontend/src/App.tsx` | Replaced | Main shell: sticky header, sidebar navigation, screen router |
| `frontend/src/screens/OverviewScreen.tsx` | Created | Overview screen — repo info, safety net badge, progress ring, plan mini-list |
| `frontend/src/screens/RiskScreen.tsx` | Created | Risk assessment screen — severity pills, filterable/expandable risk cards |
| `frontend/src/screens/PlanScreen.tsx` | Created | Plan screen — interactive timeline with per-step detail panels |
| `frontend/src/screens/ExecutionScreen.tsx` | Created | Execution screen — animated activity log, file diff summary, live test status, pass/fail/rollback toggle |
| `frontend/src/screens/RollbackScreen.tsx` | Created | Rollback screen — step-through demo: regression → rollback → restore → Bob explanation |

### Tools/Commands Used

| Tool / Command | Purpose |
|----------------|---------|
| `list_files`, `read_file` | Workspace inspection before writing any code |
| `npm create vite@latest` | Project scaffold |
| `npm install` | Install dependencies |
| `write_file` | All source files |
| `apply_diff` | TypeScript import fixes (verbatimModuleSyntax compliance) |
| `npx tsc --noEmit` | Type-check without building |
| `npm run build` | Production bundle verification |

### Verification

- `npx tsc --noEmit` — **0 errors**
- `npm run build` — **✓ built in 606ms**, bundle: 249 kB JS / 1.66 kB CSS
- Dev server launched on `http://localhost:5173`
- All 5 screens navigable, all mock data wired

### Architecture

```
frontend/src/
├── mockData.ts              — typed mock data for all screens
├── App.tsx                  — shell (header + sidebar + router)
├── index.css                — design system (CSS variables, dark theme)
├── App.css                  — animation keyframes
└── screens/
    ├── OverviewScreen.tsx   — Phase: Understand · Protect
    ├── RiskScreen.tsx       — Phase: Assess
    ├── PlanScreen.tsx       — Phase: Plan
    ├── ExecutionScreen.tsx  — Phase: Execute · Verify
    └── RollbackScreen.tsx   — Phase: Rollback · Recover
```
