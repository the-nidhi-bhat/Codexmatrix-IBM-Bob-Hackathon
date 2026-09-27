// ─────────────────────────────────────────────────────────────────────────────
//  Legacy Code Whisperer — Workflow domain types
//
//  This file defines the shared typed model for the entire workflow:
//  Understand → Protect → Assess → Plan → Execute → Verify → Rollback → Recover → Report
//
//  Screens must read data from WorkflowContext (which conforms to these types).
//  Workflow state comes from the backend (POST /api/analyze) via
//  src/api/workflowApi.ts; it mirrors backend/src/types.ts, so swapping the
//  backend provider does not change the screens or this type file.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared primitives ────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export type StepStatus = "pending" | "running" | "passed" | "failed" | "rolled_back" | "recovered" | (string & {});

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

// ── Repository ───────────────────────────────────────────────────────────────

export interface Repository {
  /** Short name, e.g. "legacy-ecommerce-api" */
  name: string;
  /** URL as entered by the user */
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

// ── Safety net (Protect phase) ───────────────────────────────────────────────

export interface SafetyNet {
  total: number;
  passing: number;
  failing: number;
  generatedBy: string;
  createdAt: string;
}

// ── Assessment / Risk (Assess phase) ────────────────────────────────────────

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

// ── Plan (Plan phase) ────────────────────────────────────────────────────────

export interface PlanStep {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  filesAffected: string[];
  /** Human-readable verification result, e.g. "18/18 ✓" */
  testsDelta?: string;
  risk: RiskLevel;
  expectedImpact: string;
}

// ── Execution (Execute phase) ────────────────────────────────────────────────

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
  /** "not_available" = nothing has been executed for this run (analysis only). */
  status: "not_available" | "running" | "complete" | "failed" | (string & {});
  log: ActivityLogEntry[];
  filesChanged: FileChange[];
  startingCommit?: string;
  modernizationCommit?: string;
  /** The server-owned run branch holding modernizationCommit. Never client-set. */
  runRef?: string;
  /** The allowlisted catalogue operation that was executed. */
  operationId?: string;
}

// ── Checkpoint run (the engine's real, verbatim result) ───────────────────────
//
// These mirror the JSON that tools/checkpoint.js and tools/validate.js actually
// write. The engine reports COUNTS, not a per-test list, and it never measures
// code coverage — so nothing here invents either. Every field the engine does not
// emit is optional and shown as "not reported", never as a zero or a blank.

/** One legacy-suite validation, as tools/validate.js writes it. */
export interface CheckpointValidation {
  status: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  exitCode?: number | null;
  /** The exact command that ran, verbatim from the engine. */
  command?: string;
  timestamp?: string;
  /** Raw harness stdout. Real evidence, not a summary. */
  output?: string;
  error?: string | null;
}

/** One rollback, as tools/rollback.js writes it. */
export interface CheckpointRollback {
  status: string;
  targetCommit?: string;
  revertCommit?: string | null;
  branch?: string;
  reason?: string;
  filesChanged?: string[];
  validationRequired?: boolean;
  runtimeNote?: string;
}

/** The engine's result file, passed through verbatim by the backend. */
export interface CheckpointRun {
  /** VERIFIED | RECOVERY_VERIFIED | RECOVERY_FAILED | VALIDATION_FAILED | REFUSED */
  status: string;
  finalStatus?: string;
  modernizationStep?: string;
  startingCommit?: string;
  modernizationCommit?: string;
  branch?: string;
  validationResult?: CheckpointValidation | null;
  rollbackResult?: CheckpointRollback | null;
  recoveryValidation?: CheckpointValidation | null;
  timestamp?: string;
  runtimeNote?: string;
}

export interface CheckpointRefusal {
  code: string;
  message: string;
}

export type CheckpointRunStatus = "created" | "running" | "complete" | "refused" | "failed";

