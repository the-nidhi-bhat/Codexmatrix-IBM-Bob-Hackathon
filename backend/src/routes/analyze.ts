import { Router, Request, Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { analyzeRepository, validateRepoUrl } from "../analyzer";
import { runRepositoryVerification } from "../repositoryVerification";
import { executeApprovedOperation } from "../safeOperations";
import type { AnalyzeRequest, VerificationRun, WorkflowState } from "../types";

const router = Router();
const execFileAsync = promisify(execFile);

interface RunRecord {
  workflow: WorkflowState;
  workspacePath: string;
  busy: boolean;
}

const runs = new Map<string, RunRecord>();

function timestamp(): string {
  return new Date().toISOString();
}

function audit(record: RunRecord, type: "info" | "success" | "warn" | "error", message: string): void {
  record.workflow.report.auditTrail.push({ time: new Date().toTimeString().slice(0, 8), type, message });
  record.workflow.updatedAt = timestamp();
}

function updateProgress(record: RunRecord): void {
  const completed = record.workflow.plan.filter((step) => step.status === "passed" || step.status === "recovered").length;
  record.workflow.overallProgress = Math.round((completed / Math.max(record.workflow.plan.length, 1)) * 100);
  record.workflow.report.stepsCompleted = completed;
}

function runningVerification(stepId: number): VerificationRun {
  return {
    status: "running",
    stepId,
    suite: "Repository verification",
    duration: "running",
    coverage: 0,
    coverageNote: "Coverage is not provided by the detected runner.",
    tests: [],
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    exitCode: null,
    summary: "Verification is running.",
    output: "",
    command: null,
  };
}

async function revertModernization(record: RunRecord, targetCommit: string): Promise<string> {
  const workspace = record.workspacePath;
  if (targetCommit === record.workflow.execution.startingCommit) {
    throw new Error("Rollback refused because the target commit is the recorded baseline.");
  }
  const hooksPath = fs.mkdtempSync(path.join(os.tmpdir(), "lcw-hooks-"));
  const globalConfig = path.join(os.tmpdir(), `lcw-empty-git-config-${uuidv4()}`);
  fs.writeFileSync(globalConfig, "", "utf8");
  const gitOptions = {
    cwd: workspace,
    windowsHide: true,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: globalConfig },
  };
  try {
    const dirty = (await execFileAsync("git", ["status", "--porcelain"], gitOptions)).stdout.trim();
    if (dirty) throw new Error("Rollback refused because the retained run workspace has uncommitted changes.");
    const head = (await execFileAsync("git", ["rev-parse", "HEAD"], gitOptions)).stdout.trim();
    if (head !== targetCommit) throw new Error("Rollback refused because the modernization commit is not the workspace HEAD.");
    await execFileAsync("git", [
      "-c", "user.name=Legacy Code Whisperer",
      "-c", "user.email=legacy-code-whisperer@localhost",
      "-c", `core.hooksPath=${hooksPath}`,
      "-c", "commit.gpgsign=false",
      "revert", "--no-edit", targetCommit,
    ], { ...gitOptions, timeout: 60_000 });
    const rollbackHead = (await execFileAsync("git", ["rev-parse", "HEAD"], gitOptions)).stdout.trim();
    audit(record, "warn", `Rollback created a local revert commit ${rollbackHead}.`);
    return rollbackHead;
  } finally {
    fs.rmSync(hooksPath, { recursive: true, force: true });
    fs.rmSync(globalConfig, { force: true });
  }
}

