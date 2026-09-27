# Legacy Code Whisperer backend

Local Node.js, Express 4, and TypeScript API. `src/index.ts` listens on `127.0.0.1`, port `3001` by default. `src/app.ts` configures JSON parsing, CORS, routes, and structured error responses.

## Local development

```sh
npm ci
npm run dev
```

Set `PORT` to change the local listening port. The API is intended for local development; it has no application authentication and should not be exposed as a public service.

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
