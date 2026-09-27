// ─────────────────────────────────────────────────────────────────────────────
//  Modernization executor — M3.2
//
//  Applies ONE allowlisted operation (M3.1) inside a throwaway worktree and
//  leaves behind exactly one thing: a real commit on a server-owned run branch.
//
//  What the caller controls: a run id it generated and an operation id it
//  looked up in the catalogue. Nothing else. The file, the source text, the
//  replacement text, the branch name and the commit message all come from the
//  server side; there is no parameter anywhere below that accepts replacement
//  text, a path, a patch or a git command, and no shell is ever involved —
//  every git call is execFile with an argv array and shell: false.
//
//  Why a worktree, and why a branch rather than a detached commit:
//
//  A worktree keeps the legacy app, the root package.json and the
//  characterization suite out of the main working tree, so applying an
//  operation cannot disturb the checkout a developer or a teammate is using.
//  The commit itself has to live on a *named* branch, because the milestone
//  after this one verifies it and the one after that rolls it back with
//  `git revert` (tools/rollback.js). A detached commit would be collected as
//  unreachable the moment its worktree is pruned; a branch survives on purpose,
//  so the verify worktree can be attached to it and so a revert has somewhere
//  durable to land. That is the whole reason the branch is preserved rather
//  than deleted in the finally block.
//
//  Branch naming: lcw/modernization/<runId>, where runId is a UUID the server
//  generated. The UUID is validated before it is used, so it cannot carry a
//  path separator, a flag or a shell metacharacter into a branch name.
//
//  Base: the server-resolved tip of the primary branch. main is never checked
//  out, moved, reset or committed to by anything here; the executor only reads it.
//
//  All-or-nothing: the whole operation is planned in memory first
//  (planOperation, M3.1) and refused if any edit cannot be applied exactly
//  once. Only a fully-planned operation is written. After writing, the
//  executor re-checks every post-condition it depends on before it commits:
//  the old bytes are gone, the new bytes are present, each edited file still
//  parses, and `git status` lists exactly the declared files and nothing else.
//  Any of those failing means no commit, and the worktree is removed.
//
//  The 18-test suite is NOT run here. tools/checkpoint.js already runs it
//  against a worktree of the commit under test; running it again before the
//  commit would duplicate that engine rather than reuse it. What this file
//  checks before committing is the cheap, deterministic part: the transformed
//  files are still valid JavaScript / valid JSON.
// ─────────────────────────────────────────────────────────────────────────────

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { getOperation, planOperation, ModernizationOperation } from "./operations";

const execFileAsync = promisify(execFile);

/**
 * The branch a modernization run is based on. Read-only for this module: it is
 * resolved to a commit and used as a base, never checked out or moved.
 */
export const BASE_BRANCH = "main";

/** One definition of a run id, shared with the checkpoint runner. */
const RUN_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The only caller-supplied value that reaches a git argument list. */
const UUID = new RegExp(`^${RUN_ID}$`, "i");

const BRANCH_PREFIX = "lcw/modernization/";

/**
 * The only ref namespace the executor creates, and therefore the only run ref
 * the checkpoint runner will anchor against or attach a worktree to. Exported
 * so there is one definition of it: a modernization commit and the branch that
 * holds it must never be recognised by two different patterns.
 */
export const RUN_BRANCH = new RegExp(`^${BRANCH_PREFIX}${RUN_ID}$`, "i");

const GIT_TIMEOUT_MS = 5 * 60 * 1000;
const SYNTAX_TIMEOUT_MS = 30_000;

export type ExecutionStatus = "completed" | "refused" | "failed";

export type ExecutionCode =
  | "INVALID_RUN_ID"
  | "UNKNOWN_OPERATION"
  | "REPO_ROOT_UNRESOLVED"
  | "BASE_UNRESOLVED"
  | "WORKTREE_OUTSIDE_TMP"
  | "WORKTREE_CREATE_FAILED"
  | "OPERATION_NOT_APPLICABLE"
  | "OPERATION_NO_EFFECT"
  | "WRITE_FAILED"
  | "POST_APPLY_CHECK_FAILED"
  | "UNEXPECTED_WORKTREE_CHANGES"
  | "COMMIT_FAILED";

