// ─────────────────────────────────────────────────────────────────────────────
//  Checkpoint runner — adapter for the EXISTING tools/checkpoint.js
//
//  Runs the canonical engine inside a throwaway `git worktree` of this
//  repository and reports what the engine reported. It does not validate,
//  roll back, or decide anything: all of that stays in tools/.
//
//  Why a worktree is required rather than a path or a cwd option:
//  tools/checkpoint.js, tools/validate.js and tools/rollback.js each compute
//  ROOT = path.resolve(__dirname, '..') and run every git and Docker command
//  with cwd: ROOT. A worktree of this repository therefore *contains* the
//  engine, so __dirname resolves inside the worktree and ROOT becomes the
//  worktree — the ancestry guards, `git revert`, the validation/*.json run
//  files, the `docker run -v ROOT:/app` mount and
//  legacy/get24-baseline/tests/run.sh all land inside the copy under test.
//  The engine is never modified, and the main working tree is never touched.
//
//  Because the engine lives in this branch's history, the commit under test
//  must descend from the commit that introduced it. That is the normal shape
//  of a modernization run (base = current tip, subject = base + one approved
//  step), and a subject from before the engine existed is refused rather than
//  patched around.
//
//  Safety rules enforced here:
//  - The commit must be a full 40-character lowercase hex SHA, supplied by the
//    server. No path, branch, tag, command or flag is ever accepted from a
//    caller, and nothing from a caller reaches a shell.
//  - git and the child process are invoked with argv arrays, shell: false.
//  - Only `node <worktree>/tools/checkpoint.js` is ever spawned.
//  - The worktree path is built from os.tmpdir() + a server uuid and is
//    re-checked with realpath before anything is executed in it.
//  - The single source of truth is the engine's own --result-file. The
//    internal validation/cp-*-tmp.json files are never read or reinterpreted.
//  - Exactly one run per worktree, because those internal temp files are
//    hard-coded paths under ROOT.
//  - The worktree is removed in a finally block; a removal failure is
//    reported as a cleanup warning instead of being hidden.
//
//  Ancestry is checked against a NAMED, server-owned ref, never against the
//  ambient HEAD. That distinction is the whole point of this file's contract:
//
//    default  anchor = integration/final, checkout detached at the commit.
//             Correct for a baseline subject: a commit in the controlled
//             integration history. Anchor is a name, so the answer does not
//             change because someone checked out a different branch.
//
//    run ref  anchor = lcw/modernization/<uuid>, checkout ATTACHED to it.
//             Correct for a modernization subject: the executor's commit is a
//             CHILD of integration/final, so it is genuinely not an ancestor
//             of the integration tip, and anchoring on the tip refused a
//             perfectly legitimate run. Anchoring on the branch that holds it
//             is both true and narrower — the commit must be inside that
//             specific run branch. Attaching, rather than detaching, is what
//             lets the engine's own `git revert` land as a persistent commit
//             on a server-owned branch instead of a throwaway detached HEAD.
//
//  This replaces an ancestry check against HEAD; it does not relax one. The
//  commit must still be a full 40-character SHA, must exist, and must be
//  contained in the anchor. A ref is accepted only if it matches the executor's
//  run-branch pattern, so no caller can widen the set of trusted refs.
// ─────────────────────────────────────────────────────────────────────────────

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { INTEGRATION_BRANCH, RUN_BRANCH } from "./modernization/executor";

const execFileAsync = promisify(execFile);

/** A full commit SHA. Anything else — a branch, a tag, a path, a flag — is refused. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** The 18-test suite runs in Docker; a cold run is ~20s, so this is generous. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** git worktree add on a cold object store is slow but bounded. */
const WORKTREE_TIMEOUT_MS = 5 * 60 * 1000;

/** Keep the tail of the child's output; a runaway log must not exhaust memory. */
const MAX_CAPTURE_BYTES = 256 * 1024;

const RESULT_FILE_NAME = "lcw-run.json";

/** The engine's own result file, passed through verbatim. Never reinterpreted. */
export type CheckpointResultFile = { status: string } & Record<string, unknown>;

export type CheckpointOutcome = "COMPLETED" | "REJECTED" | "FAILED";

