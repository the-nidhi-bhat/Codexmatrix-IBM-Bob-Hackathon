import { spawn, execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { TestResult, VerificationRun } from "./types";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 1024 * 1024;
const TIMEOUT_MS = 10 * 60 * 1000;

interface Runner {
  image: string;
  command: string[];
  name: string;
  env?: string[];
  workdir?: string;
}

interface ProcessResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

function walkFiles(root: string, directory = root, found: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ["node_modules", "vendor", "target", "dist", "build", "coverage", ".venv", "venv"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(root, absolute, found);
    else if (entry.isFile()) found.push(path.relative(root, absolute).replace(/\\/g, "/"));
  }
  return found;
}

function detectRunner(workspace: string): Runner | null {
  const files = walkFiles(workspace);
  const nodeTests = files.filter((file) => /(^|\/)(test|tests|__tests__)(\/|$)/.test(file)
    || /\.(test|spec)\.(?:js|mjs|cjs)$/.test(file));
  const packageJsonFiles = files.filter((file) => file === "package.json" || file.endsWith("/package.json"));
  const packageJsonPath = path.join(workspace, packageJsonFiles.includes("package.json") ? "package.json" : packageJsonFiles[0] ?? "package.json");
  if (nodeTests.some((file) => /\.(?:js|mjs|cjs)$/.test(file))) {
    let packageJson: Record<string, unknown> = {};
    try { packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>; } catch { /* malformed manifests do not enable a runner */ }
    const engines = packageJson.engines as Record<string, string> | undefined;
    const runtimeText = fs.existsSync(path.join(workspace, ".nvmrc"))
      ? fs.readFileSync(path.join(workspace, ".nvmrc"), "utf8")
      : engines?.node ?? "";
    const versionMatch = runtimeText.match(/(?:^|[^0-9])(\d{1,2})(?=\.|$)/);
    const explicitMajor = versionMatch ? Number(versionMatch[1]) : null;
    const supportedMajor = runtimeText.trim().length === 0 ? 22
      : explicitMajor !== null && explicitMajor >= 18 && explicitMajor <= 24 ? explicitMajor : null;
    if (supportedMajor !== null) {
      return {
        image: `node:${supportedMajor}-alpine`,
        command: ["node", "--test", ...nodeTests],
        name: `Node.js built-in test runner (${nodeTests.length} files)`,
        env: ["NODE_NO_WARNINGS=1"],
      };
    }
  }

  const pythonTests = files.filter((file) => /(^|\/)(test[^/]*\.py|[^/]+_test\.py)$/.test(file));
  const pythonManifest = files.find((file) => ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"].some((name) => file === name || file.endsWith(`/${name}`)));
  if (pythonTests.length > 0) {
    const versionText = fs.existsSync(path.join(workspace, ".python-version"))
      ? fs.readFileSync(path.join(workspace, ".python-version"), "utf8")
      : "3.12";
    const explicitVersion = versionText.match(/3\.(9|1[0-4])/)?.[0] ?? null;
    const hasExplicitVersion = versionText.trim().length > 0;
    if (explicitVersion || !hasExplicitVersion) {
      const version = explicitVersion ?? "3.12";
      return {
        image: `python:${version}-alpine`,
        command: ["python", "-m", "unittest", "discover", "-v"],
        name: `Python unittest (${pythonTests.length} discovered test files)`,
        env: ["PYTHONDONTWRITEBYTECODE=1"],
        workdir: pythonManifest ? (path.posix.dirname(pythonManifest) === "." ? "" : path.posix.dirname(pythonManifest)) : "",
      };
    }
  }

  const goModPath = files.find((file) => file === "go.mod" || file.endsWith("/go.mod"));
  if (goModPath && files.some((file) => /(^|\/)[^/]+_test\.go$/.test(file))) {
    const moduleDirectory = path.posix.dirname(goModPath);
    const moduleRoot = path.join(workspace, moduleDirectory === "." ? "" : moduleDirectory);
    const goMod = fs.readFileSync(path.join(workspace, goModPath), "utf8");
    const version = goMod.match(/^go\s+(1\.[0-9]+)/m)?.[1] ?? "1.23";
    const vendored = fs.existsSync(path.join(moduleRoot, "vendor"));
    const externalDependencies = /^\s*require\s*(?:\(|\S)/m.test(goMod);
    if (externalDependencies && !vendored) return null;
    return {
      image: `golang:${version}-alpine`,
      command: ["go", "test", "-json", "./..."],
      name: "Go test runner",
      env: ["GOPROXY=off", "GOSUMDB=off", "GOCACHE=/tmp/go-cache", "GOPATH=/tmp/go-path", ...(vendored ? ["GOFLAGS=-mod=vendor"] : [])],
      workdir: moduleDirectory === "." ? "" : moduleDirectory,
    };
  }

  const cargoManifest = files.find((file) => file === "Cargo.toml" || file.endsWith("/Cargo.toml"));
  const cargoDirectory = cargoManifest ? path.posix.dirname(cargoManifest) : ".";
  if (cargoManifest && (files.includes("Cargo.lock") || files.includes(`${cargoDirectory}/Cargo.lock`))
    && fs.existsSync(path.join(workspace, cargoDirectory, "vendor"))) {
    return {
      image: "rust:1.85-alpine",
      command: ["cargo", "test", "--locked", "--offline"],
      name: "Cargo test runner",
      env: ["CARGO_HOME=/tmp/cargo-home", "CARGO_TARGET_DIR=/tmp/cargo-target", "CARGO_NET_OFFLINE=true"],
      workdir: cargoDirectory === "." ? "" : cargoDirectory,
    };
  }
  return null;
}

function unavailable(stepId: number, summary: string): VerificationRun {
  return {
    status: "not_available",
    stepId,
    suite: "Repository verification",
    duration: "not run",
    coverage: 0,
    coverageNote: "Coverage is not provided by the detected runner.",
    tests: [],
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    exitCode: null,
    summary,
    output: "",
    command: null,
  };
}

function runProcess(command: string, args: string[], containerName: string, timeoutMs = TIMEOUT_MS): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const append = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > MAX_OUTPUT) output = output.slice(output.length - MAX_OUTPUT);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform === "win32") {
        execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"]).catch(() => undefined);
      }
      void execFileAsync("docker", ["kill", containerName], { windowsHide: true })
        .catch(() => undefined)
        .finally(() => execFileAsync("docker", ["rm", "-f", containerName], { windowsHide: true }).catch(() => undefined));
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ exitCode: 127, output, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output, timedOut });
    });
  });
}

