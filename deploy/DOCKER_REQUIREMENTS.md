# Docker Requirements for Legacy Code Whisperer

## Overview

The legacy behavioral validation suite runs exclusively in a **Node 6 Docker container**.
This is a deliberate architectural decision: the 18 characterization tests are designed
to run against the exact legacy runtime (Node 6 + npm 3.10.10) to detect regressions
in the modernization process.

**Do not upgrade the container. Do not replace the test runner. Do not use `npm ci`.**

---

## Container Specification

| Property | Value |
|----------|-------|
| **Image** | `node:6` (official Docker Hub image) |
| **Node version** | 6.x (legacy LTS, EOL) |
| **npm version** | 3.10.10 (bundled with Node 6) |
| **Architecture** | linux/amd64 |
| **Working directory** | `/app` (mounted from host repo root) |
| **Command** | `bash -c 'npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh'` |

---

## Docker Invocation (from `tools/validate.js`)

```javascript
var DOCKER_ARGS = [
  'run', '--rm',
  '-v', ROOT + ':/app',              // Mount entire repo root
  '-v', 'get24-nm:/app/node_modules', // Named volume for npm cache
  '-w', '/app',
  'node:6',
  'bash', '-c',
  'npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh'
];
```

**Equivalent CLI:**
```bash
docker run --rm \
  -v /opt/legacy-code-whisperer/repo:/app \
  -v get24-nm:/app/node_modules \
  -w /app \
  node:6 \
  bash -c 'npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh'
```

---

## Mount Details

| Mount | Source | Target | Purpose |
|-------|--------|--------|---------|
| Bind mount | `/opt/legacy-code-whisperer/repo` | `/app` | Repository root (tools/, legacy/, validation/) |
| Named volume | `get24-nm` | `/app/node_modules` | Persistent npm cache across runs |

**Why named volume?** The `node:6` container runs `npm install` (not `npm ci`) because npm 3 lacks `npm ci`. The named volume caches `node_modules` so subsequent runs skip the install step (~20-60s savings).

---

## Security Model

### Current (VM Deployment)
- Backend runs directly on VM as `lcw` user
- Backend spawns `docker` CLI directly
- Docker daemon runs on host (root)
- **Risk**: If backend is compromised, attacker can run arbitrary Docker commands (root equivalent)

### Mitigations (if needed later)
1. **Rootless Docker**: Run Docker daemon as non-root user
2. **Podman**: Drop-in replacement, rootless by default
3. **Separate validation worker**: Backend calls worker API; worker has Docker access
4. **Docker socket proxy**: Limit allowed Docker API operations

**For hackathon**: Accept the risk, document it, use minimal VM with no other services.

---

## Host Requirements

| Requirement | Details |
|-------------|---------|
| **Docker Engine** | 24.0+ (Docker Desktop / Docker Engine on Linux) |
| **Docker CLI** | Available in `PATH` for `lcw` user |
| **Docker daemon** | Running, accessible via `/var/run/docker.sock` |
| **User permissions** | `lcw` user in `docker` group |
| **Disk space** | ~2-5 GB for images + volumes + container layers |
| **Memory** | ~512 MB - 1 GB available for container |

---

## Named Volume: `get24-nm`

```bash
# Create once during provisioning
docker volume create get24-nm

# Verify
docker volume ls
docker volume inspect get24-nm

# If corrupted, recreate
docker volume rm get24-nm
docker volume create get24-nm
```

**Purpose**: Caches `node_modules` from `npm install` inside the Node 6 container.
Without this, every validation run re-installs all dependencies (~30-60s).

---

## Legacy Test Suite (`legacy/get24-baseline/tests/run.sh`)

The container runs this script which executes 18 behavioral tests:
- `characterization.test.js`
- `game-events.test.js`
- `state.test.js`
- etc.

**Output**: TAP format parsed by `tools/validate.js` → JSON result written to `validation/last-result.json`

---

## Why Not `npm ci`?

From `tools/validate.js` comments (lines 57-79):

> `npm ci` was introduced in npm 5.7.0; node:6 ships npm 3.10.10, and no flag makes it available.
> Upgrading the container would stop this being a legacy characterization target.
> The root package-lock.json is deliberately NOT committed... npm 3 does not even write one.
> The reproducible reference install is captured the old way, in legacy/get24-baseline/repro/npm-shrinkwrap.json.

**Do not change this.** The test `validation-tooling.test.js` locks this decision.

---

## Docker Availability Check

Before deployment, verify:

```bash
# As lcw user
docker version --format '{{.Server.Version}}'
docker run --rm node:6 node --version
docker run --rm -v /opt/legacy-code-whisperer/repo:/app -w /app node:6 ls tools/checkpoint.js
```

Expected:
- Docker daemon responds
- `node --version` → `v6.x.x`
- `ls tools/checkpoint.js` → shows file exists

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `docker: command not found` | Docker CLI not installed / not in PATH | Install Docker, add `lcw` to `docker` group |
| `permission denied` on `/var/run/docker.sock` | `lcw` not in `docker` group | `usermod -aG docker lcw` → re-login |
| `node:6` image pull fails | Network / Docker Hub rate limit | Pre-pull: `docker pull node:6` |
| `npm install` hangs | Network / registry | Check connectivity; use `--registry` if needed |
| Tests fail with `ENOENT` | `legacy/get24-baseline/tests/run.sh` not found | Verify repo mount: `docker run --rm -v /opt/legacy-code-whisperer/repo:/app node:6 ls /app/legacy/get24-baseline/tests/run.sh` |
| `npm ci` not found | Expected — npm 3 doesn't have it | Do not change to `npm ci` |

---

## Validation Test (End-to-End)

```bash
# As lcw user, from repo root
cd /opt/legacy-code-whisperer/repo
node tools/validate.js

# Expected: PASS, 18 tests, ~20-60s first run, ~5-10s subsequent (cached)
```

**Success criteria:**
- Exit code 0
- Output shows "Validation result : PASS"
- `passed: 18`, `failed: 0`, `total: 18`
- `validation/last-result.json` created with `status: "PASS"`

---

## Prohibited Changes (Do Not Modify)

| File/Behavior | Reason |
|---------------|--------|
| `node:6` image | Legacy characterization target |
| `npm install` → `npm ci` | npm 3 doesn't support `npm ci` |
| `legacy/get24-baseline/tests/` | Behavioral safety net |
| `tools/validate.js` Docker invocation | Core validation pipeline |
| `tools/checkpoint.js` orchestration | Execute → Verify → Rollback workflow |

These are frozen by design. The characterization suite's value depends on running against the exact legacy runtime.