export interface CheckpointRunError {
  code:
    | "INVALID_COMMIT_SHA"
    | "INVALID_REF"
    | "UNTRUSTED_REF"
    | "REF_NOT_FOUND"
    | "REPO_ROOT_UNRESOLVED"
    | "COMMIT_NOT_FOUND"
    | "COMMIT_NOT_ANCESTOR"
    | "ENGINE_NOT_PRESENT"
    | "WORKTREE_CREATE_FAILED"
    | "WORKTREE_OUTSIDE_TMP"
    | "SPAWN_FAILED"
    | "TIMEOUT"
    | "NO_RESULT_FILE"
    | "MALFORMED_RESULT";
  message: string;
}

export interface CheckpointRunResult {
  runId: string;
  outcome: CheckpointOutcome;
  error?: CheckpointRunError;
  /** The commit that was verified, echoed back for the audit trail. */
  commit: string;
  /** The named, server-owned ref the commit was required to be contained in:
   *  integration/final, or the run branch the executor created. Never "HEAD". */
  anchorRef: string;
  repositoryRoot: string;
  worktreePath: string;
  resultFile: string;
  exitCode: number | null;
  signal: string | null;
  /** The engine's status verbatim: VERIFIED, RECOVERY_VERIFIED, RECOVERY_FAILED,
   *  VALIDATION_FAILED, REFUSED. Null when no usable result file was produced. */
  checkpointStatus: string | null;
  /** The engine's parsed result file, verbatim. */
  checkpoint: CheckpointResultFile | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  /** True once `git worktree add` succeeded, so a false `removed` means a leak. */
  worktreeCreated: boolean;
  cleanup: { removed: boolean; warning?: string };
}

export interface RunCheckpointOptions {
  /** Server-controlled, full 40-character commit SHA. */
  commit: string;
  /**
   * Optional server-owned anchor. Omit it for a baseline subject that lives in
   * the controlled integration history. Pass the executor's
   * lcw/modernization/<uuid> branch for a modernization subject — that commit
   * is a child of the integration tip, so it is not an ancestor of it.
   *
   * Server-controlled, never client text: a value that does not match the
   * executor's run-branch pattern is refused before any git command runs.
   */
  ref?: string;
  timeoutMs?: number;
}