export interface ModernizationExecutionResult {
  runId: string;
  /** The catalogue id that was asked for, echoed even when refused. */
  operationId: string;
  operationKind: ModernizationOperation["kind"] | null;
  status: ExecutionStatus;
  code?: ExecutionCode;
  /** Server-side detail. Never contains a resolved absolute path. */
  message?: string;
  /** HEAD of the execute worktree before anything was applied. */
  startingCommit: string | null;
  /** The commit this executor created. */
  modernizationCommit: string | null;
  /** The resolved primary-branch tip the run branch was based on. */
  baseCommit: string | null;
  /** lcw/modernization/<runId>, left in place for the verify/rollback stages. */
  branch: string | null;
  changedFiles: string[];
  commitMessage: string | null;
  worktreePath: string;
  /** false here means a worktree may still exist and must be inspected. */
  cleanup: { removed: boolean; warning?: string; branchRemoved?: boolean };
  durationMs: number;
}

export interface ExecuteModernizationOptions {
  /** A server-generated UUID. Anything else is refused. */
  runId: string;
  /** A catalogue id. The file and the bytes come from the catalogue. */
  operationId: string;
}

export interface ExecuteOperationOptions {
  timeoutMs?: number;
}

// ponytail: git()/isInside() are a dozen lines each and now exist in both this
// file and checkpointRunner.ts. Sharing them means a new module; duplicating
// them is smaller. A previous note here said "extract in M3.3" — M3.3 landed
// without the extraction, so the duplication is now simply the chosen shape.
function isInside(candidate: string, parent: string): boolean {
  const rel = path.relative(parent, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function git(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Untrimmed stdout, for output whose leading whitespace is data. `git status
 * --porcelain` marks a worktree-modified file with a leading " M", and trim()
 * would eat that column and shift every path by one character.
 */
async function gitRaw(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

function reason(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return (e.stderr ?? "").trim() || (e.message ?? String(err)).trim();
}

/** Join a catalogue-relative path under root, or refuse. Defence in depth:
 *  planOperation already validated these paths; this keeps that guarantee local
 *  to the code that writes. */
function safeJoin(root: string, relative: string): string | null {
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative) || relative.includes("\0")) {
    return null;
  }
  const full = path.resolve(root, relative);
  return isInside(full, path.resolve(root)) ? full : null;
}

/** The primary-branch tip, preferring the local branch and falling back to the
 *  remote-tracking ref so a fresh clone still works. Read-only. */
async function resolveBaseCommit(root: string): Promise<string> {
  for (const ref of [BASE_BRANCH, `origin/${BASE_BRANCH}`]) {
    try {
      return await git(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
    } catch {
      /* try the next ref */
    }
  }
  throw new Error(`cannot resolve ${BASE_BRANCH}`);
}

async function removeWorktree(root: string, worktreePath: string): Promise<ModernizationExecutionResult["cleanup"]> {
  try {
    await git(root, ["worktree", "remove", worktreePath]);
    await git(root, ["worktree", "prune"]).catch(() => undefined);
    return { removed: true };
  } catch (first) {
    // A failed pre-commit check can leave the worktree dirty. --force drops the
    // copy; the refusal is already in the result, and a failure to remove is
    // reported rather than hidden.
    try {
      await git(root, ["worktree", "remove", "--force", worktreePath]);
      await git(root, ["worktree", "prune"]).catch(() => undefined);
      return { removed: true, warning: `execute worktree needed --force: ${reason(first)}` };
    } catch (second) {
      return {
        removed: false,
        warning: `execute worktree NOT removed, remove it manually from ${worktreePath}: ${reason(second)}`,
      };
    }
  }
}

/**
 * Delete a run branch that this execution created, after a refusal.
 *
 * `git branch -d` only, never -D, and that is the safety property rather than a
 * limitation: a branch that somehow carries an unmerged commit is then left in
 * place and reported, never destroyed. On every refusal path no commit was
 * made, so the branch still points at the base and the safe delete succeeds.
 * If a run ever failed *after* committing, this is what stops the cleanup from
 * eating the commit the verify stage needs.
 */
async function removeRunBranch(
  root: string,
  branch: string,
): Promise<{ removed: boolean; warning?: string }> {
  try {
    await git(root, ["branch", "-d", branch]);
    return { removed: true };
  } catch (err) {
    return {
      removed: false,
      warning: `run branch ${branch} NOT removed; it is not safely deletable and was left in place: ${reason(err)}`,
    };
  }
}

/** Post-apply pre-commit checks. All of them must pass or there is no commit. */
async function verifyApplied(
  worktreePath: string,
  operation: ModernizationOperation,
  declared: string[],
): Promise<string | null> {
  for (const edit of operation.edits) {
    const full = safeJoin(worktreePath, edit.file);
    if (full === null) return `${edit.file} does not resolve inside the worktree`;
    const after = fs.readFileSync(full, "utf8");
    if (after.includes(edit.exactSource)) return `${edit.file} still contains the original bytes`;
    if (!after.includes(edit.exactReplacement)) return `${edit.file} does not contain the replacement`;

    // Deterministic, offline syntax check of the transformed file. The full
    // 18-test suite belongs to tools/checkpoint.js, which runs it against the
    // committed result.
    try {
      if (full.endsWith(".json")) {
        JSON.parse(after);
      } else if (full.endsWith(".js")) {
        await execFileAsync(process.execPath, ["--check", full], {
          encoding: "utf8",
          timeout: SYNTAX_TIMEOUT_MS,
          windowsHide: true,
        });
      }
    } catch (err) {
      return `${edit.file} no longer parses: ${reason(err)}`;
    }
  }

  // The worktree must contain the declared edits and nothing else, so the commit
  // cannot sweep up an unrelated file. A declared file that did not change is
  // caught here as "not touched".
  const status = await gitRaw(worktreePath, ["status", "--porcelain", "--untracked-files=all"]);
  const touched = status.split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/"/g, ""));
  const unexpected = touched.filter((f) => !declared.includes(f));
  if (unexpected.length > 0) {
    return `worktree contains changes outside the operation: ${unexpected.join(", ")}`;
  }
  const missing = declared.filter((f) => !touched.includes(f));
  if (missing.length > 0) {
    return `operation declared files that were not changed: ${missing.join(", ")}`;
  }
  return null;
}

/**
 * M3.2's lower level: apply a given operation object in a fresh worktree.
 * Exported so the M3.2 tests can drive the refusal paths with a synthetic
 * operation; the id-based entry point below is what an HTTP layer must call,
 * because it is the only one that resolves a catalogue value.
 */
export async function executeOperationInWorktree(
  root: string,
  operation: ModernizationOperation,
  runId: string,
  options: ExecuteOperationOptions = {},
): Promise<ModernizationExecutionResult> {
  const startedAt = Date.now();
  const worktreePath = path.join(os.tmpdir(), `lcw-exec-${uuidv4()}`);
  const result: ModernizationExecutionResult = {
    runId,
    operationId: operation.id,
    operationKind: operation.kind,
    status: "refused",
    startingCommit: null,
    modernizationCommit: null,
    baseCommit: null,
    branch: null,
    changedFiles: [],
    commitMessage: null,
    worktreePath,
    cleanup: { removed: true },
    durationMs: 0,
  };
  // One object, returned either way, so the finally block can attach cleanup and
  // duration to exactly what the caller receives.
  const refuse = (code: ExecutionCode, message: string) => {
    result.status = "refused";
    result.code = code;
    result.message = message;
    return result;
  };

  if (!UUID.test(runId)) {
    return refuse("INVALID_RUN_ID", "runId must be a server-generated UUID");
  }
  const branch = `${BRANCH_PREFIX}${runId}`;
  result.branch = branch;
  result.commitMessage = operation.commitMessage;

  let baseCommit: string;
  try {
    baseCommit = await resolveBaseCommit(root);
  } catch (err) {
    return refuse("BASE_UNRESOLVED", reason(err));
  }
  result.baseCommit = baseCommit;

  const branchExists = await git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], 30_000)
    .then(() => true)
    .catch(() => false);
  // Only a branch this execution creates may be cleaned up later. A branch that
  // already existed belongs to an earlier run and is never removed, however
  // similar its name.
  const createdBranch = !branchExists;

  try {
    // -b creates the run branch at the primary tip; without -b an existing
    // run branch is reused. Either way the checkout is the only writable copy.
    await git(root, [
      "worktree",
      "add",
      ...(branchExists ? [] : ["-b", branch]),
      worktreePath,
      branchExists ? branch : baseCommit,
    ]);
  } catch (err) {
    // git creates the branch before the worktree, so a failed add can still
    // leave the ref behind. Undo it here, where the finally block is not yet
    // in scope.
    if (createdBranch) {
      const branchCleanup = await removeRunBranch(root, branch);
      result.cleanup.branchRemoved = branchCleanup.removed;
      if (branchCleanup.warning) result.cleanup.warning = branchCleanup.warning;
    }
    return refuse("WORKTREE_CREATE_FAILED", reason(err));
  }

  try {
    const tmp = await fs.promises.realpath(os.tmpdir());
    const real = await fs.promises.realpath(worktreePath);
    if (!isInside(real, tmp)) {
      return refuse("WORKTREE_OUTSIDE_TMP", "execute worktree resolved outside the temp directory");
    }

    // HEAD of the fresh worktree, before anything is applied.
    result.startingCommit = await git(worktreePath, ["rev-parse", "HEAD"]);

    // Plan the whole operation first. A refusal here has written nothing.
    const plan = planOperation(worktreePath, operation);
    if (!plan.ok) {
      return refuse("OPERATION_NOT_APPLICABLE", `${plan.code} in ${plan.file} (${plan.occurrences} occurrences)`);
    }
    result.changedFiles = plan.files.map((f) => f.file);
    if (plan.files.every((f) => f.after === f.before)) {
      return refuse("OPERATION_NO_EFFECT", "every declared file would be unchanged");
    }

    // Write. Each file is written only after the whole plan succeeded.
    for (const file of plan.files) {
      const full = safeJoin(worktreePath, file.file);
      if (full === null) {
        return refuse("WRITE_FAILED", `${file.file} does not resolve inside the worktree`);
      }
      try {
        fs.writeFileSync(full, file.after, "utf8");
      } catch (err) {
        return refuse("WRITE_FAILED", reason(err));
      }
    }

    const problem = await verifyApplied(worktreePath, operation, result.changedFiles);
    if (problem !== null) {
      return refuse("POST_APPLY_CHECK_FAILED", problem);
    }

    // Stage and commit exactly the declared files. Nothing else is added.
    try {
      await git(worktreePath, ["add", "--", ...result.changedFiles]);
      await git(worktreePath, ["commit", "-m", operation.commitMessage]);
    } catch (err) {
      return refuse("COMMIT_FAILED", reason(err));
    }

    result.modernizationCommit = await git(worktreePath, ["rev-parse", "HEAD"]);
    result.status = "completed";
    return result;
  } catch (err) {
    result.status = "failed";
    result.code = "COMMIT_FAILED";
    result.message = reason(err);
    return result;
  } finally {
    result.cleanup = await removeWorktree(root, worktreePath);
    // A successful run KEEPS its branch: the verify and rollback stages attach
    // to it. A refused or failed run keeps nothing, so the branch this run
    // created is removed — otherwise every refusal leaves a permanent ref at the
    // base commit and `git branch` fills with debris.
    if (createdBranch && result.status !== "completed") {
      const branchCleanup = await removeRunBranch(root, branch);
      result.cleanup.branchRemoved = branchCleanup.removed;
      if (branchCleanup.warning) {
        result.cleanup.warning = result.cleanup.warning
          ? `${result.cleanup.warning}; ${branchCleanup.warning}`
          : branchCleanup.warning;
      }
    }
    result.durationMs = Date.now() - startedAt;
  }
}

/**
 * The id-based entry point, and the only one an HTTP layer should call: the
 * caller supplies an id, the operation is looked up in the allowlist, and
 * nothing about the edit travels over the wire.
 */
export async function executeModernization(
  options: ExecuteModernizationOptions & ExecuteOperationOptions,
): Promise<ModernizationExecutionResult> {
  const operation = getOperation(options.operationId);
  if (!operation) {
    const startedAt = Date.now();
    return {
      runId: options.runId,
      operationId: options.operationId,
      operationKind: null,
      status: "refused",
      code: "UNKNOWN_OPERATION",
      message: "no such operation in the allowlist",
      startingCommit: null,
      modernizationCommit: null,
      baseCommit: null,
      branch: null,
      changedFiles: [],
      commitMessage: null,
      worktreePath: "",
      cleanup: { removed: true },
      durationMs: Date.now() - startedAt,
    };
  }

  let root: string;
  try {
    root = await resolveRepositoryRoot();
  } catch (err) {
    const startedAt = Date.now();
    return {
      runId: options.runId,
      operationId: options.operationId,
      operationKind: operation.kind,
      status: "failed",
      code: "REPO_ROOT_UNRESOLVED",
      message: reason(err),
      startingCommit: null,
      modernizationCommit: null,
      baseCommit: null,
      branch: null,
      changedFiles: [],
      commitMessage: operation.commitMessage,
      worktreePath: "",
      cleanup: { removed: true },
      durationMs: Date.now() - startedAt,
    };
  }
  return executeOperationInWorktree(root, operation, options.runId, options);
}

/** The repository root, resolved server-side, for callers that need to pass it
 *  to executeOperationInWorktree. */
export async function resolveRepositoryRoot(): Promise<string> {
  return git(__dirname, ["rev-parse", "--show-toplevel"]);
}
