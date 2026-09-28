# Persistent Filesystem Layout for Legacy Code Whisperer

## Overview

This document defines the production filesystem layout and persistence requirements.
The layout is derived from the actual implementation in:
- `tools/validate.js`
- `tools/checkpoint.js`
- `tools/rollback.js`
- `backend/src/checkpointRunner.ts`
- `backend/src/modernization/executor.ts`
- `backend/src/routes/analyze.ts`

---

## Directory Structure

```
/opt/legacy-code-whisperer/
├── repo/                          # ← PERSISTENT (Git repository root)
│   ├── .git/                      # ← PERSISTENT (Git history)
│   ├── frontend/                  # ← PERSISTENT (Frontend source)
│   ├── backend/                   # ← PERSISTENT (Backend source)
│   │   ├── src/                   # ← PERSISTENT
│   │   ├── dist/                  # ← EPHEMERAL (build output, regenerated on deploy)
│   │   ├── test/                  # ← PERSISTENT (Tests)
│   │   ├── package.json           # ← PERSISTENT
│   │   └── tsconfig.json          # ← PERSISTENT
│   ├── tools/                     # ← PERSISTENT (Validation engine)
│   │   ├── validate.js            # ← PERSISTENT (Spawns Docker)
│   │   ├── checkpoint.js          # ← PERSISTENT (Orchestrates validation)
│   │   ├── rollback.js            # ← PERSISTENT (Git revert)
│   │   └── *.test.js              # ← PERSISTENT
│   ├── legacy/                    # ← PERSISTENT (Legacy Get24 baseline)
│   │   └── get24-baseline/
│   │       ├── tests/             # ← PERSISTENT (18 behavioral tests)
│   │       └── repro/             # ← PERSISTENT (npm-shrinkwrap.json)
│   ├── validation/                # ← PERSISTENT (Runtime output)
│   │   ├── last-checkpoint.json   # ← PERSISTENT (Latest checkpoint result)
│   │   ├── last-rollback.json     # ← PERSISTENT (Latest rollback result)
│   │   ├── last-result.json       # ← PERSISTENT (Latest validation result)
│   │   ├── cp-validation-tmp.json # ← EPHEMERAL (Intermediate)
│   │   ├── cp-rollback-tmp.json   # ← EPHEMERAL (Intermediate)
│   │   └── cp-recovery-tmp.json   # ← EPHEMERAL (Intermediate)
│   ├── IBM_BOB/                   # ← PERSISTENT (Evidence)
│   ├── bob_sessions/              # ← PERSISTENT (Session records)
│   ├── ASSESS.md                  # ← PERSISTENT
│   ├── PLAN.md                    # ← PERSISTENT
│   └── LICENSE                    # ← PERSISTENT
│
├── validation/                    # ← SYMLINK or BIND MOUNT to repo/validation/
│
└── logs/                          # ← PERSISTENT (Optional, application logs)
```

---

## Persistence Classification

| Path | Classification | Reason |
|------|----------------|--------|
| `/opt/legacy-code-whisperer/repo/.git/` | **MUST PERSIST** | Git history required for worktrees, ancestry checks, `git revert` |
| `/opt/legacy-code-whisperer/repo/tools/` | **MUST PERSIST** | Checkpoint engine must exist in commit under test (`ENGINE_NOT_PRESENT` check) |
| `/opt/legacy-code-whisperer/repo/legacy/` | **MUST PERSIST** | 18 behavioral tests run inside Docker container |
| `/opt/legacy-code-whisperer/repo/validation/` | **MUST PERSIST** | Audit trail, checkpoint/rollback results survive restarts |
| `docker volume get24-nm` | **MUST PERSIST** | `node_modules` cache for node:6 container (avoids `npm install` on every run) |
| `/opt/legacy-code-whisperer/repo/backend/dist/` | **EPHEMERAL** | Regenerated on each deploy (`npm run build`) |
| `os.tmpdir()/lcw-wt-*` | **EPHEMERAL** | Checkpoint worktrees (created/destroyed per run) |
| `os.tmpdir()/lcw-exec-*` | **EPHEMERAL** | Executor worktrees (created/destroyed per run) |
| `os.tmpdir()/lcw-*` | **EPHEMERAL** | Analyzer clones (created/destroyed per analysis) |

---

## Implementation Dependencies

### `tools/validate.js`
```javascript
var ROOT = path.resolve(__dirname, '..');  // → /opt/legacy-code-whisperer/repo/
// Docker mount: -v ROOT:/app
// Named volume: -v get24-nm:/app/node_modules
```
**Requires:** Repo root persisted, `get24-nm` volume persisted.

