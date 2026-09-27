/**
 * Typed API client for the Legacy Code Whisperer backend.
 * Backend runs at http://localhost:3001 and is proxied via /api in Vite dev.
 */
import type { WorkflowState } from "../workflow/types";

// ── Shared error shape ────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  phase: string;
}

export class WorkflowApiError extends Error {
  readonly code: string;
  readonly phase: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, phase: string, httpStatus: number) {
    super(message);
    this.name = "WorkflowApiError";
    this.code = code;
    this.phase = phase;
    this.httpStatus = httpStatus;
  }
}

// ── Response envelopes ────────────────────────────────────────────────────────

interface AnalyzeResponse {
  success: true;
  runId: string;
  workflow: WorkflowState;
}

interface GetRunResponse {
  success: true;
  runId: string;
  workflow: WorkflowState;
}

interface ErrorResponse {
  success: false;
  error: ApiError;
}

const REQUEST_TIMEOUT_MS = 65_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isVerificationRun(value: unknown): boolean {
  return isRecord(value)
    && typeof value.status === "string"
    && typeof value.total === "number"
    && typeof value.passed === "number"
    && typeof value.failed === "number"
    && typeof value.skipped === "number"
    && (typeof value.exitCode === "number" || value.exitCode === null)
    && typeof value.summary === "string"
    && typeof value.output === "string"
    && Array.isArray(value.tests);
}

function isWorkflowState(value: unknown): value is WorkflowState {
  if (!isRecord(value) || !isRecord(value.repository) || !isRecord(value.safetyNet)
    || !isRecord(value.execution) || !isRecord(value.verification) || !isRecord(value.rollback)
    || !isRecord(value.report) || !isRecord(value.architecture)) return false;

  const repository = value.repository;
  const execution = value.execution;
  const verification = value.verification;
  const rollback = value.rollback;
  const report = value.report;
  const architecture = value.architecture;
  return typeof value.runId === "string"
    && typeof value.currentPhase === "string"
    && typeof value.overallStatus === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && isStringArray(value.errors)
    && typeof repository.name === "string"
    && typeof repository.url === "string"
    && typeof repository.owner === "string"
    && typeof repository.branch === "string"
    && typeof repository.currentCommit === "string"
    && typeof repository.commitMessage === "string"
    && typeof repository.runtime === "string"
    && typeof repository.framework === "string"
    && typeof repository.language === "string"
    && isStringArray(repository.detectedLanguages)
    && typeof repository.packageManager === "string"
    && typeof repository.projectType === "string"
    && typeof repository.lastCommit === "string"
    && typeof repository.linesOfCode === "number"
    && typeof repository.files === "number"
    && Array.isArray(repository.projectStructure)
    && typeof value.safetyNet.total === "number"
    && typeof value.safetyNet.passing === "number"
    && typeof value.safetyNet.failing === "number"
    && typeof value.safetyNet.generatedBy === "string"
    && typeof value.safetyNet.createdAt === "string"
    && typeof value.overallProgress === "number"
    && Array.isArray(value.risks)
    && Array.isArray(value.plan)
    && typeof architecture.available === "boolean"
    && typeof architecture.summary === "string"
    && (typeof architecture.diagram === "string" || architecture.diagram === null)
    && Array.isArray(architecture.components)
    && typeof value.operationStatus === "string"
    && typeof execution.currentStepId === "number"
    && typeof execution.status === "string"
    && Array.isArray(execution.log)
    && Array.isArray(execution.filesChanged)
    && (verification.baseline === null || isVerificationRun(verification.baseline))
    && (verification.recovery === null || isVerificationRun(verification.recovery))
    && (value.checkpointResult === undefined || isVerificationRun(value.checkpointResult))
    && typeof rollback.rollbackStatus === "string"
    && typeof rollback.recoveryValidation === "string"
    && Array.isArray(rollback.timeline)
    && Array.isArray(report.changesApplied)
    && Array.isArray(report.rollbacks)
    && Array.isArray(report.auditTrail);
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!isRecord(value) || value.success !== false || !isRecord(value.error)) return false;
  return typeof value.error.code === "string"
    && typeof value.error.message === "string"
    && typeof value.error.phase === "string";
}

function isSuccessResponse(value: unknown): value is AnalyzeResponse | GetRunResponse {
  return isRecord(value)
    && value.success === true
    && typeof value.runId === "string"
    && isWorkflowState(value.workflow);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function parseOrThrow(res: Response): Promise<AnalyzeResponse | GetRunResponse> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new WorkflowApiError(
      "PARSE_ERROR",
      `Server returned non-JSON response (HTTP ${res.status})`,
      "UNDERSTAND",
      res.status,
    );
  }

  if (isErrorResponse(body)) {
    const err = body.error;
    throw new WorkflowApiError(err.code, err.message, err.phase, res.status);
  }

  if (!isSuccessResponse(body)) {
    throw new WorkflowApiError("INVALID_RESPONSE", "Server returned an invalid workflow response.", "UNDERSTAND", res.status);
  }

  return body;
}

async function requestWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<AnalyzeResponse | GetRunResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return await parseOrThrow(res);
  } catch (error: unknown) {
    if (timedOut) {
      throw new WorkflowApiError("REQUEST_TIMEOUT", "Repository analysis timed out. Please try again.", "UNDERSTAND", 0);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Submit a GitHub repository URL for analysis.
 * Resolves with the full WorkflowState on success.
 * Rejects with a WorkflowApiError on any failure.
 */
export async function analyzeRepository(
  repoUrl: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<{ runId: string; workflow: WorkflowState }> {
  const data = await requestWithTimeout("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(branch ? { repoUrl, branch } : { repoUrl }),
  }, signal);
  return { runId: data.runId, workflow: data.workflow };
}

export async function startExecution(runId: string, signal?: AbortSignal): Promise<WorkflowState> {
  const data = await requestWithTimeout(`/api/runs/${encodeURIComponent(runId)}/execute`, { method: "POST" }, signal);
  return data.workflow;
}

export async function startVerification(runId: string, signal?: AbortSignal): Promise<WorkflowState> {
  const data = await requestWithTimeout(`/api/runs/${encodeURIComponent(runId)}/verify`, { method: "POST" }, signal);
  return data.workflow;
}

/**
 * Fetch the workflow state for a previously-started run by its runId.
 */
export async function getRun(
  runId: string,
  signal?: AbortSignal,
): Promise<{ runId: string; workflow: WorkflowState }> {
  const data = await requestWithTimeout(`/api/runs/${encodeURIComponent(runId)}`, {}, signal);
  return { runId: data.runId, workflow: data.workflow };
}