/** The backend's view of a checkpoint run: the lifecycle plus the engine's result. */
export interface CheckpointRunView {
  id: string;
  analysisRunId: string;
  status: CheckpointRunStatus;
  /** Short form of the subject commit, for display. */
  subjectCommit: string | null;
  /** The engine's own state, verbatim. Never a restatement. */
  checkpointStatus: string | null;
  checkpoint: CheckpointRun | null;
  refusal: CheckpointRefusal | null;
  cleanupWarning: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// ── Verification (Verify phase) ──────────────────────────────────────────────

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
  /** All test results for this run */
  tests: TestResult[];
  exitCode?: number;
  summary?: string;
}

// Derived counts — computed, not stored
export interface VerificationCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  overallPassed: boolean;
}

// ── Rollback (Rollback + Recover phases) ─────────────────────────────────────

export type RollbackTimelineStatus = "regression" | "rollback" | "restored" | (string & {});

export interface RollbackTimelineEntry {
  status: RollbackTimelineStatus;
  label: string;
  time: string;
}

export interface RollbackEvent {
  /** ID of the step that triggered the rollback */
  stepId: number;
  /** Short description of the failing test */
  failedTestName: string;
  failedTestFile: string;
  failedTestLine: number;
  expectedValue: string;
  receivedValue: string;
  errorMessage: string;
  /** Commit hash before the failing change was applied */
  previousCommit: string;
  /** Commit hash of the failing change (to be reverted) */
  failedCommit: string;
  /** Status of the rollback itself */
  rollbackStatus: "pending" | "running" | "complete" | "failed" | "not_triggered" | (string & {});
  /** Status of the verification run that confirmed recovery */
  recoveryValidation: "pending" | "running" | "passed" | "failed" | "not_run" | (string & {});
  /** Bob's root-cause explanation */
  bobExplanation: string;
  /** Safer alternative suggested by Bob */
  saferAlternative: string;
  /** Timeline for demo step-through */
  timeline: RollbackTimelineEntry[];
}

// ── Report (Report phase) ────────────────────────────────────────────────────

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
  /** Snapshot of before/after key metrics */
  before: Record<string, string>;
  after: Record<string, string>;
  changesApplied: ChangeRecord[];
  rollbacks: RollbackRecord[];
  auditTrail: AuditEntry[];
}

// ── Overall workflow state ────────────────────────────────────────────────────

/**
 * The full runtime state of one modernization session.
 * This is what WorkflowContext exposes to every screen.
 */
export interface WorkflowState {
  runId: string;
  currentPhase: WorkflowPhase;
  overallStatus: "running" | "complete" | "failed" | "rolled_back";
  createdAt: string;
  updatedAt: string;
  errors: string[];
  /** Derived from the URL the user entered on the Start screen */
  repository: Repository;
  safetyNet: SafetyNet;
  /** 0–100 */
  overallProgress: number;
  risks: RiskFinding[];
  plan: PlanStep[];
  execution: ExecutionState;
  /** Backend verification payloads; these can contain analysis checks before checkpoint execution. */
  verification: {
    pass: VerificationRun;
    fail: VerificationRun;
  };
  /** Present only after a real checkpoint test result has been received. */
  checkpointResult?: VerificationRun;
  rollback: RollbackEvent;
  report: SessionReport;
}

// ── Context value exposed to screens ─────────────────────────────────────────

export interface WorkflowContextValue {
  state: WorkflowState;
  /**
   * Replace the workflow state with a newer server-authoritative copy.
   *
   * Needed because Execute and Verify are state-changing requests: the server
   * rewrites the run record's `execution` block and returns the whole updated
   * workflow. Adopting that response is the honest update — it is the server's
   * record of what it actually committed, not a local guess. The setter exists
   * in the context so no screen keeps a second copy of the workflow and the two
   * cannot drift.
   */
  updateWorkflow: (next: WorkflowState) => void;
}