### `tools/checkpoint.js`
```javascript
var ROOT = path.resolve(__dirname, '..');
var RESULT_DIR = path.join(ROOT, 'validation');  // → /opt/legacy-code-whisperer/repo/validation/
// Worktree created at os.tmpdir()/lcw-wt-<uuid> (ephemeral)
// Result written to validation/lcw-run.json (persistent)
```
**Requires:** Repo root persisted, `validation/` persisted.

### `tools/rollback.js`
```javascript
var ROOT = path.resolve(__dirname, '..');
var RESULT_DIR = path.join(ROOT, 'validation');
```
**Requires:** Repo root persisted, `validation/` persisted.

### `backend/src/checkpointRunner.ts`
```typescript
const worktreePath = path.join(os.tmpdir(), `lcw-wt-${runId}`);  // Ephemeral
const resultFile = path.join(worktreePath, "validation", RESULT_FILE_NAME);
// Spawns: node <worktree>/tools/checkpoint.js
// Worktree contains the commit under test → must have tools/checkpoint.js
```
**Requires:** Repo root persisted (so worktree has `tools/`).

### `backend/src/modernization/executor.ts`
```typescript
const worktreePath = path.join(os.tmpdir(), `lcw-exec-${uuidv4()}`);  // Ephemeral
// Creates worktree from main, applies operation, commits to lcw/modernization/<uuid>
// Branch persists for verify/rollback stages
```
**Requires:** Repo root persisted (Git repo with main branch).

### `backend/src/routes/analyze.ts`
```typescript
const tmpDir = path.join(os.tmpdir(), `lcw-${runId}`);  // Ephemeral
await cloneRepo(repoUrl, tmpDir);  // Shallow clone, discarded after analysis
```
**Requires:** Only temporary storage.

---

## Permissions

| Path | Owner | Permissions | Notes |
|------|-------|-------------|-------|
| `/opt/legacy-code-whisperer/` | `lcw:lcw` | `755` | Root directory |
| `/opt/legacy-code-whisperer/repo/` | `lcw:lcw` | `755` | Git repo |
| `/opt/legacy-code-whisperer/repo/validation/` | `lcw:lcw` | `755` | Writable by backend |
| `/opt/legacy-code-whisperer/repo/backend/dist/` | `lcw:lcw` | `755` | Build output |
| `/opt/legacy-code-whisperer/backend.env` | `lcw:lcw` | `600` | Secrets |
| `/etc/nginx/auth_token.conf` | `root:root` | `644` | Generated at deploy |
| `docker volume get24-nm` | (Docker managed) | — | Created by `docker volume create` |

---

## Backup Requirements

| What | Frequency | Method |
|------|-----------|--------|
| Git repo (`repo/`) | Daily | `tar` or `git bundle` |
| Validation directory | Daily | Included in repo backup |
| Docker volume `get24-nm` | Weekly | `docker run --rm -v get24-nm:/data -v /backup:/backup alpine tar -czf /backup/get24-nm-<date>.tar.gz -C /data .` |
| SSL certificates | On renewal | Let's Encrypt manages |

---

## Recovery Scenarios

| Failure | Recovery |
|---------|----------|
| VM lost | Provision new VM, restore `/opt/legacy-code-whisperer/repo/` from backup, recreate `get24-nm` volume, re-deploy |
| `validation/` corrupted | Restore from latest backup |
| `get24-nm` volume corrupted | `docker volume rm get24-nm && docker volume create get24-nm` (next validation run re-populates) |
| Backend binary corrupted | `cd /opt/legacy-code-whisperer/repo/backend && npm run build` |
| Git repo corrupted | `git fsck` or restore from backup |

---

## Validation Checklist (Pre-Deployment)

- [ ] `/opt/legacy-code-whisperer/repo/.git/` exists and has full history
- [ ] `/opt/legacy-code-whisperer/repo/tools/checkpoint.js` exists
- [ ] `/opt/legacy-code-whisperer/repo/legacy/get24-baseline/tests/` exists with 18 tests
- [ ] `/opt/legacy-code-whisperer/repo/validation/` is writable by `lcw` user
- [ ] `docker volume ls` shows `get24-nm`
- [ ] `docker run --rm -v /opt/legacy-code-whisperer/repo:/app node:6 ls /app/tools/checkpoint.js` works
- [ ] `sudo -u lcw bash -c 'cd /opt/legacy-code-whisperer/repo && node tools/validate.js'` runs 18 tests successfully