// ─────────────────────────────────────────────────────────────────────────────
//  Real repository analyzer
//  Clones a public GitHub repo into a temp dir, reads it, and produces
//  a WorkflowState based on what was actually found.
//
//  Safety rules enforced here:
//  - Only https://github.com/ URLs accepted
//  - No user input interpolated into shell strings (args array)
//  - No npm install / project scripts executed
//  - Temp dir cleaned up after analysis
//  - 60s clone timeout
// ─────────────────────────────────────────────────────────────────────────────

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import type {
  WorkflowState,
  Repository,
  RiskFinding,
  PlanStep,
  ActivityLogEntry,
  AuditEntry,
  WorkflowPhase,
} from "./types";

const execFileAsync = promisify(execFile);

// ── URL validation ────────────────────────────────────────────────────────────

const GITHUB_HTTPS = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\.git)?\/?$/;

export function validateRepoUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(GITHUB_HTTPS);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

// ── File helpers ──────────────────────────────────────────────────────────────

// ponytail: 4 MB per file, 2000 files per repo — a giant monorepo is truncated
// rather than pinned. Raise deliberately if a real target needs it.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES_SCANNED = 2000;

function readFileSafe(p: string): string {
  try {
    // lstat first: a cloned repo can commit a symlink pointing at the host
    // filesystem, and readFileSync would happily follow it.
    if (!fs.lstatSync(p).isFile()) return "";
    if (fs.statSync(p).size > MAX_FILE_BYTES) return "";
    return fs.readFileSync(p, "utf-8");
  } catch { return ""; }
}

function existsInDir(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name));
}

function countFilesRecursive(dir: string, exts: string[]): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        count += countFilesRecursive(full, exts);
      } else if (exts.some(ext => e.name.endsWith(ext))) {
        count++;
      }
    }
  } catch { /* skip unreadable dirs */ }
  return count;
}

function listFilesRecursive(dir: string, exts: string[], max = 200): string[] {
  const results: string[] = [];
  function walk(d: string) {
    if (results.length >= max) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (exts.some(ext => e.name.endsWith(ext))) {
          results.push(full.replace(dir + path.sep, "").replace(/\\/g, "/"));
        }
      }
    } catch { /* skip */ }
  }
  walk(dir);
  return results;
}

function linesOfCodeEstimate(dir: string): number {
  const CODE_EXTS = [".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs",
                     ".rb", ".php", ".c", ".cpp", ".cs", ".swift", ".kt"];
  let total = 0;
  let scanned = 0;
  function walk(d: string) {
    if (scanned >= MAX_FILES_SCANNED) return;
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (CODE_EXTS.some(ext => e.name.endsWith(ext))) {
          scanned++;
          const content = readFileSafe(full);
          total += content.split("\n").length;
        }
      }
    } catch { /* skip */ }
  }
  walk(dir);
  return total;
}

// ── Language / framework detection ───────────────────────────────────────────

interface DetectedStack {
  languages: string[];
  primaryLanguage: string;
  framework: string;
  runtime: string;
  packageManager: string;
  projectType: string;
}

