// ─────────────────────────────────────────────────────────────────────────────
//  Legacy Code Whisperer — Mock workflow data
//
//  This file provides the mock WorkflowState used during demo mode.
//  It is the ONLY place that constructs WorkflowState from raw values.
//  Screens must NOT import from this file directly — they read from
//  WorkflowContext instead.
//
//  To replace with a real backend:
//    1. Implement a function that fetches/streams WorkflowState from the API.
//    2. Pass the result to WorkflowContext.Provider instead of this mock.
//    3. Delete this file.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  WorkflowState,
  Repository,
  PlanStep,
  TestResult,
  VerificationRun,
} from "./types";

// ── Repository ────────────────────────────────────────────────────────────────
// The `url` field is overwritten at runtime by the value the user entered.
// The rest of the fields represent the mock legacy repository.

export const MOCK_REPOSITORY: Repository = {
  name: "legacy-ecommerce-api",
  url: "https://github.com/codexmatrix/legacy-ecommerce-api",
  runtime: "Node.js 12.x (LTS expired)",
  framework: "Express 4.17",
  language: "JavaScript (CommonJS)",
  lastCommit: "2021-03-14",
  linesOfCode: 4821,
  files: 63,
};

// ── Plan steps ────────────────────────────────────────────────────────────────

const MOCK_PLAN: PlanStep[] = [
  {
    id: 1,
    title: "Upgrade Node.js target to 18 LTS",
    description: "Update .nvmrc, engines field in package.json, CI matrix.",
    status: "passed",
    filesAffected: ["package.json", ".nvmrc", ".github/workflows/ci.yml"],
    testsDelta: "18/18 ✓",
    risk: "low",
    expectedImpact: "Enables modern Node.js APIs; removes security vulnerabilities in Node.js 12.",
  },
  {
    id: 2,
    title: "Replace deprecated Buffer() constructor",
    description: "Swap Buffer() calls to Buffer.from() / Buffer.alloc().",
    status: "passed",
    filesAffected: ["src/utils/hashHelper.js"],
    testsDelta: "18/18 ✓",
    risk: "medium",
    expectedImpact: "Prevents TypeError crash on Node.js 18+. No behavior change.",
  },
  {
    id: 3,
    title: "Migrate var → const/let",
    description: "Replace all var declarations with block-scoped const or let.",
    status: "running",
    filesAffected: ["src/routes/orders.js", "src/routes/products.js"],
    testsDelta: "running…",
    risk: "medium",
    expectedImpact: "Eliminates hoisting-related scoping bugs. Safer accumulator patterns.",
  },
  {
    id: 4,
    title: "Refactor auth middleware to async/await",
    description: "Convert callback pyramid to async/await + try/catch.",
    status: "pending",
    filesAffected: ["src/middleware/auth.js"],
    risk: "high",
    expectedImpact: "Makes error paths explicit. Prevents silent request drops on auth failure.",
  },
  {
    id: 5,
    title: "Add input validation on POST /checkout",
    description: "Integrate Zod schema before handler.",
    status: "pending",
    filesAffected: ["src/routes/checkout.js"],
    risk: "medium",
    expectedImpact: "Blocks malformed payloads before DB layer. Prevents type coercion attacks.",
  },
  {
    id: 6,
    title: "Replace dynamic require() with import()",
    description: "Convert pluginLoader to ESM dynamic imports.",
    status: "pending",
    filesAffected: ["src/loaders/pluginLoader.js"],
    risk: "high",
    expectedImpact: "ESM compatibility. Enables tree-shaking and modern bundler support.",
  },
  {
    id: 7,
    title: "Swap console.log for structured logger",
    description: "Install pino, replace all console.log calls.",
    status: "pending",
    filesAffected: ["src/services/emailService.js", "src/routes/orders.js"],
    risk: "low",
    expectedImpact: "Structured JSON logs. Prevents PII leakage. Production-safe.",
  },
];

// ── Verification base tests (shared between PASS and FAIL scenarios) ──────────