function isInside(candidate: string, parent: string): boolean {
  const rel = path.relative(parent, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * A caller value is text only if it IS text.
 *
 * Both entry points are typed `string`, but a JavaScript caller, a future
 * route forwarding client data, or a JSON body can still hand over a number,
 * an object, an array or a boolean. Calling `.trim()` on one of those throws a
 * raw TypeError out of a function whose whole contract is that it resolves
 * with a structured result for every expected outcome — so a wrong *type* must
 * be handled the same way as a wrong *value*, not by crashing.
 */
function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The repository is resolved server-side from this module's own location. */
async function resolveRepositoryRoot(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
    cwd: __dirname,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

async function git(root: string, args: string[], timeoutMs = 30_000): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Kill the child and, on Windows, the Docker process tree it started. */
function killChildTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    execFileAsync("taskkill", ["/pid", String(pid), "/T", "/F"]).catch(() => undefined);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

async function removeWorktree(root: string, worktreePath: string): Promise<CheckpointRunResult["cleanup"]> {
  const reason = (err: unknown) => (err as { stderr?: string; message?: string }).stderr?.trim()
    || (err as Error).message.trim();
  try {
    await git(root, ["worktree", "remove", worktreePath], WORKTREE_TIMEOUT_MS);
    await git(root, ["worktree", "prune"]).catch(() => undefined);
    return { removed: true };
  } catch (first) {
    // A run killed mid-`git revert` can leave the worktree dirty or conflicted.
    // --force removes the copy; the run result is already in memory, and a
    // failure here is reported rather than hidden.
    try {
      await git(root, ["worktree", "remove", "--force", worktreePath], WORKTREE_TIMEOUT_MS);
      await git(root, ["worktree", "prune"]).catch(() => undefined);
      return { removed: true, warning: `worktree needed --force to be removed: ${reason(first)}` };
    } catch (second) {
      return {
        removed: false,
        warning: `worktree NOT removed, inspect it manually at ${worktreePath}: ${reason(second)}`,
      };
    }
  }
}

/**
 * Run tools/checkpoint.js for `commit` inside a disposable worktree.
 *
 * Resolves with a structured result for every expected outcome; it does not
 * throw for a refusal, a failed run, a timeout or a missing result file.
 */
export async function runCheckpoint(options: RunCheckpointOptions): Promise<CheckpointRunResult> {
  const startedAt = Date.now();
  const runId = uuidv4();
  const commit = asText(options.commit).trim();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const worktreePath = path.join(os.tmpdir(), `lcw-wt-${runId}`);
  const resultFile = path.join(worktreePath, "validation", RESULT_FILE_NAME);

  // Every exit path returns this same object, so the finally block can attach
  // cleanup and duration to it.
  const result: CheckpointRunResult = {
    runId,
    outcome: "REJECTED",
    commit,
    anchorRef: "",
    repositoryRoot: "",
    worktreePath,
    resultFile,
    exitCode: null,
    signal: null,
    checkpointStatus: null,
    checkpoint: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    durationMs: 0,
    worktreeCreated: false,
    cleanup: { removed: true },
  };
  const finish = (patch: Partial<CheckpointRunResult>): CheckpointRunResult =>
    Object.assign(result, patch);

  if (!COMMIT_SHA.test(commit)) {
    return finish({
      error: {
        code: "INVALID_COMMIT_SHA",
        message: "Expected a full 40-character lowercase commit SHA. Branches, tags, paths and flags are refused.",
      },
    });
  }

  // The anchor is a NAME resolved server-side, never the ambient HEAD, and a
  // supplied ref is only honoured inside the executor's run-branch namespace.
  // The type is checked before .trim() so a non-string can never throw: an
  // absent ref (undefined/null) means "use the default anchor", but a ref of
  // the wrong type is a contract violation and is refused, not silently
  // downgraded to the default. Downgrading would widen the trusted anchor set,
  // which is the one thing this check exists to prevent. Nothing is echoed.
  if (options.ref !== undefined && options.ref !== null && typeof options.ref !== "string") {
    return finish({
      error: {
        code: "INVALID_REF",
        message:
          "The anchor ref must be a string. Omit it to anchor on " + INTEGRATION_BRANCH +
          ", or pass a server-owned lcw/modernization/<uuid> branch name.",
      },
    });
  }
  const requestedRef = asText(options.ref).trim();
  if (requestedRef !== "" && !RUN_BRANCH.test(requestedRef)) {
    return finish({
      error: {
        code: "UNTRUSTED_REF",
        message:
          `Ref ${requestedRef} is not a server-owned modernization run branch. ` +
          `Only ${INTEGRATION_BRANCH} (by default) and lcw/modernization/<uuid> are trusted as anchors.`,
      },
    });
  }
  const anchorRef = requestedRef === "" ? INTEGRATION_BRANCH : requestedRef;
  result.anchorRef = anchorRef;

  let root: string;
  try {
    root = await resolveRepositoryRoot();
    result.repositoryRoot = root;
  } catch (err) {
    return finish({ error: { code: "REPO_ROOT_UNRESOLVED", message: (err as Error).message } });
  }

  try {
    await git(root, ["rev-parse", "--verify", `${commit}^{commit}`]);
  } catch {
    return finish({ error: { code: "COMMIT_NOT_FOUND", message: `Commit ${commit} does not exist in ${root}.` } });
  }

  // The anchor must exist. Resolving it by name also rules out a commit that
  // is merely reachable from some ref this server does not own.
  try {
    await git(root, ["rev-parse", "--verify", `refs/heads/${anchorRef}^{commit}`]);
  } catch {
    return finish({
      error: {
        code: "REF_NOT_FOUND",
        message: `Anchor ref ${anchorRef} does not exist in ${root}.`,
      },
    });
  }

  // Containment in the anchor, not descent from whatever happens to be checked
  // out. The engine re-checks this itself against the worktree HEAD; doing it
  // here first makes the reason unambiguous.
  try {
    await git(root, ["merge-base", "--is-ancestor", commit, `refs/heads/${anchorRef}`]);
  } catch {
    return finish({
      error: {
        code: "COMMIT_NOT_ANCESTOR",
        message:
          `Commit ${commit} is not contained in ${anchorRef} in ${root}. The engine refuses this too; ` +
          "it is checked first here so the reason is unambiguous.",
      },
    });
  }

  try {
    // Baseline subject: detached at the commit, so no branch ref is touched and
    // the run is identified by the SHA alone.
    // Modernization subject: attached to the run branch that holds it, so the
    // engine's `git revert` produces a persistent rollback commit on a
    // server-owned branch instead of one lost with a detached HEAD.
    await git(
      root,
      requestedRef === ""
        ? ["worktree", "add", "--detach", worktreePath, commit]
        // A branch NAME attaches; a full ref path would silently detach, which
        // would let the engine's `git revert` evaporate when the worktree goes.
        : ["worktree", "add", worktreePath, anchorRef],
      WORKTREE_TIMEOUT_MS,
    );
    result.worktreeCreated = true;
  } catch (err) {
    return finish({ error: { code: "WORKTREE_CREATE_FAILED", message: (err as Error).message } });
  }

  try {
    const realWorktree = fs.realpathSync(worktreePath);
    if (!isInside(realWorktree, fs.realpathSync(os.tmpdir()))) {
      return finish({
        error: {
          code: "WORKTREE_OUTSIDE_TMP",
          message: `Worktree resolved to ${realWorktree}, outside ${os.tmpdir()}. Refusing to run anything there.`,
        },
      });
    }

    const script = path.join(realWorktree, "tools", "checkpoint.js");
    if (!fs.existsSync(script)) {
      return finish({
        error: {
          code: "ENGINE_NOT_PRESENT",
          message:
            `${commit} does not contain tools/checkpoint.js, so no engine exists inside that worktree. ` +
            "The engine is never copied in: an engine from another commit would not be the engine under test. " +
            "Use a commit that descends from the commit that introduced the engine — a modernization run is " +
            "the current tip plus one approved step.",
        },
      });
    }

    fs.mkdirSync(path.dirname(resultFile), { recursive: true });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    const capture = (into: string, chunk: Buffer): { text: string; truncated: boolean } => {
      const next = into + chunk.toString();
      return next.length > MAX_CAPTURE_BYTES
        ? { text: next.slice(next.length - MAX_CAPTURE_BYTES), truncated: true }
        : { text: next, truncated: false };
    };

    let timedOut = false;
    let spawnError: Error | null = null;
    const closed = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      const child = spawn(
        process.execPath,
        [script, commit, "--result-file", resultFile],
        { cwd: realWorktree, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      child.stdout.on("data", (c: Buffer) => {
        const next = capture(stdout, c);
        stdout = next.text;
        stdoutTruncated = next.truncated;
      });
      child.stderr.on("data", (c: Buffer) => {
        const next = capture(stderr, c);
        stderr = next.text;
        stderrTruncated = next.truncated;
      });
      child.on("error", (err) => {
        spawnError = err;
        resolve({ code: null, signal: null });
      });
      const timer = setTimeout(() => {
        timedOut = true;
        killChildTree(child.pid);
      }, timeoutMs);
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal: signal ?? null });
      });
    });

    const child = {
      exitCode: closed.code,
      signal: closed.signal,
      stdout,
      stderr,
      stdoutTruncated,
      stderrTruncated,
    };

    if (spawnError) {
      return finish({ ...child, outcome: "FAILED", error: { code: "SPAWN_FAILED", message: (spawnError as Error).message } });
    }
    if (timedOut) {
      return finish({
        ...child,
        outcome: "FAILED",
        error: {
          code: "TIMEOUT",
          message: `checkpoint.js did not finish within ${timeoutMs}ms and its process tree was killed.`,
        },
      });
    }

    // The engine's own result file is the only authority. No status is inferred
    // from the exit code: the engine's contract is the file, not the code.
    if (!fs.existsSync(resultFile)) {
      return finish({
        ...child,
        outcome: "FAILED",
        error: {
          code: "NO_RESULT_FILE",
          message: `checkpoint.js exited with code ${closed.code} but wrote no result file at ${resultFile}.`,
        },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(resultFile, "utf8"));
    } catch (err) {
      return finish({
        ...child,
        outcome: "FAILED",
        error: { code: "MALFORMED_RESULT", message: `Could not parse ${resultFile}: ${(err as Error).message}` },
      });
    }
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { status?: unknown }).status !== "string") {
      return finish({
        ...child,
        outcome: "FAILED",
        error: { code: "MALFORMED_RESULT", message: `${resultFile} has no string "status" field.` },
      });
    }

    return finish({
      ...child,
      outcome: "COMPLETED",
      checkpointStatus: (parsed as { status: string }).status,
      checkpoint: parsed as CheckpointResultFile,
    });
  } finally {
    result.cleanup = await removeWorktree(root, worktreePath);
    result.durationMs = Date.now() - startedAt;
  }
}

export default runCheckpoint;
