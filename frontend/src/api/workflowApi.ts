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

function isWorkflowState(value: unknown): value is WorkflowState {
  if (!isRecord(value) || !isRecord(value.repository) || !isRecord(value.safetyNet)
    || !isRecord(value.execution) || !isRecord(value.verification) || !isRecord(value.rollback)
    || !isRecord(value.report)) return false;

  const repository = value.repository;
  const execution = value.execution;
  const verification = value.verification;
  const rollback = value.rollback;
  const report = value.report;
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
    && typeof value.safetyNet.total === "number"
    && typeof value.safetyNet.passing === "number"
    && typeof value.safetyNet.failing === "number"
    && typeof value.safetyNet.generatedBy === "string"
    && typeof value.safetyNet.createdAt === "string"
    && typeof value.overallProgress === "number"
    && Array.isArray(value.risks)
    && Array.isArray(value.plan)
    && typeof execution.currentStepId === "number"
    && typeof execution.status === "string"
    && Array.isArray(execution.log)
    && Array.isArray(execution.filesChanged)
    && isRecord(verification.pass)
    && Array.isArray(verification.pass.tests)
    && isRecord(verification.fail)
    && Array.isArray(verification.fail.tests)
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

  // A `success: false` body whose error object is unreadable is a protocol
  // failure, not a domain error: name it instead of dereferencing undefined.
  if (isRecord(body) && body.success === false) {
    throw new WorkflowApiError(
      "MALFORMED_ERROR",
      `Server returned an unreadable error response (HTTP ${res.status})`,
      "UNDERSTAND",
      res.status,
    );
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
 *
 * No branch is sent: the backend clones the remote's default branch and reports
 * the branch it actually analyzed, so we never claim to have used one we didn't.
 */
export async function analyzeRepository(
  repoUrl: string,
  signal?: AbortSignal,
): Promise<{ runId: string; workflow: WorkflowState }> {
  const data = await requestWithTimeout("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Only the URL: the backend clones the remote's default branch and reports
    // the branch it actually analyzed, so no branch field is sent.
    body: JSON.stringify({ repoUrl }),
  }, signal);
  return { runId: data.runId, workflow: data.workflow };
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
