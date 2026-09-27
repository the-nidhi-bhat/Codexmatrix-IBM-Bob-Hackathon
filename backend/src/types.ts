// ─────────────────────────────────────────────────────────────────────────────
//  Backend workflow types — mirrors frontend/src/workflow/types.ts
//  These are the shapes returned by POST /api/analyze and GET /api/runs/:runId
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "rolled_back" | "recovered";
export type TestOutcome = "passed" | "failed" | "skipped";
export type ChangeStatus = "applied" | "rolled-back" | "failed";
export type AuditEntryType = "info" | "success" | "warn" | "error";

export type WorkflowPhase =
  | "UNDERSTAND"
  | "PROTECT"
  | "ASSESS"
  | "PLAN"
  | "EXECUTE"
  | "VERIFY"
  | "ROLLBACK"
  | "RECOVER"
  | "REPORT";

export interface Repository {
  name: string;
  url: string;
  owner: string;
  branch: string;
  currentCommit: string;
  commitMessage: string;
  runtime: string;
  framework: string;
  language: string;
  detectedLanguages: string[];
  packageManager: string;
  projectType: string;
  lastCommit: string;
  linesOfCode: number;
  files: number;
}

export interface SafetyNet {
  total: number;
  passing: number;
  failing: number;
  generatedBy: string;
  createdAt: string;
}

export interface RiskFinding {
  id: string;
  level: RiskLevel;
  title: string;
  file: string;
  line?: number;
  reason: string;
  opportunity: string;
  blastRadius: string;
  evidence: string;
}

export interface PlanStep {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  filesAffected: string[];
  testsDelta?: string;
  risk: RiskLevel;
  expectedImpact: string;
}

export interface ActivityLogEntry {
  time: string;
  text: string;
}

export interface FileChange {
  file: string;
  additions: number;
  deletions: number;
}

export interface ExecutionState {
  currentStepId: number;
  status: "not_available" | "running" | "complete" | "failed";
  log: ActivityLogEntry[];
  filesChanged: FileChange[];
  /** HEAD of the execute worktree before the operation was applied. Written by
   *  the execute stage only. Not the commit under test. */
  startingCommit?: string;
  /** The commit the execute stage created. THIS is the checkpoint subject. */
  modernizationCommit?: string;
  /** The server-owned run branch that holds modernizationCommit:
   *  lcw/modernization/<runId>. It is the anchor the checkpoint stage attaches
   *  its worktree to, so a revert lands on a named branch. Never client-set. */
  runRef?: string;
  /** The catalogue id that was executed. */
  operationId?: string;
}

export interface TestResult {
  name: string;
  file: string;
  line?: number;
  status: TestOutcome;
  duration: string;
  error?: string;
}

export interface VerificationRun {
  stepId: number;
  suite: string;
  duration: string;
  coverage: number;
  coverageNote: string;
  tests: TestResult[];
  exitCode?: number;
  summary?: string;
}

export interface RollbackTimelineEntry {
  status: "regression" | "rollback" | "restored";
  label: string;
  time: string;
}

export interface RollbackEvent {
  stepId: number;
  failedTestName: string;
  failedTestFile: string;
  failedTestLine: number;
  expectedValue: string;
  receivedValue: string;
  errorMessage: string;
  previousCommit: string;
  failedCommit: string;
  rollbackStatus: "pending" | "running" | "complete" | "failed" | "not_triggered";
  recoveryValidation: "pending" | "running" | "passed" | "failed" | "not_run";
  bobExplanation: string;
  saferAlternative: string;
  timeline: RollbackTimelineEntry[];
}

export interface ChangeRecord {
  title: string;
  files: string[];
  status: ChangeStatus;
  time: string;
}

export interface RollbackRecord {
  step: string;
  time: string;
  reason: string;
  recovery: string;
}

export interface AuditEntry {
  time: string;
  type: AuditEntryType;
  message: string;
}

export interface SessionReport {
  startedAt: string;
  endedAt: string;
  duration: string;
  stepsCompleted: number;
  stepsRolledBack: number;
  before: Record<string, string>;
  after: Record<string, string>;
  changesApplied: ChangeRecord[];
  rollbacks: RollbackRecord[];
  auditTrail: AuditEntry[];
}

// ── Top-level workflow state ──────────────────────────────────────────────────

export interface WorkflowState {
  runId: string;
  currentPhase: WorkflowPhase;
  overallStatus: "running" | "complete" | "failed" | "rolled_back";
  createdAt: string;
  updatedAt: string;
  errors: string[];
  repository: Repository;
  safetyNet: SafetyNet;
  overallProgress: number;
  risks: RiskFinding[];
  plan: PlanStep[];
  execution: ExecutionState;
  verification: {
    pass: VerificationRun;
    fail: VerificationRun;
  };
  rollback: RollbackEvent;
  report: SessionReport;
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  repoUrl: string;
  branch?: string;
}

export interface AnalyzeResponse {
  success: true;
  runId: string;
  workflow: WorkflowState;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    phase: WorkflowPhase;
  };
}

// ── Checkpoint run API ────────────────────────────────────────────────────────
// Server-owned lifecycle around one real tools/checkpoint.js run. The client may
// only name an analysis run that already exists on this server; every value in
// the view below comes from the server or from the engine's own result file.

/** Lifecycle of the SERVER's run record. "complete" means the engine produced a
 *  result — the checkpoint's own meaning is checkpointStatus, not this. */
export type CheckpointRunStatus = "created" | "running" | "complete" | "refused" | "failed";

export interface CheckpointRefusal {
  code: string;
  message: string;
}

export interface CheckpointRunView {
  id: string;
  analysisRunId: string;
  status: CheckpointRunStatus;
  /** Server-resolved subject commit (short form). Null until the server can
   *  resolve it — the client can never supply this. */
  subjectCommit: string | null;
  /** The engine's canonical status, verbatim: VERIFIED | RECOVERY_VERIFIED |
   *  RECOVERY_FAILED | VALIDATION_FAILED | REFUSED.
   *  Null means the engine has NOT run; nothing here is ever inferred. */
  checkpointStatus: string | null;
  /** tools/checkpoint.js's own result file, passed through verbatim. Counts in
   *  it (validationResult.passed / .failed / .total / .skipped) are the only
   *  counts that exist — they are never recomputed or restated here. */
  checkpoint: Record<string, unknown> | null;
  refusal: CheckpointRefusal | null;
  /** True when the isolated worktree could not be removed. The path and the
   *  tool's own output stay in the server log, never in a client message. */
  cleanupWarning: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateCheckpointRunRequest {
  analysisRunId: string;
}

export interface CheckpointRunResponse {
  success: true;
  checkpointRun: CheckpointRunView;
}
