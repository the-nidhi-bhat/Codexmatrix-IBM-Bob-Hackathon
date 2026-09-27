import express from "express";
import cors from "cors";
import analyzeRouter from "./routes/analyze";
import checkpointRouter from "./routes/checkpoint";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
app.use(express.json({ limit: "1mb" }));

// Mount routes
app.use("/api", analyzeRouter);
app.use("/api", checkpointRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Endpoint not found.", phase: "UNDERSTAND" } });
});

// ponytail: loopback-only, no auth — fine for the local demo. Bind 0.0.0.0 plus a
// shared token if this ever runs on a shared machine.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Legacy Code Whisperer backend running on http://localhost:${PORT}`);
  console.log(`POST /api/analyze   — analyze a GitHub repository`);
  console.log(`GET  /api/runs/:id  — retrieve a run by ID`);
  console.log(`POST /api/checkpoint-runs — create a checkpoint run from an analysis run ID`);
  console.log(`POST /api/checkpoint-runs/:id/verify — run the checkpoint engine (one at a time)`);
  console.log(`GET  /api/checkpoint-runs/:id — checkpoint lifecycle state and result`);
  console.log(`GET  /api/health    — health check`);
});
