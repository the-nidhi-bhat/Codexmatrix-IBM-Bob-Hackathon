# Legacy Code Whisperer backend

Node.js, Express 4, and TypeScript API. `src/index.ts` listens on `127.0.0.1`, port `3001` by default for local development. `src/app.ts` configures JSON parsing, CORS, bearer authentication, routes, and structured error responses.

## Local development

```sh
npm ci
npm run dev
```

Set `PORT` to change the listening port. Local development defaults to loopback and does not require authentication. Production defaults to `0.0.0.0` and requires both `API_AUTH_TOKEN` and `FRONTEND_ORIGIN`. Any non-loopback `HOST` also requires `API_AUTH_TOKEN`.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Set to `production` to select the deployment defaults and require deployment security settings. |
| `PORT` | Listening port; defaults to `3001` and must be an integer from 1 through 65535. |
| `HOST` | Bind address; defaults to `127.0.0.1` locally and `0.0.0.0` in production. |
| `API_AUTH_TOKEN` | Server-side bearer token required for every `/api` route except `GET /api/health` when configured; required in production or for non-loopback binds. Store it in the host's secret manager. |
| `FRONTEND_ORIGIN` | One exact HTTP(S) origin added to the CORS allowlist; required in production and must use HTTPS outside localhost. |

Send protected API requests with `Authorization: Bearer <API_AUTH_TOKEN>`. CORS also allows the two existing local frontend origins. The token is a server secret and must never be put in Vite environment variables or browser code. The currently deployed static frontend does not send this bearer token; connecting it to an authenticated hosted backend requires a server-side proxy or real user-authentication design. No backend deployment is configured by this repository.

## Routes

| Method | Route | Request | Result |
|---|---|---|---|
| `GET` | `/api/health` | None | Health response |
| `POST` | `/api/analyze` | `{ "repoUrl": "https://github.com/owner/repo" }` | Analysis run and workflow |
| `GET` | `/api/runs/:runId` | Run ID in path | Server-held analysis workflow |
| `GET` | `/api/modernization/operations` | None | Allowlisted operation summaries |
| `POST` | `/api/modernization/execute` | `{ "analysisRunId": "…", "operationId": "…" }` | Updated workflow, including execution result |
| `POST` | `/api/checkpoint-runs` | `{ "analysisRunId": "…" }` | New checkpoint-run view |
| `POST` | `/api/checkpoint-runs/:id/verify` | Checkpoint run ID in path | Verification result/status |
| `GET` | `/api/checkpoint-runs/:id` | Checkpoint run ID in path | Checkpoint-run view/status |

## Implementation boundary

`src/analyzer.ts` validates public GitHub HTTPS URLs, shallow-clones to a temporary directory, detects stack signals, and generates heuristic findings without installing or running code from the clone. `src/modernization/operations.ts` defines a small exact-match allowlist for the included Get24 application. `src/modernization/executor.ts` applies those edits in an isolated worktree based on `main`; it does not modify the arbitrary URL analyzed by the analyzer. `src/checkpointRunner.ts` invokes the repository's checkpoint tool in a temporary worktree and reports cleanup outcomes.

Analysis and checkpoint run records live in process memory and disappear when the API process restarts. The modernization and revert commits remain on server-owned local Git run branches. Docker is needed for the legacy behavioral suite.

## Checks

```sh
npm test
```

This builds TypeScript and runs the backend Node test suite sequentially. `npm run build` performs the TypeScript build alone.