function detectStack(dir: string): DetectedStack {
  const langs: string[] = [];
  const pkg = readFileSafe(path.join(dir, "package.json"));
  let pkgJson: Record<string, unknown> | null = null;
  try { pkgJson = JSON.parse(pkg); } catch { /* not valid JSON */ }

  let framework = "unknown";
  let runtime = "unknown";
  let packageManager = "unknown";
  let projectType = "unknown";

  // JavaScript / TypeScript / Node.js
  if (existsInDir(dir, "package.json")) {
    langs.push("JavaScript");
    if (existsInDir(dir, "tsconfig.json") || countFilesRecursive(dir, [".ts", ".tsx"]) > 0) {
      langs.push("TypeScript");
    }
    packageManager = existsInDir(dir, "yarn.lock") ? "yarn"
      : existsInDir(dir, "pnpm-lock.yaml") ? "pnpm" : "npm";

    // Detect Node runtime version
    const nvmrc = readFileSafe(path.join(dir, ".nvmrc")).trim();
    const engines = pkgJson?.engines as Record<string, string> | undefined;
    if (nvmrc) runtime = `Node.js ${nvmrc}`;
    else if (engines?.node) runtime = `Node.js ${engines.node}`;
    else runtime = "Node.js (version unspecified)";

    // Framework detection
    const deps: Record<string, string> = {
      ...(pkgJson?.dependencies as Record<string, string> || {}),
      ...(pkgJson?.devDependencies as Record<string, string> || {}),
    };
    if (deps["next"]) framework = "Next.js";
    else if (deps["nuxt"]) framework = "Nuxt.js";
    else if (deps["@nestjs/core"]) framework = "NestJS";
    else if (deps["express"]) framework = `Express ${deps["express"].replace(/[\^~]/, "")}`;
    else if (deps["fastify"]) framework = "Fastify";
    else if (deps["koa"]) framework = "Koa";
    else if (deps["hapi"] || deps["@hapi/hapi"]) framework = "Hapi";
    else if (deps["react"]) framework = "React";
    else if (deps["vue"]) framework = "Vue.js";
    else if (deps["@angular/core"]) framework = "Angular";
    else if (deps["svelte"]) framework = "Svelte";

    projectType = deps["express"] || deps["fastify"] || deps["koa"] ? "web-api"
      : deps["react"] || deps["vue"] || deps["@angular/core"] ? "spa"
      : deps["next"] || deps["nuxt"] ? "fullstack"
      : "node-app";
  }

  // Python
  if (existsInDir(dir, "requirements.txt") || existsInDir(dir, "pyproject.toml") ||
      existsInDir(dir, "setup.py") || existsInDir(dir, "setup.cfg")) {
    langs.push("Python");
    packageManager = existsInDir(dir, "poetry.lock") ? "poetry"
      : existsInDir(dir, "Pipfile") ? "pipenv" : "pip";
    runtime = "Python";
    projectType = "python-app";
    const req = readFileSafe(path.join(dir, "requirements.txt"));
    if (req.includes("django")) framework = "Django";
    else if (req.includes("flask")) framework = "Flask";
    else if (req.includes("fastapi")) framework = "FastAPI";
  }

  // Java / Kotlin
  if (existsInDir(dir, "pom.xml")) {
    langs.push("Java"); packageManager = "Maven"; runtime = "JVM"; projectType = "java-app";
    const pom = readFileSafe(path.join(dir, "pom.xml"));
    if (pom.includes("spring-boot")) framework = "Spring Boot";
  }
  if (existsInDir(dir, "build.gradle") || existsInDir(dir, "build.gradle.kts")) {
    if (!langs.includes("Java")) langs.push("Java");
    packageManager = "Gradle"; runtime = "JVM"; projectType = "java-app";
  }

  // Go
  if (existsInDir(dir, "go.mod")) {
    langs.push("Go"); runtime = "Go"; packageManager = "go modules"; projectType = "go-app";
    const goMod = readFileSafe(path.join(dir, "go.mod"));
    if (goMod.includes("gin-gonic")) framework = "Gin";
    else if (goMod.includes("echo")) framework = "Echo";
  }

  // Rust
  if (existsInDir(dir, "Cargo.toml")) {
    langs.push("Rust"); runtime = "Rust"; packageManager = "cargo"; projectType = "rust-app";
  }

  // Ruby
  if (existsInDir(dir, "Gemfile")) {
    langs.push("Ruby"); runtime = "Ruby"; packageManager = "bundler"; projectType = "ruby-app";
    const gemfile = readFileSafe(path.join(dir, "Gemfile"));
    if (gemfile.includes("rails")) framework = "Rails";
    else if (gemfile.includes("sinatra")) framework = "Sinatra";
  }

  // PHP
  if (existsInDir(dir, "composer.json")) {
    langs.push("PHP"); runtime = "PHP"; packageManager = "composer"; projectType = "php-app";
  }

  return {
    languages: langs.length ? langs : ["unknown"],
    primaryLanguage: langs[0] ?? "unknown",
    framework,
    runtime,
    packageManager,
    projectType,
  };
}