function applyVerification(record: RunRecord, result: VerificationRun, scope: "baseline" | "checkpoint" | "recovery"): void {
  const workflow = record.workflow;
  workflow.checkpointResult = result;
  if (scope === "baseline") workflow.verification.baseline = result;
  if (scope === "recovery") workflow.verification.recovery = result;
  workflow.safetyNet = {
    total: result.total,
    passing: result.passed,
    failing: result.failed,
    generatedBy: result.command ? result.suite : "not run",
    createdAt: timestamp(),
  };
  workflow.currentPhase = scope === "baseline"
    ? result.status === "passed" ? "PLAN" : "PROTECT"
    : scope === "recovery"
      ? result.status === "passed" ? "REPORT" : "RECOVER"
      : result.status === "passed" ? "REPORT" : result.status === "failed" && workflow.execution.modernizationCommit ? "ROLLBACK" : "VERIFY";

  const activeStep = workflow.plan.find((step) => step.id === workflow.execution.currentStepId && step.operationId);
  if (scope === "checkpoint" && activeStep) {
    if (result.status === "passed") {
      activeStep.status = "passed";
      activeStep.testsDelta = result.summary;
    } else if (result.status === "not_available" || result.status === "not_run") {
      activeStep.status = "unverified";
      activeStep.testsDelta = `Not verified: ${result.summary}`;
    }
  }
  updateProgress(record);

  if (result.status === "failed") {
    workflow.overallStatus = "failed";
    audit(record, "error", result.summary);
  } else if (result.status === "passed") {
    if (workflow.overallStatus === "failed" && scope === "recovery") workflow.overallStatus = "rolled_back";
    audit(record, "success", result.summary);
  } else {
    audit(record, "warn", result.summary);
  }
}

async function runRecovery(record: RunRecord, stepId: number, originalResult: VerificationRun): Promise<void> {
  const rollback = record.workflow.rollback;
  let recovery: VerificationRun;
  try {
    recovery = await runRepositoryVerification(record.workspacePath, stepId);
  } catch (error) {
    recovery = runningVerification(stepId);
    recovery.status = "not_available";
    recovery.summary = error instanceof Error ? error.message : String(error);
  }
  applyVerification(record, recovery, "recovery");
  rollback.recoveryValidation = recovery.status === "passed" ? "passed" : recovery.status === "failed" ? "failed" : "not_run";
  if (recovery.status === "passed") {
    rollback.timeline.push({ status: "restored", label: "Recovery verified", time: new Date().toTimeString().slice(0, 8) });
  }
  record.workflow.report.stepsRolledBack += 1;
  record.workflow.report.rollbacks.push({
    step: String(rollback.stepId),
    time: new Date().toTimeString().slice(0, 8),
    reason: originalResult.summary,
    recovery: recovery.summary,
  });
}

function startVerification(record: RunRecord, scope: "baseline" | "checkpoint"): void {
  if (record.busy) return;
  const stepId = scope === "baseline" ? record.workflow.plan[0]?.id ?? 1 : record.workflow.execution.currentStepId;
  record.busy = true;
  record.workflow.operationStatus = "running";
  record.workflow.currentPhase = scope === "baseline" ? "PROTECT" : "VERIFY";
  record.workflow.checkpointResult = runningVerification(stepId);
  if (scope === "baseline") record.workflow.verification.baseline = record.workflow.checkpointResult;
  audit(record, "info", `Started ${scope} repository verification in an isolated runner.`);

  void (async () => {
    try {
      const result = await runRepositoryVerification(record.workspacePath, stepId);
      applyVerification(record, result, scope);

      const modernizationCommit = record.workflow.execution.modernizationCommit;
      const activeStep = record.workflow.plan.find((step) => step.id === record.workflow.execution.currentStepId && step.operationId);
      if (scope === "checkpoint" && result.status === "failed" && modernizationCommit) {
        const rollback = record.workflow.rollback;
        rollback.rollbackStatus = "running";
        rollback.stepId = activeStep?.id ?? stepId;
        rollback.targetCommit = modernizationCommit;
        rollback.failedCommit = modernizationCommit;
        rollback.previousCommit = record.workflow.execution.startingCommit ?? "";
        const failedTest = result.tests.find((test) => test.status === "failed");
        rollback.failedTestName = failedTest?.name ?? "Verification failed";
        rollback.failedTestFile = failedTest?.file ?? "";
        rollback.failedTestLine = failedTest?.line ?? 0;
        rollback.errorMessage = failedTest?.error ?? result.summary;
        rollback.timeline.push({ status: "regression", label: "Verification failed", time: new Date().toTimeString().slice(0, 8) });

        try {
          rollback.rollbackCommit = await revertModernization(record, modernizationCommit);
          rollback.rollbackStatus = "complete";
          if (activeStep) {
            activeStep.status = "rolled_back";
            const change = record.workflow.report.changesApplied.find((entry) => entry.title === activeStep.title);
            if (change) change.status = "rolled-back";
          }
          rollback.timeline.push({ status: "rollback", label: "Rollback completed", time: new Date().toTimeString().slice(0, 8) });
          rollback.recoveryValidation = "running";
          record.workflow.currentPhase = "RECOVER";
          await runRecovery(record, stepId, result);
        } catch (error) {
          rollback.rollbackStatus = "failed";
          rollback.errorMessage = error instanceof Error ? error.message : String(error);
          rollback.recoveryValidation = "not_run";
          if (activeStep) activeStep.status = "failed";
          const change = activeStep && record.workflow.report.changesApplied.find((entry) => entry.title === activeStep.title);
          if (change) change.status = "failed";
          audit(record, "error", `Rollback could not be completed: ${rollback.errorMessage}`);
        }
        updateProgress(record);
      }
    } catch (error) {
      const result = runningVerification(stepId);
      result.status = "not_available";
      result.summary = error instanceof Error ? error.message : String(error);
      applyVerification(record, result, scope);
    } finally {
      record.busy = false;
      record.workflow.operationStatus = "complete";
      record.workflow.report.endedAt = timestamp();
      const elapsedMs = Math.max(0, Date.parse(record.workflow.report.endedAt) - Date.parse(record.workflow.report.startedAt));
      record.workflow.report.duration = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;
      record.workflow.updatedAt = timestamp();
    }
  })();
}

