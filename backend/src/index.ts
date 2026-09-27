import { createApp } from "./app";
import { loadServerConfig } from "./config";

const config = loadServerConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`Legacy Code Whisperer backend listening on ${config.host}:${config.port}`);
  console.log(`POST /api/analyze   — analyze a GitHub repository`);
  console.log(`GET  /api/runs/:id  — retrieve a run by ID`);
  console.log(`POST /api/checkpoint-runs — create a checkpoint run from an analysis run ID`);
  console.log(`POST /api/checkpoint-runs/:id/verify — run the checkpoint engine (one at a time)`);
  console.log(`GET  /api/checkpoint-runs/:id — checkpoint lifecycle state and result`);
  console.log(`GET  /api/modernization/operations — allowlisted modernization operations`);
  console.log(`POST /api/modernization/execute — apply one operation (one at a time)`);
  console.log(`GET  /api/health    — health check`);
});