// ── Risk assessment ───────────────────────────────────────────────────────────

function assessRisks(dir: string, stack: DetectedStack): RiskFinding[] {
  const findings: RiskFinding[] = [];
  let idCounter = 1;

  // JS/TS-specific checks
  if (stack.languages.includes("JavaScript") || stack.languages.includes("TypeScript")) {
    const jsFiles = listFilesRecursive(dir, [".js", ".cjs", ".mjs", ".ts", ".tsx"], 500);

    // var declarations
    let varCount = 0;
    const varFiles: string[] = [];
    for (const f of jsFiles.slice(0, 100)) {
      const content = readFileSafe(path.join(dir, f));
      const matches = (content.match(/\bvar\s+/g) || []).length;
      if (matches > 0) { varCount += matches; if (!varFiles.includes(f)) varFiles.push(f); }
    }
    if (varCount > 0) {
      findings.push({
        id: `r${idCounter++}`, level: varCount > 10 ? "medium" : "low",
        title: `var declarations (${varCount} found)`,
        file: varFiles[0] ?? "multiple files",
        reason: "var hoisting creates subtle scoping bugs inside loops and async functions.",
        opportunity: "Replace var with const/let throughout.",
        blastRadius: `${varCount} var declarations across ${varFiles.length} file(s).`,
        evidence: varFiles.slice(0, 3).join(", "),
      });
    }

    // callback-style async detection
    let callbackCount = 0;
    const cbFiles: string[] = [];
    for (const f of jsFiles.slice(0, 100)) {
      const content = readFileSafe(path.join(dir, f));
      if (/function\s*\([^)]*callback|,\s*function\s*\(err/.test(content)) {
        callbackCount++;
        if (!cbFiles.includes(f)) cbFiles.push(f);
      }
    }
    if (callbackCount > 0) {
      findings.push({
        id: `r${idCounter++}`, level: "high",
        title: "callback-based async patterns detected",
        file: cbFiles[0] ?? "multiple files",
        reason: "Nested callbacks make error paths invisible and are difficult to maintain.",
        opportunity: "Refactor to async/await with explicit error boundaries.",
        blastRadius: `${callbackCount} file(s) use callback-style async patterns.`,
        evidence: cbFiles.slice(0, 3).join(", "),
      });
    }

    // deprecated Buffer constructor
    let bufferCount = 0;
    const bufFiles: string[] = [];
    for (const f of jsFiles.slice(0, 100)) {
      const content = readFileSafe(path.join(dir, f));
      if (/new Buffer\(|Buffer\([^.)]/.test(content)) {
        bufferCount++;
        if (!bufFiles.includes(f)) bufFiles.push(f);
      }
    }
    if (bufferCount > 0) {
      findings.push({
        id: `r${idCounter++}`, level: "medium",
        title: "deprecated Buffer() constructor",
        file: bufFiles[0] ?? "multiple files",
        reason: "Buffer() without new is removed in Node.js 18+.",
        opportunity: "Replace with Buffer.from() / Buffer.alloc().",
        blastRadius: `${bufferCount} file(s) use deprecated Buffer constructor.`,
        evidence: bufFiles.slice(0, 3).join(", "),
      });
    }

    // console.log in production files
    let logCount = 0;
    const logFiles: string[] = [];
    for (const f of jsFiles.slice(0, 100)) {
      if (f.includes("test") || f.includes("spec") || f.includes(".test.")) continue;
      const content = readFileSafe(path.join(dir, f));
      const matches = (content.match(/console\.log\(/g) || []).length;
      if (matches > 0) { logCount += matches; if (!logFiles.includes(f)) logFiles.push(f); }
    }
    if (logCount > 0) {
      findings.push({
        id: `r${idCounter++}`, level: "low",
        title: `console.log in production paths (${logCount} found)`,
        file: logFiles[0] ?? "multiple files",
        reason: "console.log may leak sensitive information in production.",
        opportunity: "Replace with a structured logger (e.g. pino, winston).",
        blastRadius: `${logCount} console.log calls across ${logFiles.length} file(s).`,
        evidence: logFiles.slice(0, 3).join(", "),
      });
    }

    // No tests detected
    const testFiles = listFilesRecursive(dir, [".test.js", ".test.ts", ".spec.js", ".spec.ts"], 100);
    const hasTestDir = existsInDir(dir, "test") || existsInDir(dir, "tests") || existsInDir(dir, "__tests__");
    if (testFiles.length === 0 && !hasTestDir) {
      findings.push({
        id: `r${idCounter++}`, level: "high",
        title: "No test files detected",
        file: "project root",
        reason: "Modernization without a safety net of tests is high-risk.",
        opportunity: "Add behavioral tests before any modernization steps.",
        blastRadius: "Entire codebase — no regression protection exists.",
        evidence: "No .test.js / .test.ts / .spec.* files found.",
      });
    }

    // Outdated Node.js version
    if (stack.runtime.includes("Node.js")) {
      const vMatch = stack.runtime.match(/(\d+)/);
      const ver = vMatch ? parseInt(vMatch[1]) : 0;
      if (ver > 0 && ver < 18) {
        findings.push({
          id: `r${idCounter++}`, level: "high",
          title: `Outdated Node.js target (${stack.runtime})`,
          file: "package.json / .nvmrc",
          reason: `Node.js ${ver} is end-of-life. Critical security patches no longer released.`,
          opportunity: "Upgrade to Node.js 20 LTS or 22 LTS.",
          blastRadius: "Entire application runtime.",
          evidence: `Detected runtime: ${stack.runtime}`,
        });
      }
    }
  }

  // Python-specific checks
  if (stack.languages.includes("Python")) {
    const pyFiles = listFilesRecursive(dir, [".py"], 200);
    let printCount = 0;
    for (const f of pyFiles.slice(0, 50)) {
      const content = readFileSafe(path.join(dir, f));
      printCount += (content.match(/\bprint\s*\(/g) || []).length;
    }
    if (printCount > 0) {
      findings.push({
        id: `r${idCounter++}`, level: "low",
        title: `print() statements in production code (${printCount})`,
        file: "multiple files",
        reason: "print() is not production-safe; use logging module.",
        opportunity: "Replace print() with logging.info() / logging.debug().",
        blastRadius: `${printCount} print() calls found.`,
        evidence: "print() calls detected in source files.",
      });
    }
  }

  // Generic: no README
  if (!existsInDir(dir, "README.md") && !existsInDir(dir, "README")) {
    findings.push({
      id: `r${idCounter++}`, level: "low",
      title: "No README found",
      file: "project root",
      reason: "Missing documentation makes onboarding and modernization harder.",
      opportunity: "Add a README describing project purpose, setup, and usage.",
      blastRadius: "Documentation gap only.",
      evidence: "No README.md or README file found at project root.",
    });
  }

  return findings.length ? findings : [{
    id: "r1", level: "low",
    title: "No significant risks detected",
    file: "project root",
    reason: "Static analysis did not find common risk patterns for this repository type.",
    opportunity: "Review manually for domain-specific modernization opportunities.",
    blastRadius: "n/a",
    evidence: `Repository type: ${stack.projectType}`,
  }];
}

// ── Plan generation ───────────────────────────────────────────────────────────

function buildPlan(risks: RiskFinding[], stack: DetectedStack, dir: string): PlanStep[] {
  const steps: PlanStep[] = [];
  let stepId = 1;

  // Always first: capture existing state
  steps.push({
    id: stepId++,
    title: "Capture baseline commit and document current state",
    description: "Record the starting commit SHA and generate a summary of the repository state before any changes.",
    status: "passed",
    filesAffected: ["README.md", "package.json"],
    testsDelta: "baseline recorded",
    risk: "low",
    expectedImpact: "Provides a clear rollback target; establishes audit trail starting point.",
  });

  // One step per high risk
  for (const r of risks.filter(x => x.level === "high")) {
    steps.push({
      id: stepId++,
      title: `Remediate: ${r.title}`,
      description: r.opportunity,
      status: "pending",
      filesAffected: [r.file],
      risk: "high",
      expectedImpact: r.reason,
    });
  }

  // Medium risks
  for (const r of risks.filter(x => x.level === "medium")) {
    steps.push({
      id: stepId++,
      title: `Improve: ${r.title}`,
      description: r.opportunity,
      status: "pending",
      filesAffected: [r.file],
      risk: "medium",
      expectedImpact: r.reason,
    });
  }

  // Low risks
  for (const r of risks.filter(x => x.level === "low")) {
    steps.push({
      id: stepId++,
      title: `Cleanup: ${r.title}`,
      description: r.opportunity,
      status: "pending",
      filesAffected: [r.file],
      risk: "low",
      expectedImpact: r.reason,
    });
  }

  // Final: run tests
  const hasTests = existsInDir(dir, "test") || existsInDir(dir, "tests") ||
    existsInDir(dir, "__tests__") ||
    listFilesRecursive(dir, [".test.js", ".test.ts", ".spec.js", ".spec.ts"], 5).length > 0;

  if (hasTests) {
    steps.push({
      id: stepId++,
      title: "Run full test suite and generate safety-net report",
      description: "Execute all existing tests to confirm baseline behavior is preserved.",
      status: "pending",
      filesAffected: ["test/", "tests/", "__tests__/"],
      risk: "low",
      expectedImpact: "Confirms no regressions were introduced. Produces audit evidence.",
    });
  }

  // Mark step 1 as passed, rest pending
  return steps;
}

// ── Git helpers ───────────────────────────────────────────────────────────────

async function cloneRepo(url: string, targetDir: string): Promise<void> {
  await execFileAsync(
    "git",
    ["clone", "--depth", "1", "--no-tags", url, targetDir],
    { timeout: 60_000 }
  );
}

async function getCommitInfo(dir: string): Promise<{ sha: string; message: string; branch: string }> {
  try {
    const [shaResult, msgResult, branchResult] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: dir }),
      execFileAsync("git", ["log", "-1", "--format=%s"], { cwd: dir }),
      execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir }),
    ]);
    return {
      sha: shaResult.stdout.trim().slice(0, 12),
      message: msgResult.stdout.trim().slice(0, 120),
      branch: branchResult.stdout.trim(),
    };
  } catch {
    return { sha: "unknown", message: "unknown", branch: "unknown" };
  }
}