// In-memory session store; each record owns the retained clone for its full run.
export async function cleanupRunWorkspaces(): Promise<void> {
  const idleRuns = [...runs.entries()].filter(([, record]) => !record.busy);
  await Promise.all(idleRuns.map(([, record]) => fs.promises.rm(record.workspacePath, { recursive: true, force: true }).catch(() => undefined)));
  for (const [runId] of idleRuns) runs.delete(runId);
}

router.post("/analyze", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AnalyzeRequest;
  const repoUrl = body?.repoUrl;
  const branch = body?.branch;
  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    res.status(400).json({ success: false, error: { code: "MISSING_URL", message: "repoUrl is required.", phase: "UNDERSTAND" } });
    return;
  }
  if (branch !== undefined && typeof branch !== "string") {
    res.status(400).json({ success: false, error: { code: "INVALID_BRANCH", message: "branch must be a string.", phase: "UNDERSTAND" } });
    return;
  }
  if (!validateRepoUrl(repoUrl.trim())) {
    res.status(400).json({ success: false, error: { code: "INVALID_URL", message: "Only public GitHub HTTPS URLs are supported (https://github.com/owner/repo).", phase: "UNDERSTAND" } });
    return;
  }

  try {
    const { workflow, workspacePath } = await analyzeRepository(repoUrl.trim(), branch?.trim() || undefined);
    const record: RunRecord = { workflow, workspacePath, busy: false };
    runs.set(workflow.runId, record);
    startVerification(record, "baseline");

    if (runs.size > 50) {
      const oldest = [...runs.entries()].find(([, candidate]) => candidate !== record && !candidate.busy);
      if (oldest) {
        runs.delete(oldest[0]);
        void fs.promises.rm(oldest[1].workspacePath, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    res.json({ success: true, runId: workflow.runId, workflow });
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "ANALYSIS_FAILED";
    const phase = typeof error === "object" && error !== null && "phase" in error && typeof error.phase === "string" ? error.phase : "UNDERSTAND";
    const message = error instanceof Error ? error.message : "Repository analysis failed.";
    const status = code === "INVALID_URL" ? 400 : code === "REPOSITORY_NOT_FOUND" ? 404 : code === "CLONE_TIMEOUT" ? 504 : 500;
    res.status(status).json({ success: false, error: { code, message, phase } });
  }
});

router.post("/runs/:runId/execute", (req: Request, res: Response): void => {
  const runId = Array.isArray(req.params["runId"]) ? req.params["runId"][0] : req.params["runId"];
  const record = runs.get(runId);
  if (!record) {
    res.status(404).json({ success: false, error: { code: "RUN_NOT_FOUND", message: "Run not found.", phase: "UNDERSTAND" } });
    return;
  }
  if (record.busy) {
    res.status(409).json({ success: false, error: { code: "RUN_BUSY", message: "A workflow operation is already running.", phase: record.workflow.currentPhase } });
    return;
  }
  const step = record.workflow.plan.find((candidate) => candidate.status === "pending" && candidate.operationId === "create-analysis-readme");
  if (!step) {
    record.workflow.currentPhase = "EXECUTE";
    record.workflow.execution.status = "not_available";
    record.workflow.execution.message = "No approved repository-specific transformation is available. No files were changed.";
    record.workflow.operationStatus = "idle";
    audit(record, "warn", record.workflow.execution.message);
    res.json({ success: true, runId, workflow: record.workflow });
    return;
  }
  const baseline = record.workflow.verification.baseline;
  if (baseline?.status !== "passed" || baseline.passed < 1) {
    record.workflow.currentPhase = "EXECUTE";
    record.workflow.execution.status = "not_available";
    record.workflow.execution.message = "Execution is blocked because no passing baseline verification result is available.";
    record.workflow.operationStatus = "idle";
    audit(record, "warn", record.workflow.execution.message);
    res.json({ success: true, runId, workflow: record.workflow });
    return;
  }

  record.busy = true;
  record.workflow.currentPhase = "EXECUTE";
  record.workflow.operationStatus = "running";
  record.workflow.execution.currentStepId = step.id;
  record.workflow.execution.status = "running";
  record.workflow.execution.message = `Applying approved operation: ${step.title}`;
  step.status = "running";
  audit(record, "info", record.workflow.execution.message);
  res.status(202).json({ success: true, runId, workflow: record.workflow });

  void (async () => {
    try {
      const executed = await executeApprovedOperation(record.workspacePath, record.workflow, step);
      record.workflow.execution.startingCommit = executed.startingCommit;
      record.workflow.execution.modernizationCommit = executed.modernizationCommit;
      record.workflow.execution.filesChanged = executed.filesChanged;
      record.workflow.execution.status = "complete";
      record.workflow.execution.message = "Change committed locally in the retained run workspace; waiting for verification.";
      record.workflow.report.changesApplied.push({
        title: step.title,
        files: executed.filesChanged.map((change) => change.file),
        status: "applied",
        time: new Date().toTimeString().slice(0, 8),
      });
      record.busy = false;
      audit(record, "success", `Created local modernization commit ${executed.modernizationCommit}.`);
      startVerification(record, "checkpoint");
    } catch (error) {
      step.status = "failed";
      record.workflow.execution.status = "failed";
      record.workflow.execution.message = error instanceof Error ? error.message : String(error);
      record.workflow.errors.push(record.workflow.execution.message);
      record.workflow.overallStatus = "failed";
      record.busy = false;
      record.workflow.operationStatus = "failed";
      updateProgress(record);
      audit(record, "error", `Execution failed: ${record.workflow.execution.message}`);
    }
  })();
});

router.post("/runs/:runId/verify", (req: Request, res: Response): void => {
  const runId = Array.isArray(req.params["runId"]) ? req.params["runId"][0] : req.params["runId"];
  const record = runs.get(runId);
  if (!record) {
    res.status(404).json({ success: false, error: { code: "RUN_NOT_FOUND", message: "Run not found.", phase: "UNDERSTAND" } });
    return;
  }
  if (record.busy) {
    res.status(409).json({ success: false, error: { code: "RUN_BUSY", message: "A workflow operation is already running.", phase: record.workflow.currentPhase } });
    return;
  }
  const baseline = record.workflow.verification.baseline;
  startVerification(record, baseline === null || baseline.status === "not_available" ? "baseline" : "checkpoint");
  res.status(202).json({ success: true, runId, workflow: record.workflow });
});

router.get("/runs/:runId", (req: Request, res: Response): void => {
  const runId = Array.isArray(req.params["runId"]) ? req.params["runId"][0] : req.params["runId"];
  const record = runs.get(runId);
  if (!record) {
    res.status(404).json({ success: false, error: { code: "RUN_NOT_FOUND", message: "Run not found.", phase: "UNDERSTAND" } });
    return;
  }
  res.json({ success: true, runId, workflow: record.workflow });
});

router.get("/health", (_req: Request, res: Response): void => {
  res.json({ ok: true, runs: runs.size });
});

export default router;