const BASE_TESTS: TestResult[] = [
  { name: "GET /products — returns 200 with product list",          file: "test/routes/products.test.js",      line: 12, status: "passed",  duration: "48ms" },
  { name: "GET /products/:id — returns single product",             file: "test/routes/products.test.js",      line: 28, status: "passed",  duration: "32ms" },
  { name: "POST /orders — creates order with correct total",        file: "test/routes/orders.test.js",        line: 44, status: "passed",  duration: "61ms" },
  { name: "DELETE /orders/:id — removes order",                     file: "test/routes/orders.test.js",        line: 102, status: "passed", duration: "29ms" },
  { name: "POST /auth/login — returns JWT on valid credentials",    file: "test/auth/login.test.js",           line: 15, status: "passed",  duration: "88ms" },
  { name: "POST /auth/login — rejects invalid password",            file: "test/auth/login.test.js",           line: 33, status: "passed",  duration: "72ms" },
  { name: "GET /checkout — returns cart summary",                   file: "test/routes/checkout.test.js",      line: 9,  status: "passed",  duration: "41ms" },
  { name: "POST /checkout — processes payment (mock)",              file: "test/routes/checkout.test.js",      line: 24, status: "passed",  duration: "95ms" },
  { name: "GET /users/profile — returns user data",                 file: "test/routes/users.test.js",         line: 7,  status: "passed",  duration: "36ms" },
  { name: "hashHelper.hash() — produces consistent output",         file: "test/utils/hashHelper.test.js",     line: 5,  status: "passed",  duration: "12ms" },
  { name: "hashHelper.compare() — validates correct hash",          file: "test/utils/hashHelper.test.js",     line: 18, status: "passed",  duration: "11ms" },
  { name: "emailService.sendWelcome() — formats subject correctly", file: "test/services/emailService.test.js", line: 8,  status: "passed", duration: "22ms" },
  { name: "GET /health — returns 200",                              file: "test/health.test.js",                line: 3,  status: "passed", duration: "8ms"  },
  { name: "pluginLoader — loads all 8 plugins on startup",          file: "test/loaders/pluginLoader.test.js", line: 14, status: "skipped", duration: "0ms" },
  { name: "POST /orders — order total preserves float precision",   file: "test/routes/orders.test.js",        line: 88, status: "passed",  duration: "55ms" },
  { name: "GET /products — pagination returns correct page size",   file: "test/routes/products.test.js",      line: 45, status: "passed",  duration: "38ms" },
  { name: "POST /auth/register — rejects duplicate email",          file: "test/auth/register.test.js",        line: 12, status: "passed",  duration: "66ms" },
  { name: "DELETE /users/:id — requires admin role",                file: "test/routes/users.test.js",         line: 31, status: "passed",  duration: "43ms" },
];

const COVERAGE_NOTE =
  "91% behavioral coverage of public API endpoints. Generated by IBM Bob before any changes were " +
  "applied. These tests verify that existing behavior is preserved, not that new behavior is correct.";

/** PASS scenario — 18 passed / 0 failed / 0 skipped */
const VERIFICATION_PASS: VerificationRun = {
  stepId: 3,
  suite: "Safety Net v1 — behavioral tests",
  duration: "1.62s",
  coverage: 91,
  coverageNote: COVERAGE_NOTE,
  tests: BASE_TESTS,
};

/** FAIL scenario — 16 passed / 2 failed / 0 skipped */
const VERIFICATION_FAIL: VerificationRun = {
  stepId: 3,
  suite: "Safety Net v1 — behavioral tests",
  duration: "1.84s",
  coverage: 91,
  coverageNote: COVERAGE_NOTE,
  tests: BASE_TESTS.map((t) => {
    // Inject 2 failures into specific tests
    if (t.name === "POST /orders — order total preserves float precision") {
      return {
        ...t,
        status: "failed" as const,
        error:
          "AssertionError: expected 199.99 to equal 200 — var-to-const shadowed accumulator in for-loop.",
      };
    }
    if (t.name === "POST /orders — creates order with correct total") {
      return {
        ...t,
        status: "failed" as const,
        error:
          "TypeError: Cannot assign to constant 'subtotal' — const binding prevents loop accumulator update.",
      };
    }
    return t;
  }),
};

// ── Full mock WorkflowState ───────────────────────────────────────────────────

/**
 * Build a complete WorkflowState for the given repository URL.
 * The URL comes from the user's input on the Start screen.
 * All other fields are mock/demo data.
 */
