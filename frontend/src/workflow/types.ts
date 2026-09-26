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

export type StepStatus = "pending" | "running" | "passed" | "failed" | "rolled_back" | "recovered";

export type TestOutcome = "passed" | "failed" | "skipped";

export type ChangeStatus = "applied" | "rolled-back" | "failed";

export type AuditEntryType = "info" | "success" | "warn" | "error";

// ── Repository ───────────────────────────────────────────────────────────────

export interface Repository {
  /** Short name, e.g. "legacy-ecommerce-api" */
  name: string;
  /** URL as entered by the user */
  url: string;
  runtime: string;
  framework: string;
  language: string;
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
  status: "not_available" | "running" | "complete" | "failed";
  log: ActivityLogEntry[];
  filesChanged: FileChange[];
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

export type RollbackTimelineStatus = "regression" | "rollback" | "restored";

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
  rollbackStatus: "pending" | "running" | "complete" | "failed" | "not_triggered";
  /** Status of the verification run that confirmed recovery */
  recoveryValidation: "pending" | "running" | "passed" | "failed" | "not_run";
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
  /** Derived from the URL the user entered on the Start screen */
  repository: Repository;
  safetyNet: SafetyNet;
  /** 0–100 */
  overallProgress: number;
  risks: RiskFinding[];
  plan: PlanStep[];
  execution: ExecutionState;
  /**
   * Two pre-built verification scenarios so the demo can toggle between them.
   * `pass` — 18 passed / 0 failed / 0 skipped
   * `fail` — 16 passed / 2 failed / 0 skipped
   */
  verification: {
    pass: VerificationRun;
    fail: VerificationRun;
  };
  rollback: RollbackEvent;
  report: SessionReport;
}

// ── Context value exposed to screens ─────────────────────────────────────────

export interface WorkflowContextValue {
  state: WorkflowState;
  /**
   * Which verification scenario is currently active.
   * Screens toggle this; the context makes the active run available.
   */
  verificationMode: "pass" | "fail";
  setVerificationMode: (mode: "pass" | "fail") => void;
  /** Convenience: the currently active VerificationRun */
  activeVerification: VerificationRun;
}
