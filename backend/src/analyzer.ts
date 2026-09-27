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
  ProjectStructureEntry,
  RepositoryArchitecture,
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

function readFileSafe(p: string): string {
  try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}

function existsInDir(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name));
}

function filesNamedRecursive(dir: string, name: string, results: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ["node_modules", "vendor", "target", "dist", "build", "coverage", ".venv", "venv"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) filesNamedRecursive(fullPath, name, results);
    else if (entry.isFile() && entry.name === name) results.push(fullPath);
  }
  return results;
}

function hasFileNamedRecursive(dir: string, name: string): boolean {
  return filesNamedRecursive(dir, name).length > 0;
}

function countFilesRecursive(dir: string, exts: string[]): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (["node_modules", ".git", "vendor", ".venv", "venv", "target", "build", "dist"].includes(e.name)) continue;
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
        if (["node_modules", ".git", "vendor", ".venv", "venv", "target", "build", "dist"].includes(e.name)) continue;
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
  const CODE_EXTS = [".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs",
                     ".rb", ".php", ".c", ".h", ".cpp", ".hpp", ".cs", ".swift", ".kt", ".sql", ".sh", ".vue", ".svelte"];
  let total = 0;
  function walk(d: string) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (["node_modules", ".git", "vendor", ".venv", "venv", "target", "build", "dist"].includes(e.name)) continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (CODE_EXTS.some(ext => e.name.endsWith(ext))) {
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
  const extensions: Array<[string, string]> = [
    [".js", "JavaScript"], [".mjs", "JavaScript"], [".cjs", "JavaScript"],
    [".ts", "TypeScript"], [".tsx", "TypeScript"], [".jsx", "JavaScript"],
    [".py", "Python"], [".java", "Java"], [".kt", "Kotlin"], [".go", "Go"],
    [".rs", "Rust"], [".rb", "Ruby"], [".php", "PHP"], [".cs", "C#"],
    [".c", "C"], [".cpp", "C++"], [".swift", "Swift"],
  ];
  const langs = [...new Set(extensions.filter(([ext]) => countFilesRecursive(dir, [ext]) > 0).map(([, language]) => language))];
  const packageFiles = filesNamedRecursive(dir, "package.json");
  const packageManifests: Array<Record<string, unknown>> = [];
  for (const file of packageFiles) {
    try { packageManifests.push(JSON.parse(readFileSafe(file)) as Record<string, unknown>); } catch { /* ignore invalid nested manifests */ }
  }
  if (packageFiles.length && !langs.includes("JavaScript") && !langs.includes("TypeScript")) langs.push("JavaScript");
  const dependencies: Record<string, string> = {};
  for (const manifest of packageManifests) {
    Object.assign(dependencies,
      typeof manifest.dependencies === "object" && manifest.dependencies ? manifest.dependencies as Record<string, string> : {},
      typeof manifest.devDependencies === "object" && manifest.devDependencies ? manifest.devDependencies as Record<string, string> : {});
  }
  const pythonManifests = ["requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "Pipfile"].flatMap((file) => filesNamedRecursive(dir, file));
  if (pythonManifests.length && !langs.includes("Python")) langs.push("Python");
  const pythonConfig = pythonManifests.map(readFileSafe).join("\n").toLowerCase();
  const composer = filesNamedRecursive(dir, "composer.json").map(readFileSafe).join("\n").toLowerCase();
  let framework = "not detected";
  let runtime = "not detected";
  let packageManager = "not detected";
  let projectType = "not detected";

  const jsEngines = packageManifests.map((manifest) => manifest.engines as Record<string, string> | undefined).find((engines) => engines?.node);
  const jsRuntime = readFileSafe(path.join(dir, ".nvmrc")).trim() || jsEngines?.node;
  if (langs.includes("JavaScript") || langs.includes("TypeScript") || packageFiles.length > 0) {
    runtime = jsRuntime ? `Node.js ${jsRuntime}` : "Node.js (version not specified)";
    const declaredManager = packageManifests.map((manifest) => typeof manifest.packageManager === "string" ? manifest.packageManager.split("@")[0] : "").find(Boolean);
    packageManager = hasFileNamedRecursive(dir, "pnpm-lock.yaml") || declaredManager === "pnpm" ? "pnpm"
      : hasFileNamedRecursive(dir, "yarn.lock") || declaredManager === "yarn" ? "yarn"
      : hasFileNamedRecursive(dir, "bun.lock") || hasFileNamedRecursive(dir, "bun.lockb") || declaredManager === "bun" ? "bun"
      : hasFileNamedRecursive(dir, "package-lock.json") || hasFileNamedRecursive(dir, "npm-shrinkwrap.json") || packageFiles.length > 0 ? "npm"
      : "not detected";
    const frameworks: Array<[string, string]> = [
      ["next", "Next.js"], ["nuxt", "Nuxt.js"], ["@nestjs/core", "NestJS"],
      ["express", `Express${dependencies.express ? ` ${dependencies.express.replace(/[\^~]/, "")}` : ""}`],
      ["fastify", "Fastify"], ["koa", "Koa"], ["@hapi/hapi", "Hapi"],
      ["react", "React"], ["vue", "Vue.js"], ["@angular/core", "Angular"], ["svelte", "Svelte"],
    ];
    const detectedFrameworks = frameworks.filter(([name]) => dependencies[name]).map(([, name]) => name);
    framework = detectedFrameworks.length ? [...new Set(detectedFrameworks)].join(" + ") : framework;
    projectType = packageFiles.length > 1 ? "JavaScript/TypeScript monorepo"
      : dependencies.express || dependencies.fastify || dependencies.koa ? "web-api"
      : dependencies.react || dependencies.vue || dependencies["@angular/core"] ? "spa"
      : dependencies.next || dependencies.nuxt ? "fullstack" : "Node.js application";
  }

  if (pythonManifests.length > 0 || langs.includes("Python")) {
    runtime = readFileSafe(path.join(dir, ".python-version")).trim() || "Python (version not specified)";
    packageManager = hasFileNamedRecursive(dir, "poetry.lock") ? "Poetry"
      : hasFileNamedRecursive(dir, "uv.lock") ? "uv"
      : hasFileNamedRecursive(dir, "Pipfile") ? "Pipenv" : "pip";
    framework = pythonConfig.includes("django") ? "Django"
      : pythonConfig.includes("fastapi") ? "FastAPI"
      : pythonConfig.includes("flask") ? "Flask" : framework;
    projectType = "Python application";
  }

  if (hasFileNamedRecursive(dir, "pom.xml") || hasFileNamedRecursive(dir, "build.gradle") || hasFileNamedRecursive(dir, "build.gradle.kts")) {
    if (!langs.includes("Java") && !langs.includes("Kotlin")) langs.push("Java");
    const pom = filesNamedRecursive(dir, "pom.xml").map(readFileSafe).join("\n");
    const javaVersion = pom.match(/<maven\.compiler\.(?:release|source)>\s*([^<]+)\s*</)?.[1]
      ?? pom.match(/<java\.version>\s*([^<]+)\s*</)?.[1];
    runtime = javaVersion ? `JVM ${javaVersion.trim()}` : "JVM (version not specified)";
    packageManager = hasFileNamedRecursive(dir, "pom.xml") ? "Maven" : "Gradle";
    framework = pom.toLowerCase().includes("spring-boot") ? "Spring Boot" : framework;
    projectType = "JVM application";
  }

  if (hasFileNamedRecursive(dir, "go.mod")) {
    if (!langs.includes("Go")) langs.push("Go");
    const goMod = filesNamedRecursive(dir, "go.mod").map(readFileSafe).join("\n");
    runtime = `Go${goMod.match(/^go\s+([^\r\n]+)/m)?.[1] ? ` ${goMod.match(/^go\s+([^\r\n]+)/m)?.[1]}` : ""}`;
    packageManager = "Go modules";
    framework = goMod.includes("gin-gonic/gin") ? "Gin" : goMod.includes("labstack/echo") ? "Echo" : framework;
    projectType = "Go application";
  }
  if (hasFileNamedRecursive(dir, "Cargo.toml")) {
    if (!langs.includes("Rust")) langs.push("Rust");
    runtime = "Rust"; packageManager = "Cargo"; projectType = "Rust application";
  }
  if (hasFileNamedRecursive(dir, "Gemfile")) {
    if (!langs.includes("Ruby")) langs.push("Ruby");
    const gemfile = filesNamedRecursive(dir, "Gemfile").map(readFileSafe).join("\n").toLowerCase();
    runtime = "Ruby"; packageManager = "Bundler"; projectType = "Ruby application";
    framework = gemfile.includes("rails") ? "Rails" : gemfile.includes("sinatra") ? "Sinatra" : framework;
  }
  if (hasFileNamedRecursive(dir, "composer.json")) {
    if (!langs.includes("PHP")) langs.push("PHP");
    runtime = "PHP"; packageManager = "Composer"; projectType = "PHP application";
    framework = composer.includes("laravel/framework") ? "Laravel" : composer.includes("symfony/") ? "Symfony" : framework;
  }
  return {
    languages: langs,
    primaryLanguage: langs[0] ?? "not detected",
    framework,
    runtime,
    packageManager,
    projectType,
  };
}

const SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".java", ".kt", ".go", ".rs", ".rb", ".php", ".cs", ".c", ".cpp", ".swift", ".html", ".css", ".scss", ".vue", ".svelte", ".sh", ".sql"];
const ROOT_MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "pom.xml", "build.gradle", "build.gradle.kts", "go.mod", "Cargo.toml", "Gemfile", "composer.json", "README.md"];

