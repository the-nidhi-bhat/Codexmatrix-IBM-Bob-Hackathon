"use strict";

/**
 * Finding 3: a refused or failed executor run must leave nothing behind.
 *
 * Before M3.3 the executor created the run branch with `git worktree add -b`
 * BEFORE planning, and its `finally` removed only the worktree. Every refusal —
 * a missing source, an ambiguous source, a protected path, a no-op operation, a
 * failed post-apply check — therefore left a permanent ref sitting at the base
 * commit. The M3.3 audit counted roughly 77 such branches in this repository.
 *
 * The fix tracks whether THIS execution created the branch, and removes it on
 * any non-completed outcome using `git branch -d` and nothing else.
 *
 * Every test in this file is self-cleaning, and that is deliberate: a cleanup
 * test that leaves debris is the same bug it is testing for. The branch that a
 * SUCCESSFUL run leaves behind — the one the verify and rollback stages attach
 * to — is asserted in checkpoint-flow.test.js, which is the only file that
 * needs one.
 *
 * Run with `--test-concurrency=1`; these tests mutate real git state.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { INTEGRATION_BRANCH, executeOperationInWorktree } = require("../dist/modernization/executor");
const {
  REPO_ROOT,
  branchExists,
  git,
  gitAttempt,
  isRegisteredWorktree,
  repoStateSnapshot,
  shaOf,
} = require("./helpers");

/** Base assertions every refusal that follows branch creation must satisfy. */
function assertRefusedAndClean(result, code, branch) {
  assert.equal(result.status, "refused", `expected a refusal, got ${JSON.stringify(result)}`);
  assert.equal(result.code, code);
  assert.equal(result.modernizationCommit, null, "a refusal must never commit");

  // The worktree is gone. `removed: false` here would be a real leak.
  assert.equal(result.cleanup.removed, true, `worktree leaked: ${result.cleanup.warning || ""}`);
  assert.equal(isRegisteredWorktree(result.worktreePath), false, "git still has the worktree registered");
  assert.equal(fs.existsSync(result.worktreePath), false, "the worktree directory still exists");

  // And the branch this run created is gone.
  assert.equal(result.cleanup.branchRemoved, true, `branch ${branch} leaked`);
  assert.equal(branchExists(branch), false, `branch ${branch} still exists`);
}

/** A catalogue-shaped operation aimed at `file`. */
function operationTargeting(file, exactSource, exactReplacement) {
  return {
    id: "test-probe",
    title: "test probe",
    description: "synthetic operation used by the M3.3 lifecycle tests",
    kind: "modernization",
    finding: "TEST",
    reference: "backend/test/executor-lifecycle.test.js",
    risk: "low",
    impact: "none",
    commitMessage: "test: must not be committed",
    edits: [{ file, exactSource, exactReplacement }],
  };
}

/**
 * An operation that plans successfully but changes nothing: its replacement is
 * a slice of the file's own current content, so the exact-match contract is
 * satisfied and the plan is a no-op. The executor refuses it as
 * OPERATION_NO_EFFECT, which is a refusal AFTER the branch was created — the
 * exact shape Finding 3 is about.
 */
function noEffectOperation() {
  const onDisk = fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8");
  const slice = onDisk.slice(0, 64);
  return operationTargeting("package.json", slice, slice);
}

test("a refusal after branch creation removes the branch and the worktree", async (t) => {
  const cases = {
    // planOperation's own refusal is surfaced by the executor as
    // OPERATION_NOT_APPLICABLE with the specific code in the message, so the
    // message is asserted too — that is where PROTECTED_PATH is visible.
    "protected path": {
      operation: operationTargeting("tools/checkpoint.js", "#!/usr/bin/env node\n", "#!/usr/bin/env node\n// x\n"),
      code: "OPERATION_NOT_APPLICABLE",
      messageIncludes: "PROTECTED_PATH",
    },
    "source not found": {
      operation: operationTargeting("package.json", "this-string-is-not-in-the-file-000000", "x"),
      code: "OPERATION_NOT_APPLICABLE",
      messageIncludes: "SOURCE_NOT_FOUND",
    },
    "no effect": {
      operation: noEffectOperation(),
      code: "OPERATION_NO_EFFECT",
      messageIncludes: "unchanged",
    },
  };

  for (const [label, spec] of Object.entries(cases)) {
    await t.test(label, async () => {
      const runId = randomUUID();
      const branch = `lcw/modernization/${runId}`;
      const before = repoStateSnapshot();

      const result = await executeOperationInWorktree(REPO_ROOT, spec.operation, runId);

      assertRefusedAndClean(result, spec.code, branch);
      assert.ok(
        result.message.includes(spec.messageIncludes),
        `message must name ${spec.messageIncludes}: ${result.message}`,
      );
      // The refused path is reported as the catalogue wrote it, never resolved.
      assert.equal(result.message.includes(REPO_ROOT), false, "no resolved path in the message");

      const after = repoStateSnapshot();
      assert.deepEqual(after.worktrees, before.worktrees, "no worktree may be registered");
      assert.deepEqual(after.lcwBranches, before.lcwBranches, "no branch may survive a refusal");
    });
  }
});

