import { Router, Request, Response } from "express";
import { analyzeRepository, validateRepoUrl } from "../analyzer";
import type { WorkflowState, AnalyzeRequest } from "../types";

const router = Router();

// In-memory run store (replace with Redis/DB for production)
const runs = new Map<string, WorkflowState>();

// ── POST /api/analyze ─────────────────────────────────────────────────────────

router.post("/analyze", async (req: Request, res: Response): Promise<void> => {
  const { repoUrl, branch } = req.body as AnalyzeRequest;

  // Validate input
  if (!repoUrl || typeof repoUrl !== "string") {
    res.status(400).json({
      success: false,
      error: { code: "MISSING_URL", message: "repoUrl is required.", phase: "UNDERSTAND" },
    });
    return;
  }

  const parsed = validateRepoUrl(repoUrl.trim());
  if (!parsed) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_URL",
        message: "Only public GitHub HTTPS URLs are supported (https://github.com/owner/repo).",
        phase: "UNDERSTAND",
      },
    });
    return;
  }

  try {
    console.log(`[ANALYZE] Starting analysis for ${repoUrl}`);
    const workflow = await analyzeRepository(repoUrl.trim(), branch ?? "main");

    // Store run
    runs.set(workflow.runId, workflow);
    // Evict old runs (keep last 50)
    if (runs.size > 50) {
      const oldest = runs.keys().next().value;
      if (oldest) runs.delete(oldest);
    }

    res.json({ success: true, runId: workflow.runId, workflow });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "ANALYSIS_FAILED";
    const phase = (err as { phase?: string }).phase ?? "UNDERSTAND";
    const message = err instanceof Error ? err.message : "Repository analysis failed.";
    console.error(`[ANALYZE ERROR] ${code}: ${message}`);
    const status =
      code === "INVALID_URL" ? 400
      : code === "REPOSITORY_NOT_FOUND" ? 404
      : code === "CLONE_TIMEOUT" ? 504
      : 500;
    res.status(status).json({ success: false, error: { code, message, phase } });
  }
});

// ── GET /api/runs/:runId ──────────────────────────────────────────────────────

router.get("/runs/:runId", (req: Request, res: Response): void => {
  const runId = Array.isArray(req.params["runId"]) ? req.params["runId"][0] : req.params["runId"];
  const workflow = runs.get(runId);
  if (!workflow) {
    res.status(404).json({
      success: false,
      error: { code: "RUN_NOT_FOUND", message: "Run not found.", phase: "UNDERSTAND" },
    });
    return;
  }
  res.json({ success: true, runId, workflow });
});

// ── GET /api/health ───────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response): void => {
  res.json({ ok: true, runs: runs.size });
});

export default router;
