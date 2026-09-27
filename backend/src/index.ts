import { createApp } from "./app";

const app = createApp();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ponytail: loopback-only, no auth — fine for the local demo. Bind 0.0.0.0 plus a
// shared token if this ever runs on a shared machine.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Legacy Code Whisperer backend running on http://localhost:${PORT}`);
  console.log(`POST /api/analyze   — analyze a GitHub repository`);
  console.log(`GET  /api/runs/:id  — retrieve a run by ID`);
  console.log(`POST /api/checkpoint-runs — create a checkpoint run from an analysis run ID`);
  console.log(`POST /api/checkpoint-runs/:id/verify — run the checkpoint engine (one at a time)`);
  console.log(`GET  /api/checkpoint-runs/:id — checkpoint lifecycle state and result`);
  console.log(`GET  /api/modernization/operations — allowlisted modernization operations`);
  console.log(`POST /api/modernization/execute — apply one operation (one at a time)`);
  console.log(`GET  /api/health    — health check`);
});
