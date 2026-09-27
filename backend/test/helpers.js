"use strict";

/**
 * Shared helpers for the M3.3 permanent production tests.
 *
 * These tests drive the real compiled modules in `../dist`, against the real
 * repository. Nothing here mocks git, the executor, or the checkpoint engine:
 * the whole point is that the behaviour under test is the production behaviour,
 * so `runCheckpoint` really spawns `git worktree add` and really spawns the
 * Node 6 container, and `executeOperationInWorktree` really writes files and
 * really commits them.
 *
 * Because these tests mutate real git state (branches, worktrees) in the real
 * repository, the suite runs with `--test-concurrency=1`. See the `test` script
 * in package.json.
 *
 * Run with Node's built-in test runner: `node --test test/`.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const PATH_RESOLVE_ROOT = path.resolve(BACKEND_ROOT, "..");

/**
 * The repository root as GIT reports it, not as path.resolve spells it.
 *
 * The production code resolves its root with `git rev-parse --show-toplevel`,
 * which answers in forward slashes on Windows. A test that compared that
 * against a path.resolve result would fail on separators alone, so tests
 * compare against this value, and use normalizeFsPath for anything that comes
 * back from the filesystem side.
 */
const REPO_ROOT = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: BACKEND_ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return PATH_RESOLVE_ROOT;
  }
})();

/**
 * One spelling of one path: absolute, forward slashes, lower case.
 *
 * Needed because two sources describe the same directory differently — git
 * prints `C:/Users/x`, path.resolve produces `C:\Users\x`, and Windows treats
 * the two as equal while `===` does not.
 */
function normalizeFsPath(candidate) {
  return path.resolve(candidate).replace(/\\/g, "/").toLowerCase();
}

/** Run git and return trimmed stdout. Throws on a non-zero exit. */
function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  }).trim();
}

/**
 * Run git without throwing. Used wherever the test is asserting a REFUSAL, so
 * a failure is a result to inspect rather than an exception to catch.
 */
function gitAttempt(args, options = {}) {
  try {
    const stdout = execFileSync("git", args, {
      cwd: options.cwd || REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, status: 0, stdout: stdout.trim(), stderr: "" };
  } catch (err) {
    return {
      ok: false,
      status: err.status === undefined ? -1 : err.status,
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
    };
  }
}

/** Full 40-character SHA of a ref's commit, or null if it does not resolve. */
function shaOf(ref) {
  const attempt = gitAttempt(["rev-parse", "--verify", `${ref}^{commit}`]);
  return attempt.ok ? attempt.stdout : null;
}

function branchExists(name) {
  return gitAttempt(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]).ok;
}

/** Every local branch name. */
function localBranches() {
  return git(["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function branchesMatching(pattern) {
  return localBranches().filter((name) => pattern.test(name));
}

/** Worktree paths currently registered, from git's own state. */
function registeredWorktrees() {
  return git(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim());
}

/** Is this path a worktree git currently has registered? */
function isRegisteredWorktree(candidate) {
  return registeredWorktrees().some((entry) => normalizeFsPath(entry) === normalizeFsPath(candidate));
}

/**
 * `git worktree list --porcelain` for a worktree path, as one object. Lets a
 * test assert the runner's worktree really existed and really was attached to
 * the anchor branch while the run was in flight, instead of trusting a success
 * flag.
 */
function worktreeInfo(candidate) {
  const wanted = normalizeFsPath(candidate);
  for (const block of git(["worktree", "list", "--porcelain"]).split("\n\n")) {
    const lines = block.split("\n").filter(Boolean);
    if (lines[0] && normalizeFsPath(lines[0].slice("worktree ".length).trim()) === wanted) {
      return {
        path: lines[0].slice("worktree ".length).trim(),
        head: (lines.find((l) => l.startsWith("HEAD ")) || "").slice(5).trim(),
        detached: lines.includes("detached"),
        branch: (lines.find((l) => l.startsWith("branch ")) || "").slice(7).trim(),
        locked: lines.some((l) => l.startsWith("locked")),
      };
    }
  }
  return null;
}

function isAncestor(candidate, of) {
  return gitAttempt(["merge-base", "--is-ancestor", candidate, of]).ok;
}

/** Does Docker work here? Gates the slow container tests instead of failing them. */
function dockerAvailable() {
  const attempt = (() => {
    try {
      execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err.message || String(err)).split("\n")[0] };
    }
  })();
  return attempt;
}