function collectProjectStructure(dir: string): ProjectStructureEntry[] {
  const result: ProjectStructureEntry[] = [];
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return result; }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || ["node_modules", "vendor", "target", "dist", "build", "coverage"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const files = countFilesRecursive(fullPath, SOURCE_EXTENSIONS);
      if (files > 0) result.push({ path: `${entry.name}/`, kind: "directory", files });
    } else if (ROOT_MANIFESTS.includes(entry.name)) {
      result.push({ path: entry.name, kind: "file", files: 1 });
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      result.push({ path: entry.name, kind: "file", files: 1 });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function buildArchitecture(structure: ProjectStructureEntry[]): RepositoryArchitecture {
  const sourceDirectories = structure.filter((entry) => entry.kind === "directory");
  const rootSources = structure.filter((entry) => entry.kind === "file" && SOURCE_EXTENSIONS.some((extension) => entry.path.endsWith(extension)));
  if (sourceDirectories.length === 0 && rootSources.length === 0) {
    return {
      available: false,
      summary: "Architecture unavailable: no source directories were detected.",
      diagram: null,
      components: [],
    };
  }

  const components = sourceDirectories.length > 0
    ? sourceDirectories
    : [{ path: ".", kind: "directory" as const, files: rootSources.length }];
  const labels = components.map((component) => component.path.replace(/[^a-zA-Z0-9_./ -]/g, "").replace(/"/g, "").trim());
  const nodes = labels.map((label, index) => `  C${index}["${label} (${components[index].files} source files)"]`);
  const edges = labels.map((_label, index) => `  ROOT --> C${index}`);
  const diagram = [
    "flowchart LR",
    "  ROOT[\"Repository root\"]",
    ...nodes,
    ...edges,
  ].join("\n");

  return {
    available: true,
    summary: sourceDirectories.length > 0
      ? `Repository structure detected from ${components.length} source director${components.length === 1 ? "y" : "ies"}. Connections show directory containment only.`
      : `Repository root contains ${rootSources.length} source files; no internal source directories were detected.`,
    diagram,
    components,
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

  return findings;
}

// ── Plan generation ───────────────────────────────────────────────────────────

function buildPlan(risks: RiskFinding[], stack: DetectedStack, dir: string): PlanStep[] {
  const steps: PlanStep[] = [];
  let stepId = 1;

  // Always first: capture existing state
  steps.push({
    id: stepId++,
    title: "Record analyzed baseline commit",
    description: "The repository HEAD was recorded during analysis. No source files were changed.",
    status: "passed",
    filesAffected: [],
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
      ...(r.title === "No README found" ? { operationId: "create-analysis-readme" } : {}),
    });
  }

  // Final: run tests
  const hasTests = existsInDir(dir, "test") || existsInDir(dir, "tests") ||
    existsInDir(dir, "__tests__") ||
    listFilesRecursive(dir, [".test.js", ".test.ts", ".spec.js", ".spec.ts"], 5).length > 0;

  if (hasTests) {
    steps.push({
      id: stepId++,
      title: "Detect and run supported repository verification",
      description: "Use a recognized native test runner only when an isolated runtime and dependencies are available.",
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

async function cloneRepo(url: string, targetDir: string, branch?: string): Promise<void> {
  const args = ["clone", "--depth", "1", "--no-tags"];
  if (branch) args.push("--branch", branch);
  args.push(url, targetDir);
  await execFileAsync(
    "git",
    args,
    { timeout: 60_000 }
  );
}

async function getCommitInfo(dir: string): Promise<{ sha: string; message: string; branch: string; date: string }> {
  try {
    const [shaResult, msgResult, branchResult, dateResult] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: dir }),
      execFileAsync("git", ["log", "-1", "--format=%s"], { cwd: dir }),
      execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir }),
      execFileAsync("git", ["log", "-1", "--format=%cs"], { cwd: dir }),
    ]);
    return {
      sha: shaResult.stdout.trim().slice(0, 12),
      message: msgResult.stdout.trim().slice(0, 120),
      branch: branchResult.stdout.trim(),
      date: dateResult.stdout.trim(),
    };
  } catch {
    return { sha: "unknown", message: "unknown", branch: "unknown", date: "unknown" };
  }
}

// ── Main analyze function ─────────────────────────────────────────────────────

export async function analyzeRepository(
  repoUrl: string,
  branch?: string
): Promise<{ workflow: WorkflowState; workspacePath: string }> {
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
      await cloneRepo(repoUrl, tmpDir, branch);
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
    const ALL_EXTS = [".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs",
              ".rb", ".php", ".c", ".h", ".cpp", ".hpp", ".cs", ".swift", ".kt", ".html", ".css", ".scss", ".vue", ".svelte", ".sql", ".sh"];
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
    const projectStructure = collectProjectStructure(tmpDir);
    const architecture = buildArchitecture(projectStructure);
    const repository: Repository = {
      name: parsed.repo,
      url: repoUrl,
      owner: parsed.owner,
      branch: commitInfo.branch !== "unknown" ? commitInfo.branch : branch ?? "not detected",
      currentCommit: commitInfo.sha,
      commitMessage: commitInfo.message,
      runtime: stack.runtime,
      framework: stack.framework,
      language: stack.primaryLanguage,
      detectedLanguages: stack.languages,
      packageManager: stack.packageManager,
      projectType: stack.projectType,
      lastCommit: commitInfo.date,
      linesOfCode: loc,
      files: totalFiles,
      projectStructure,
    };

    const verificationNotRun = {
      status: "not_run" as const,
      stepId: 1,
      suite: "Repository verification",
      duration: "not run",
      coverage: 0,
      coverageNote: "Coverage not available until a supported verification command runs.",
      tests: [],
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      exitCode: null,
      summary: "Verification not run.",
      output: "",
      command: null,
    };

    const workflowState: WorkflowState = {
      runId,
      currentPhase: "PLAN",
      overallStatus: "running",
      createdAt: now,
      updatedAt: endNow,
      errors: [],
      operationStatus: "idle",
      repository,
      architecture,
      safetyNet: {
        total: 0,
        passing: 0,
        failing: 0,
        generatedBy: "not run",
        createdAt: now,
      },
      overallProgress: Math.round(100 / Math.max(plan.length, 1)),
      risks,
      plan,
      execution: {
        currentStepId: plan[1]?.id ?? 1,
        status: "not_available",
        message: "No approved repository-specific operation is available for these analysis findings.",
        log: auditTrail.map(a => ({ time: a.time, text: `${a.type.toUpperCase()}: ${a.message}` })) as ActivityLogEntry[],
        filesChanged: [],
      },
      verification: {
        baseline: null,
        recovery: null,
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
        targetCommit: commitInfo.sha,
        rollbackCommit: null,
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
          "Steps completed": "1 (baseline recorded)",
          "Status":          "analysis complete; no execution performed",
        },
        changesApplied: [],
        rollbacks: [],
        auditTrail,
      },
    };

    return { workflow: workflowState, workspacePath: tmpDir };
  } catch (error) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
    throw error;
  }
}