export function buildMockWorkflowState(repoUrl: string): WorkflowState {
  return {
    repository: {
      ...MOCK_REPOSITORY,
      url: repoUrl,
    },

    safetyNet: {
      total: 18,
      passing: 18,
      failing: 0,
      generatedBy: "IBM Bob — Behavioral Test Generation",
      createdAt: "2025-09-26T08:12:00Z",
    },

    overallProgress: 28, // 2 of 7 steps complete ≈ 28%

    risks: [
      {
        id: "r1",
        level: "high",
        title: "callback-based async in auth middleware",
        file: "src/middleware/auth.js",
        line: 34,
        reason:
          "Nested callbacks make error paths invisible. An unhandled rejection here would silently drop the request.",
        opportunity: "Refactor to async/await with explicit error boundaries.",
        blastRadius: "All authenticated routes (11 endpoints) depend on this middleware.",
        evidence: "6 nested callback levels detected; 0 explicit error handlers.",
      },
      {
        id: "r2",
        level: "high",
        title: "require() used for dynamic module loading",
        file: "src/loaders/pluginLoader.js",
        line: 12,
        reason:
          "Dynamic require() prevents tree-shaking and is incompatible with ESM.",
        opportunity: "Replace with import() dynamic expressions (ESM-compatible).",
        blastRadius: "8 plugins loaded via this path; affects startup time and bundle size.",
        evidence: "Node.js --experimental-vm-modules required; breaks on ESM-only packages.",
      },
      {
        id: "r3",
        level: "medium",
        title: "deprecated Buffer() constructor",
        file: "src/utils/hashHelper.js",
        line: 8,
        reason:
          "Buffer() without `new` is deprecated since Node.js 6 and removed in Node.js 18+.",
        opportunity: "Replace with Buffer.from() / Buffer.alloc().",
        blastRadius: "3 callers in password hashing and token generation paths.",
        evidence: "Will throw TypeError on Node.js 18+: use Buffer.from() instead.",
      },
      {
        id: "r4",
        level: "medium",
        title: "var declarations with hoisting side-effects",
        file: "src/routes/orders.js",
        line: 22,
        reason: "var hoisting creates subtle scoping bugs inside loops.",
        opportunity: "Replace var with const/let throughout.",
        blastRadius: "23 var declarations across 5 route files; 1 confirmed loop scoping bug.",
        evidence: "Order total accumulator shadowed in for-loop — causes float precision loss.",
      },
      {
        id: "r5",
        level: "medium",
        title: "no input validation on POST /checkout",
        file: "src/routes/checkout.js",
        line: 5,
        reason: "Raw req.body is passed to the DB layer without sanitization.",
        opportunity: "Add Zod or Joi schema validation before handler logic.",
        blastRadius: "Checkout and payment routes; potential SQL injection / type coercion.",
        evidence: "req.body.amount passed directly to parseFloat() without type check.",
      },
      {
        id: "r6",
        level: "low",
        title: "console.log left in production paths",
        file: "src/services/emailService.js",
        line: 41,
        reason: "Logs may leak PII in production.",
        opportunity: "Replace with structured logger (e.g. pino).",
        blastRadius: "14 console.log calls in 6 files; 3 log user email addresses.",
        evidence: "console.log('Sending to:', user.email) in emailService.js:41.",
      },
      {
        id: "r7",
        level: "low",
        title: "hardcoded localhost in config fallback",
        file: "src/config/db.js",
        line: 3,
        reason: "Fallback localhost is misleading when running in containers.",
        opportunity: "Remove fallback; require env var explicitly.",
        blastRadius: "DB config only; fails silently in Docker/Kubernetes deployments.",
        evidence: "const host = process.env.DB_HOST || 'localhost' — silently breaks in containers.",
      },
    ],

    plan: MOCK_PLAN,

    execution: {
      currentStepId: 3,
      log: [
        { time: "10:42:01", text: "IBM Bob: Analyzing src/routes/orders.js…" },
        { time: "10:42:03", text: "IBM Bob: Found 14 var declarations in 63 lines." },
        { time: "10:42:04", text: "IBM Bob: Replacing var → const/let (conservative pass)…" },
        { time: "10:42:06", text: "Changed: src/routes/orders.js (14 replacements)" },
        { time: "10:42:07", text: "IBM Bob: Analyzing src/routes/products.js…" },
        { time: "10:42:09", text: "IBM Bob: Found 9 var declarations in 48 lines." },
        { time: "10:42:10", text: "Changed: src/routes/products.js (9 replacements)" },
        { time: "10:42:11", text: "Running safety-net tests…" },
      ],
      filesChanged: [
        { file: "src/routes/orders.js",   additions: 14, deletions: 14 },
        { file: "src/routes/products.js", additions: 9,  deletions: 9 },
      ],
    },

    verification: {
      pass: VERIFICATION_PASS,
      fail: VERIFICATION_FAIL,
    },

    rollback: {
      stepId: 3,
      failedTestName: "POST /orders — order total preserves float precision",
      failedTestFile: "test/routes/orders.test.js",
      failedTestLine: 88,
      expectedValue: "199.99",
      receivedValue: "200",
      errorMessage:
        "AssertionError: expected 199.99 to equal 200 — var-to-const change introduced a premature const binding that shadowed the accumulator variable.",
      previousCommit: "a3f9c12",
      failedCommit:   "b7d4e88",
      rollbackStatus: "complete",
      recoveryValidation: "passed",
      bobExplanation:
        "The `var total` inside the for-loop was replaced with `const total`, which prevented re-assignment in the accumulator pattern. The safe fix is to use `let total` instead of `const total` for mutable accumulators, while still using `const` for all other bindings. IBM Bob will apply a targeted `let`-only fix for accumulators and re-run verification.",
      saferAlternative:
        "Use `const` for all bindings except loop accumulators and iterators, which should use `let`. Re-run behavioral tests after each batch to catch scoping regressions early.",
      timeline: [
        { status: "regression", label: "Regression detected",  time: "10:42:14" },
        { status: "rollback",   label: "Rollback initiated",   time: "10:42:15" },
        { status: "restored",   label: "Previous state restored", time: "10:42:16" },
      ],
    },

    report: {
      startedAt: "2025-09-26 10:40:00",
      endedAt:   "2025-09-26 10:52:44",
      duration:  "12m 44s",
      stepsCompleted:  2,
      stepsRolledBack: 1,
      before: {
        "Node.js":            "12.x (LTS expired)",
        "Express":            "4.17",
        "var declarations":   "23",
        "deprecated APIs":    "4",
        "console.log (prod)": "14",
        "Safety tests":       "0",
      },
      after: {
        "Node.js":            "18 LTS",
        "Express":            "4.17",
        "var declarations":   "23 (step 3 rolled back)",
        "deprecated APIs":    "1 (Buffer fixed)",
        "console.log (prod)": "14 (pending step 7)",
        "Safety tests":       "18/18 passing",
      },
      changesApplied: [
        {
          title: "Upgrade Node.js target to 18 LTS",
          files: ["package.json", ".nvmrc", ".github/workflows/ci.yml"],
          status: "applied",
          time: "10:41:20",
        },
        {
          title: "Replace deprecated Buffer() constructor",
          files: ["src/utils/hashHelper.js"],
          status: "applied",
          time: "10:43:05",
        },
        {
          title: "Migrate var → const/let",
          files: ["src/routes/orders.js", "src/routes/products.js"],
          status: "rolled-back",
          time: "10:45:16",
        },
      ],
      rollbacks: [
        {
          step: "Step 3 — Migrate var → const/let",
          time: "10:45:16",
          reason:
            "Test failure: POST /orders — order total preserves float precision. var-to-const replacement shadowed accumulator in for-loop, causing float precision loss.",
          recovery: "Repository restored to state after Step 2 (18/18 tests passing)",
        },
      ],
      auditTrail: [
        { time: "10:40:00", type: "info",    message: "Session started — repository: legacy-ecommerce-api" },
        { time: "10:40:12", type: "info",    message: "IBM Bob: Inspecting repository structure…" },
        { time: "10:40:58", type: "success", message: "IBM Bob: Safety-net generated — 18 behavioral tests" },
        { time: "10:41:05", type: "info",    message: "IBM Bob: Risk assessment complete — 7 findings (2 high, 3 medium, 2 low)" },
        { time: "10:41:15", type: "info",    message: "Executing Step 1 — Upgrade Node.js target to 18 LTS" },
        { time: "10:41:20", type: "info",    message: "Changed: package.json, .nvmrc, .github/workflows/ci.yml" },
        { time: "10:41:28", type: "success", message: "Verification: 18/18 passed — Step 1 committed" },
        { time: "10:43:00", type: "info",    message: "Executing Step 2 — Replace deprecated Buffer() constructor" },
        { time: "10:43:05", type: "info",    message: "Changed: src/utils/hashHelper.js (3 replacements)" },
        { time: "10:43:14", type: "success", message: "Verification: 18/18 passed — Step 2 committed" },
        { time: "10:44:50", type: "info",    message: "Executing Step 3 — Migrate var → const/let" },
        { time: "10:45:00", type: "info",    message: "Changed: src/routes/orders.js (14 replacements), src/routes/products.js (9 replacements)" },
        { time: "10:45:10", type: "warn",    message: "Verification: 2 tests failed — POST /orders float precision" },
        { time: "10:45:14", type: "error",   message: "Regression detected — initiating rollback" },
        { time: "10:45:15", type: "warn",    message: "Rolling back Step 3 changes… (commit b7d4e88 → a3f9c12)" },
        { time: "10:45:16", type: "success", message: "Rollback complete — repository restored to commit a3f9c12" },
        { time: "10:45:16", type: "success", message: "Recovery validation: 18/18 passed after rollback" },
        { time: "10:45:20", type: "info",    message: "IBM Bob: Root cause — const used for mutable accumulator. Safer fix: use let for accumulators only." },
        { time: "10:52:44", type: "info",    message: "Session ended — 2 steps applied, 1 rolled back, safety net intact" },
      ],
    },
  };
}
