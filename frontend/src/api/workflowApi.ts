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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function parseOrThrow<T>(res: Response): Promise<T> {
  let body: AnalyzeResponse | GetRunResponse | ErrorResponse;
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

  if (!body.success) {
    const err = (body as ErrorResponse).error;
    throw new WorkflowApiError(err.code, err.message, err.phase, res.status);
  }

  return body as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Submit a GitHub repository URL for analysis.
 * Resolves with the full WorkflowState on success.
 * Rejects with a WorkflowApiError on any failure.
 */
export async function analyzeRepository(
  repoUrl: string,
  branch = "main",
): Promise<{ runId: string; workflow: WorkflowState }> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl, branch }),
  });
  const data = await parseOrThrow<AnalyzeResponse>(res);
  return { runId: data.runId, workflow: data.workflow };
}

/**
 * Fetch the workflow state for a previously-started run by its runId.
 */
export async function getRun(
  runId: string,
): Promise<{ runId: string; workflow: WorkflowState }> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  const data = await parseOrThrow<GetRunResponse>(res);
  return { runId: data.runId, workflow: data.workflow };
}