test("a duplicate-target operation is refused and still cleans up", async () => {
  const onDisk = fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8");
  const runId = randomUUID();
  const branch = `lcw/modernization/${runId}`;
  const before = repoStateSnapshot();

  const duplicate = {
    ...noEffectOperation(),
    edits: [
      { file: "package.json", exactSource: onDisk.slice(0, 40), exactReplacement: "x" },
      { file: "package.json", exactSource: onDisk.slice(40, 80), exactReplacement: "y" },
    ],
  };
  const result = await executeOperationInWorktree(REPO_ROOT, duplicate, runId);

  assertRefusedAndClean(result, "OPERATION_NOT_APPLICABLE", branch);
  assert.ok(result.message.includes("DUPLICATE_TARGET_FILE"), result.message);
  assert.deepEqual(repoStateSnapshot().lcwBranches, before.lcwBranches);
});

test("repeated refusals do not accumulate branches or worktrees", async () => {
  // The audit's central observation: debris grows by one branch per refusal.
  // Three refusals must leave the repository exactly as they found it.
  const before = repoStateSnapshot();
  for (let i = 0; i < 3; i += 1) {
    const result = await executeOperationInWorktree(REPO_ROOT, noEffectOperation(), randomUUID());
    assert.equal(result.status, "refused");
    assert.equal(result.code, "OPERATION_NO_EFFECT");
    assert.equal(result.cleanup.branchRemoved, true);
  }
  const after = repoStateSnapshot();
  assert.deepEqual(after.worktrees, before.worktrees, "worktrees leaked");
  assert.deepEqual(after.branches, before.branches, "branches leaked");
});

test("a branch that already existed is never removed, even on a refusal", async () => {
  // The `createdBranch` guard. This branch is created HERE with no commits of
  // its own, so it is fully merged as far as git is concerned and `git branch
  // -d` can remove it afterwards: the test cleans up after itself and proves
  // the executor did not need, and did not use, a force delete.
  const runId = randomUUID();
  const branch = `lcw/modernization/${runId}`;
  const base = shaOf(INTEGRATION_BRANCH);
  git(["branch", branch, base]);
  assert.equal(branchExists(branch), true, "precondition: the branch exists");

  try {
    const result = await executeOperationInWorktree(REPO_ROOT, noEffectOperation(), runId);

    assert.equal(result.status, "refused");
    assert.equal(result.code, "OPERATION_NO_EFFECT");
    assert.equal(result.cleanup.removed, true, "the worktree must still be removed");
    assert.equal(result.cleanup.branchRemoved, undefined, "cleanup must not even have been attempted");

    assert.equal(branchExists(branch), true, "a pre-existing branch was deleted");
    assert.equal(shaOf(branch), base, "a pre-existing branch was moved");
  } finally {
    const deleted = gitAttempt(["branch", "-d", branch]);
    assert.equal(deleted.ok, true, `test cleanup failed: ${deleted.stderr}`);
  }
  assert.equal(branchExists(branch), false);
});

test("a failed worktree add cleans up the branch git had already created", async () => {
  // `git worktree add -b` creates the ref BEFORE the worktree, so a failure
  // there is the one leak the `finally` block cannot see: the run returns from
  // the catch before the try/finally is entered. This path is reached here by
  // pointing os.tmpdir() at a regular file, so the worktree path the executor
  // builds cannot be created. No production code is changed to do it.
  const runId = randomUUID();
  const branch = `lcw/modernization/${runId}`;
  const blocker = path.join(os.tmpdir(), `lcw-test-not-a-directory-${runId}`);
  fs.writeFileSync(blocker, "this is a file, not a directory\n", "utf8");

  const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
  process.env.TEMP = blocker;
  process.env.TMP = blocker;
  process.env.TMPDIR = blocker;

  let result;
  try {
    assert.equal(os.tmpdir(), blocker, "precondition: the executor will build a path under a file");
    result = await executeOperationInWorktree(REPO_ROOT, noEffectOperation(), runId);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(blocker, { force: true });
  }

  assert.equal(result.status, "refused", JSON.stringify(result));
  assert.equal(result.code, "WORKTREE_CREATE_FAILED");
  assert.equal(result.worktreePath.startsWith(blocker), true, "precondition: the worktree path was under the file");
  // The catch path is the point: cleanup.branchRemoved is set there, not in a
  // finally, and the ref git created is gone anyway.
  assert.equal(result.cleanup.branchRemoved, true, `branch ${branch} leaked`);
  assert.equal(branchExists(branch), false, `branch ${branch} still exists`);
  assert.equal(gitAttempt(["worktree", "prune"]).ok, true, "no worktree registration may survive");
});

test("the branch is created at the integration tip, never from ambient HEAD", async () => {
  // `resolveBaseCommit` is what makes a run reproducible: a run made while some
  // other branch is checked out must still be based on integration/final. The
  // base is also asserted on the success path in checkpoint-flow.test.js; this
  // states it where the refusal path cannot hide a regression behind a commit.
  const runId = randomUUID();
  const branch = `lcw/modernization/${runId}`;
  const result = await executeOperationInWorktree(REPO_ROOT, noEffectOperation(), runId);

  assert.equal(result.baseCommit, shaOf(INTEGRATION_BRANCH));
  assert.equal(result.startingCommit, shaOf(INTEGRATION_BRANCH));
  assert.equal(branchExists(branch), false, "the refused run's branch must be gone");

  // And the refusal happened after the base was resolved, which is what makes
  // this the post-branch-creation case rather than an early exit.
  assert.equal(result.worktreePath.startsWith(os.tmpdir()), true, "a worktree was assigned");
  assert.notEqual(result.baseCommit, null);
});
