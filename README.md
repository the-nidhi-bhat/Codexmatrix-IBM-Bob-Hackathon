# Legacy Code Whisper

**Team:** Codexmatrix

**Event:** IBM Bob 2.0 Hackathon

Legacy Code Whisperer is a safety-first developer workflow for modernizing legacy applications with IBM Bob.

> Legacy Code Whisperer does not blindly modify legacy code. It first protects existing behavior with tests, makes modernization changes incrementally, verifies every change, and rolls back when a regression is detected.

The product is currently at the foundation stage. The concept, workflow, and team responsibilities are defined; the legacy application and product implementation are not yet present.

## Core workflow

The planned workflow is:

**Understand → Protect → Assess → Plan → Execute → Verify → Rollback → Recover → Report**

These phases describe the intended safety process. They are not all implemented yet.

| Phase | Intended purpose |
|---|---|
| **Understand** | Inspect the legacy repository, its behavior, and its dependencies before changing anything. |
| **Protect** | Capture existing behavior with tests so it can be checked after changes. |
| **Assess** | Identify the risk and change surface of a proposed modernization. |
| **Plan** | Define small, incremental modernization steps. |
| **Execute** | Apply controlled changes to the legacy codebase. |
| **Verify** | Run the relevant checks and tests after each change. |
| **Rollback** | Revert a change when verification detects a regression. |
| **Recover** | Restore a safe, understandable state after a failed change. |
| **Report** | Record the change, evidence, and outcome. |

## Team responsibilities

| Team member | Responsibility |
|---|---|
| **Nidhi** | Technical lead |
| **Arati** | Documentation |
| **Iffa** | Frontend/UI |
| **Samrudhi** | Testing |

## IBM Bob

IBM Bob is intended to be a core part of the final solution. Potential Bob responsibilities include:

- Legacy repository understanding
- Behavioral test generation
- Modernization assessment
- Modernization planning
- Controlled code changes
- Verification
- Regression investigation
- Safer alternatives

These are planned responsibilities, not capabilities that are already implemented or measured.

## OpenCode

OpenCode is Nidhi's personal development tool and is separate from IBM Bob. Work performed with OpenCode is not recorded as an IBM Bob contribution.

## Current status

The repository is in the foundation stage:

- Project concept locked: **Legacy Code Whisperer**
- Safety workflow locked
- Team roles defined
- Repository initialized and connected to GitHub
- IBM Bob documentation established in `IBM_BOB/`
- Legacy application not yet imported
- Product implementation not yet started
- No product dependencies installed

## Documentation and evidence

- `IBM_BOB/` is the only location for IBM Bob documentation and records.
- `bob_sessions/` is the planned location for official IBM Bob session evidence when actual evidence is produced. It has not been created yet.
- The local `.opencode/` directory is Nidhi's personal tooling, not IBM Bob documentation or product source.

## Repository structure

```text
IBM-Bob-Hackathon/
├── IBM_BOB/               # IBM Bob documentation and records
│   ├── BOB_USAGE.md
│   ├── BOB_CHANGES.md
│   └── BOB_PROMPTS.md
├── .gitignore             # Protects secrets, env files, and build artifacts
└── README.md              # This file
```

*IBM Bob 2.0 Hackathon — Team Codexmatrix*