function dockerArgs(workspace: string, runner: Runner, containerName: string): string[] {
  return [
    "run", "--rm", "--pull=never", "--name", containerName, "--network=none", "--read-only",
    "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=64",
    "--memory=512m", "--cpus=1", "--user=65534:65534",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--volume", `${workspace}:/workspace:ro`, "--workdir", runner.workdir ? `/workspace/${runner.workdir}` : "/workspace",
    ...(runner.env ?? []).flatMap((entry) => ["--env", entry]),
    runner.image, ...runner.command,
  ];
}

function parseNode(output: string): { total: number; passed: number; failed: number; skipped: number; tests: TestResult[] } | null {
  const total = Number(output.match(/^# tests\s+(\d+)\s*$/m)?.[1]);
  if (!Number.isFinite(total)) return null;
  const passed = Number(output.match(/^# pass\s+(\d+)\s*$/m)?.[1] ?? 0);
  const failed = Number(output.match(/^# fail\s+(\d+)\s*$/m)?.[1] ?? 0);
  const skipped = Number(output.match(/^# skipped\s+(\d+)\s*$/m)?.[1] ?? 0);
  const tests = Array.from(output.matchAll(/^\s*(ok|not ok)\s+\d+\s+-\s+(.+)$/gm), (match) => ({
    name: match[2].trim(), file: "node --test", status: match[1] === "not ok" ? "failed" as const : /#\s*SKIP\b/.test(match[2]) ? "skipped" as const : "passed" as const,
    duration: "reported by Node.js",
  }));
  return { total, passed, failed, skipped, tests };
}

function parsePython(output: string): { total: number; passed: number; failed: number; skipped: number; tests: TestResult[] } | null {
  const total = Number(output.match(/^Ran\s+(\d+)\s+tests?/m)?.[1]);
  if (!Number.isFinite(total)) return null;
  const failed = Number(output.match(/failures=(\d+)/)?.[1] ?? 0) + Number(output.match(/errors=(\d+)/)?.[1] ?? 0);
  const skipped = Number(output.match(/skipped=(\d+)/)?.[1] ?? 0);
  const tests = Array.from(output.matchAll(/^([^\r\n]+) \.\.\. (ok|FAIL|ERROR|skipped.*)$/gm), (match) => ({
    name: match[1].trim(), file: "python unittest", status: match[2] === "ok" ? "passed" as const : match[2].startsWith("skipped") ? "skipped" as const : "failed" as const,
    duration: "reported by unittest",
  }));
  return { total, passed: Math.max(0, total - failed - skipped), failed, skipped, tests };
}

function parseGo(output: string): { total: number; passed: number; failed: number; skipped: number; tests: TestResult[] } | null {
  const tests: TestResult[] = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { Action?: string; Test?: string; Package?: string; Elapsed?: number; Output?: string };
      if (!event.Test || !["pass", "fail", "skip"].includes(event.Action ?? "")) continue;
      tests.push({
        name: event.Test,
        file: event.Package ?? "go test",
        status: event.Action === "pass" ? "passed" : event.Action === "skip" ? "skipped" : "failed",
        duration: `${Math.round((event.Elapsed ?? 0) * 1000)}ms`,
        error: event.Action === "fail" ? event.Output : undefined,
      });
    } catch { /* non-JSON diagnostics are retained in output */ }
  }
  if (tests.length === 0) return null;
  const passed = tests.filter((test) => test.status === "passed").length;
  const failed = tests.filter((test) => test.status === "failed").length;
  const skipped = tests.filter((test) => test.status === "skipped").length;
  return { total: tests.length, passed, failed, skipped, tests };
}

function parseRust(output: string): { total: number; passed: number; failed: number; skipped: number; tests: TestResult[] } | null {
  const result = output.match(/test result: .*?(\d+) passed;\s*(\d+) failed;\s*(\d+) ignored/);
  if (!result) return null;
  const tests = Array.from(output.matchAll(/^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)$/gm), (match) => ({
    name: match[1], file: "cargo test", status: match[2] === "ok" ? "passed" as const : match[2] === "ignored" ? "skipped" as const : "failed" as const,
    duration: "reported by Cargo",
  }));
  const passed = Number(result[1]);
  const failed = Number(result[2]);
  const skipped = Number(result[3]);
  return { total: passed + failed + skipped, passed, failed, skipped, tests };
}

export async function runRepositoryVerification(workspace: string, stepId: number): Promise<VerificationRun> {
  const runner = detectRunner(workspace);
  if (!runner) return unavailable(stepId, "No supported native test suite was detected. Repository scripts are not executed.");

  try {
    await execFileAsync("docker", ["image", "inspect", runner.image], { timeout: 10_000, windowsHide: true });
  } catch {
    return unavailable(stepId, `Safe verification requires the preinstalled Docker image ${runner.image}; no image will be downloaded automatically.`);
  }

  const started = Date.now();
  const containerName = `lcw-verify-${uuidv4()}`;
  const command = `docker ${dockerArgs("<run-workspace>", runner, containerName).join(" ")}`;
  let result: ProcessResult;
  try {
    result = await runProcess("docker", dockerArgs(workspace, runner, containerName), containerName);
  } catch (error) {
    return unavailable(stepId, `Could not start the isolated verifier: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parser = runner.name.startsWith("Node.js") ? parseNode
    : runner.name.startsWith("Python") ? parsePython
    : runner.name.startsWith("Go") ? parseGo : parseRust;
  const counts = parser(result.output);
  if (!counts || counts.total === 0) {
    return {
      ...unavailable(stepId, result.timedOut ? "Verification timed out before a test summary was produced." : "The recognized runner produced no test summary; no test counts are available."),
      suite: runner.name,
      duration: `${Date.now() - started}ms`,
      exitCode: result.exitCode,
      output: result.output,
      command,
    };
  }
  const status = result.exitCode !== 0 || counts.failed > 0 ? "failed"
    : counts.passed > 0 ? "passed" : "not_available";
  return {
    status,
    stepId,
    suite: runner.name,
    duration: `${Date.now() - started}ms`,
    coverage: 0,
    coverageNote: "Coverage is not provided by the detected runner.",
    tests: counts.tests,
    total: counts.total,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    exitCode: result.exitCode,
    summary: result.timedOut
      ? "Verification timed out; runner output is incomplete."
      : counts.passed === 0 && counts.failed === 0
        ? `${counts.total} test(s) were discovered but all were skipped; no behavior was verified.`
        : `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped.`,
    output: result.output,
    command,
  };
}