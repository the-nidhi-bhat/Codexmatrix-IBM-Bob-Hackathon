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
  startingCommit?: string;
  modernizationCommit?: string;
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