/** Read a JSON file, or return null. */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Snapshot of every worktree path and every `lcw/` branch, so a test can prove
 * afterwards that it leaked nothing and deleted nothing it did not create.
 */
function repoStateSnapshot() {
  return {
    worktrees: registeredWorktrees().sort(),
    branches: localBranches().sort(),
    lcwBranches: branchesMatching(/^lcw\//).sort(),
  };
}

/** Which entries of `before` are missing from the current state? */
function removedSince(before) {
  const now = new Set(repoStateSnapshot().lcwBranches);
  return before.filter((name) => !now.has(name));
}

/** Human-readable diff of a snapshot, for assertion messages. */
function describeStateDiff(before, after) {
  const gone = before.filter((name) => !after.includes(name));
  const added = after.filter((name) => !before.includes(name));
  return `removed: [${gone.join(", ")}] added: [${added.join(", ")}]`;
}

/**
 * Every worktree git currently has, as objects. Let a test watch the runner's
 * disposable worktree while it exists and observe what it really was: attached
 * to a branch or detached, and at which HEAD. Trusting a `worktreeCreated: true`
 * flag would not prove the worktree was ATTACHED, which is the entire point of
 * the M3.3 anchor change.
 */
function allWorktrees() {
  return git(["worktree", "list", "--porcelain"])
    .split("\n\n")
    .map((block) => block.split("\n").filter(Boolean))
    .filter((lines) => lines.length > 0 && lines[0].startsWith("worktree "))
    .map((lines) => ({
      path: lines[0].slice("worktree ".length).trim(),
      head: (lines.find((l) => l.startsWith("HEAD ")) || "").slice(5).trim(),
      detached: lines.includes("detached"),
      branch: (lines.find((l) => l.startsWith("branch ")) || "").slice(7).trim(),
      locked: lines.some((l) => l.startsWith("locked")),
    }));
}

/** The runner's and executor's worktrees live under the temp directory. */
function isUnderTmp(candidate) {
  const rel = path.relative(os.tmpdir(), candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Poll git for the temp-directory worktrees until the run settles. */
function watchTmpWorktrees(intervalMs = 150) {
  const seen = new Map();
  const timer = setInterval(() => {
    let current;
    try {
      current = allWorktrees().filter((w) => isUnderTmp(w.path));
    } catch {
      return; // a concurrent git index lock is not worth failing the test over
    }
    for (const worktree of current) {
      const key = normalizeFsPath(worktree.path);
      const previous = seen.get(key);
      // Keep every distinct (head, detached, branch) the worktree ever had, so
      // a test can prove the HEAD moved and the attachment never changed.
      if (!previous) seen.set(key, { ...worktree, observations: [worktree] });
      else if (
        !previous.observations.some(
          (o) => o.head === worktree.head && o.detached === worktree.detached && o.branch === worktree.branch,
        )
      ) {
        previous.observations.push(worktree);
        Object.assign(previous, worktree);
      }
    }
  }, intervalMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      return [...seen.values()];
    },
  };
}

module.exports = {
  BACKEND_ROOT,
  REPO_ROOT,
  allWorktrees,
  branchesMatching,
  branchExists,
  describeStateDiff,
  dockerAvailable,
  git,
  gitAttempt,
  isAncestor,
  isRegisteredWorktree,
  isUnderTmp,
  localBranches,
  normalizeFsPath,
  readJson,
  registeredWorktrees,
  removedSince,
  repoStateSnapshot,
  shaOf,
  watchTmpWorktrees,
  worktreeInfo,
  os,
  path,
  fs,
};