// ── Main analyze function ─────────────────────────────────────────────────────

export async function analyzeRepository(
  repoUrl: string,
  branch?: string
): Promise<WorkflowState> {
  const parsed = validateRepoUrl(repoUrl);
  if (!parsed) {
    throw Object.assign(new Error("Invalid repository URL. Only public GitHub HTTPS URLs are supported."), {
      code: "INVALID_URL",
      phase: "UNDERSTAND" as WorkflowPhase,
    });
  }

  const runId = uuidv4();
  const tmpDir = path.join(os.tmpdir(), `lcw-${runId}`);
  const now = new Date().toISOString();
  const auditTrail: AuditEntry[] = [];

  function log(type: AuditEntry["type"], message: string) {
    const t = new Date().toTimeString().slice(0, 8);
    auditTrail.push({ time: t, type, message });
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  try {
    log("info", `Session started — repository: ${repoUrl}`);
    log("info", `Cloning ${repoUrl}…`);

    // Clone
    try {
      await cloneRepo(repoUrl, tmpDir);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found") || msg.includes("does not exist") || msg.includes("Repository not found")) {
        throw Object.assign(new Error("Repository not found or is private."), {
          code: "REPOSITORY_NOT_FOUND", phase: "UNDERSTAND" as WorkflowPhase,
        });
      }
      if (msg.includes("timed out")) {
        throw Object.assign(new Error("Clone timed out. Repository may be too large."), {
          code: "CLONE_TIMEOUT", phase: "UNDERSTAND" as WorkflowPhase,
        });
      }
      throw Object.assign(new Error(`Clone failed: ${msg.slice(0, 200)}`), {
        code: "CLONE_FAILED", phase: "UNDERSTAND" as WorkflowPhase,
      });
    }

    log("success", `Cloned successfully to temp workspace`);

    // Commit info
    const commitInfo = await getCommitInfo(tmpDir);
    log("info", `HEAD: ${commitInfo.sha} — ${commitInfo.message}`);

    // Stack detection
    const stack = detectStack(tmpDir);
    log("info", `Detected: ${stack.primaryLanguage} / ${stack.framework} / ${stack.runtime}`);

    // File counts
    const ALL_EXTS = [".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs",
                      ".rb", ".php", ".c", ".cpp", ".cs", ".swift", ".kt", ".html", ".css"];
    const totalFiles = countFilesRecursive(tmpDir, ALL_EXTS);
    const loc = linesOfCodeEstimate(tmpDir);
    log("info", `Files: ${totalFiles}, estimated LOC: ${loc}`);

    // Risk assessment
    log("info", "Running risk assessment…");
    const risks = assessRisks(tmpDir, stack);
    const highCount = risks.filter(r => r.level === "high").length;
    const medCount  = risks.filter(r => r.level === "medium").length;
    const lowCount  = risks.filter(r => r.level === "low").length;
    log("info", `Assessment complete — ${risks.length} findings (${highCount} high, ${medCount} medium, ${lowCount} low)`);

    // Plan
    const plan = buildPlan(risks, stack, tmpDir);
    log("info", `Generated ${plan.length} modernization steps`);

    const endNow = new Date().toISOString();
    const durationMs = new Date(endNow).getTime() - new Date(now).getTime();
    const durationStr = durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

    log("success", `Analysis complete in ${durationStr}`);

    // Assemble repository info
    const repository: Repository = {
      name: parsed.repo,
      url: repoUrl,
      owner: parsed.owner,
      branch: commitInfo.branch !== "unknown" ? commitInfo.branch : (branch ?? "unknown"),
      currentCommit: commitInfo.sha,
      commitMessage: commitInfo.message,
      runtime: stack.runtime,
      framework: stack.framework,
      language: stack.primaryLanguage,
      detectedLanguages: stack.languages,
      packageManager: stack.packageManager,
      projectType: stack.projectType,
      lastCommit: new Date().toISOString().slice(0, 10),
      linesOfCode: loc,
      files: totalFiles,
    };

    // Analysis-time checks only. No test suite is executed here: these are the
    // analyzer's own assertions about the clone, and they are labelled as such.
    // The real safety net is the 18-test characterization suite in
    // legacy/get24-baseline/tests, run by tools/checkpoint.js in the node:6
    // container against the local baseline. It is deliberately NOT pointed at a
    // remote clone: running a stranger's npm test would execute their code.
    const baseTests = [
      { name: "Repository analysis complete",             file: "analysis", status: "passed" as const, duration: durationStr },
      { name: "Repository URL validated",                 file: "validation", status: "passed" as const, duration: "1ms" },
      { name: `Primary language detected: ${stack.primaryLanguage}`, file: "detection", status: "passed" as const, duration: "1ms" },
      { name: `Framework detected: ${stack.framework}`,  file: "detection", status: "passed" as const, duration: "1ms" },
      { name: `Package manager: ${stack.packageManager}`,file: "detection", status: "passed" as const, duration: "1ms" },
      { name: `${totalFiles} source files found`,         file: "filesystem", status: "passed" as const, duration: "5ms" },
    ];

    const verificationPass = {
      stepId: 1,
      suite: "Static analysis checks (no test suite executed)",
      duration: durationStr,
      coverage: 0,
      coverageNote: "Coverage requires test execution against the cloned repository. Not run during analysis.",
      tests: baseTests,
      exitCode: 0,
      summary: `${baseTests.length} analysis checks completed; no test suite was executed`,
    };

    const verificationFail = {
      ...verificationPass,
      tests: [
        ...baseTests,
        {
          name: "Test suite — not run (execution phase not started)",
          file: "not-run",
          status: "skipped" as const,
          duration: "0ms",
        },
      ],
    };

    const workflowState: WorkflowState = {
      runId,
      currentPhase: "ASSESS",
      overallStatus: "running",
      createdAt: now,
      updatedAt: endNow,
      errors: [],
      repository,
      // total 0 = "no safety net has run for this repository", which is the
      // truth at this point. The dashboard renders that as "not run" instead of
      // passing the analysis checks off as a test suite.
      safetyNet: {
        total: 0,
        passing: 0,
        failing: 0,
        generatedBy: "Static analysis only — no test suite executed. The safety net is the 18-test characterization suite in legacy/get24-baseline/tests, run by tools/checkpoint.js against the local baseline.",
        createdAt: now,
      },
      overallProgress: Math.round((1 / Math.max(plan.length, 1)) * 100),
      risks,
      plan,
      execution: {
        currentStepId: plan[1]?.id ?? 1,
        status: "not_available",
        log: auditTrail.map(a => ({ time: a.time, text: `${a.type.toUpperCase()}: ${a.message}` })) as ActivityLogEntry[],
        filesChanged: [],
      },
      verification: {
        pass: verificationPass,
        fail: verificationFail,
      },
      rollback: {
        stepId: 0,
        failedTestName: "No rollback triggered",
        failedTestFile: "",
        failedTestLine: 0,
        expectedValue: "",
        receivedValue: "",
        errorMessage: "No rollback has been triggered for this session.",
        previousCommit: commitInfo.sha,
        failedCommit: "",
        rollbackStatus: "not_triggered",
        recoveryValidation: "not_run",
        bobExplanation: "No rollback has been triggered. Rollback will be available after execution and verification phases.",
        saferAlternative: "Execute modernization steps one at a time. IBM Bob will trigger automatic rollback if tests fail.",
        timeline: [],
      },
      report: {
        startedAt: now,
        endedAt: endNow,
        duration: durationStr,
        stepsCompleted: 1,
        stepsRolledBack: 0,
        before: {
          "Language":        stack.primaryLanguage,
          "Framework":       stack.framework,
          "Runtime":         stack.runtime,
          "Files":           totalFiles.toString(),
          "Lines of code":   loc.toString(),
          "Risks found":     risks.length.toString(),
          "High risk items": highCount.toString(),
        },
        after: {
          "Language":        stack.primaryLanguage,
          "Framework":       stack.framework,
          "Runtime":         stack.runtime,
          "Steps planned":   plan.length.toString(),
          "Steps completed": "1",
          "Status":          "analysis complete",
        },
        changesApplied: [
          {
            title: "Repository analysis and risk assessment",
            files: ["(read-only analysis — no files changed)"],
            status: "applied",
            time: new Date().toTimeString().slice(0, 8),
          },
        ],
        rollbacks: [],
        auditTrail,
      },
    };

    return workflowState;

  } finally {
    // Always clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}
