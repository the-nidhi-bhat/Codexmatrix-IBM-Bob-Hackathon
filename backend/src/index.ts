import express from "express";
import cors from "cors";
import analyzeRouter from "./routes/analyze";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
app.use(express.json({ limit: "1mb" }));

// Mount routes
app.use("/api", analyzeRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Endpoint not found.", phase: "UNDERSTAND" } });
});

app.listen(PORT, () => {
  console.log(`Legacy Code Whisperer backend running on http://localhost:${PORT}`);
  console.log(`POST /api/analyze   — analyze a GitHub repository`);
  console.log(`GET  /api/runs/:id  — retrieve a run by ID`);
  console.log(`GET  /api/health    — health check`);
});
