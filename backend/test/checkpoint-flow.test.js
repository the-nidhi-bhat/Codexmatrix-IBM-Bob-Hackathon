"use strict";

/**
 * The real production flow, end to end, against the real repository and the real
 * Node 6 container.
 *
 * The other files in this suite prove the refusals. This one proves the thing
 * they exist to protect: that a modernization commit can be executed, anchored
 * on a server-owned run branch, verified by the real engine, and rolled back
 * with a rollback that PERSISTS.
 *
 * Three flows:
 *
 *  1. F-12 executes, its commit is verified through an ATTACHED worktree, and
 *     the attachment is proven by watching git's own worktree registry while the
 *     run is in flight. A `worktreeCreated: true` flag would not prove the
 *     worktree was attached, and attachment is the whole point of the M3.3
 *     anchor change: a detached worktree throws away the engine's `git revert`
 *     when the worktree goes.
 *  2. The legacy no-ref path still works: a baseline subject with no ref is
 *     verified in a DETACHED worktree anchored on integration/final.
 *  3. Rollback persistence. A commit that breaks the suite is executed, the
 *     engine fails validation, `tools/rollback.js` reverts it, and recovery
 *     validation passes. "The revert command executed" is explicitly NOT
 *     sufficient evidence, so this asserts, from the main repository and after
 *     the worktree is gone: the branch tip is a new Revert commit, the
 *     broken content is gone from the branch, and it was present in the
 *     modernization commit.
 *
 * Requires Docker. If Docker is unavailable the tests SKIP with a reason rather
 * than fail, because a missing daemon is an environment fact, not a defect.
 * Each container run is 30–90s, so these take minutes, not seconds.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { runCheckpoint } = require("../dist/checkpointRunner");
const { executeModernization, INTEGRATION_BRANCH } = require("../dist/modernization/executor");
const {
  REPO_ROOT,
  dockerAvailable,
  git,
  gitAttempt,
  isRegisteredWorktree,
  normalizeFsPath,
  shaOf,
  watchTmpWorktrees,
} = require("./helpers");

// A container run plus a revert plus recovery validation, with room to spare.
const FLOW_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * A run branch is left behind by a successful run, on purpose: the verify and
 * rollback stages attach to it. `git branch -d` cannot delete an unmerged
 * branch, and `-D` is forbidden, so the name is reported rather than forced
 * away. The test prints it so the gap is visible instead of hidden.
 */
const retainedBranches = [];
test.after(() => {
  if (retainedBranches.length) {
    console.log(
      `\nNOTE: run branches left in place by the M3.3 flow suite. They hold an unmerged\n` +
        `modernization (and, for the rollback case, a revert) commit, so "git branch -d"\n` +
        `correctly refuses and "-D" is forbidden. Remove them by hand if you no longer\n` +
        `need the evidence:\n  ${retainedBranches.join("\n  ")}`,
    );
  }
});

const docker = dockerAvailable();
const dockerReason = docker.ok ? null : docker.message;

test("F-12: a modernization commit is verified through an ATTACHED worktree", { timeout: FLOW_TIMEOUT_MS }, async (t) => {
  if (!docker.ok) return t.skip(`Docker unavailable: ${dockerReason}`);

  const runId = randomUUID();
  const branch = `lcw/modernization/${runId}`;

  // 1. Execute the real catalogue operation through the real entry point.
  const execution = await executeModernization({ runId, operationId: "f-12-expr-eval" });
  assert.equal(execution.status, "completed", JSON.stringify(execution));
  assert.equal(execution.code, undefined);
  assert.equal(execution.cleanup.removed, true, "the execute worktree must be gone");
  assert.equal(execution.baseCommit, shaOf(INTEGRATION_BRANCH), "runs are based on integration/final");
  assert.deepEqual(execution.changedFiles.sort(), ["package.json", "server/game/index.js"]);

  // The commit is real and on the branch, and the branch is what a successful
  // run KEEPS: the next stage attaches to it.
  const commit = execution.modernizationCommit;
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.equal(shaOf(branch), commit, "the run branch must hold the modernization commit");
  assert.equal(branch, execution.branch);
  retainedBranches.push(branch);
  t.diagnostic(`F-12 run branch retained as evidence: ${branch}`);

  // 2. Verify it, while watching git's worktree registry.
  const watcher = watchTmpWorktrees(150);
  let observed = [];
  let run;
  try {
    run = await runCheckpoint({ commit, ref: branch });
  } finally {
    observed = watcher.stop();
  }

  assert.equal(run.outcome, "COMPLETED", JSON.stringify({ ...run, stdout: run.stdout.slice(-2000) }));
  assert.equal(run.error, undefined);
  assert.equal(run.checkpointStatus, "VERIFIED", `engine said ${run.checkpointStatus}`);
  assert.equal(run.exitCode, 0);
  assert.equal(run.anchorRef, branch, "the run must be anchored on the run branch");
  assert.equal(run.repositoryRoot, REPO_ROOT);
  assert.equal(run.commit, commit);
  // The engine's own counters, parsed by tools/validate.js from the test
  // runner's output. 18 is the characterization suite as it stands.
  assert.equal(typeof run.checkpoint.validationResult.passed, "number");
  assert.equal(run.checkpoint.validationResult.passed, run.checkpoint.validationResult.total);
  assert.equal(run.checkpoint.validationResult.failed, 0, "no characterization test may fail");
  assert.ok(run.checkpoint.validationResult.passed >= 18, "the characterization suite must be intact");

  // 3. The attachment, proven from git rather than from a flag.
  const mine = observed.find((w) => normalizeFsPath(w.path) === normalizeFsPath(run.worktreePath));
  assert.ok(mine, `the runner's worktree was never observed: ${JSON.stringify(observed)}`);
  assert.equal(mine.detached, false, "a run-ref worktree must be attached, not detached");
  assert.equal(mine.branch, `refs/heads/${branch}`, "the worktree must be attached to the run branch");
  // And its HEAD was the modernization commit while the engine ran, which is
  // what lets the engine's revert become a commit on that branch.
  assert.ok(
    mine.observations.some((o) => o.head === commit),
    `the worktree HEAD was never the modernization commit: ${JSON.stringify(mine.observations)}`,
  );

  // 4. The run left nothing of its own behind.
  assert.equal(isRegisteredWorktree(run.worktreePath), false, "the checkpoint worktree must be removed");
  assert.equal(run.cleanup.removed, true, run.cleanup.warning || "");
  assert.equal(shaOf(branch), commit, "verification must not move the branch");
  assert.equal(shaOf(INTEGRATION_BRANCH), execution.baseCommit, "verification must not move integration/final");
});

test("the legacy no-ref path verifies a baseline subject in a DETACHED worktree", { timeout: FLOW_TIMEOUT_MS }, async (t) => {
  if (!docker.ok) return t.skip(`Docker unavailable: ${dockerReason}`);

  // No ref: the pre-M3.3 call shape, which must keep working. A baseline subject
  // is contained in integration/final, so no run branch is needed and none is
  // created — nothing may leak for this path.
  const commit = shaOf(INTEGRATION_BRANCH);
  const before = git(["for-each-ref", "--format=%(refname)", "refs/heads/lcw/modernization/"]);

  const watcher = watchTmpWorktrees(150);
  let observed = [];
  let run;
  try {
    run = await runCheckpoint({ commit });
  } finally {
    observed = watcher.stop();
  }

  assert.equal(run.outcome, "COMPLETED", JSON.stringify({ ...run, stdout: run.stdout.slice(-2000) }));
  assert.equal(run.checkpointStatus, "VERIFIED");
  assert.equal(run.anchorRef, INTEGRATION_BRANCH, "no ref must default to integration/final");
  assert.equal(run.checkpoint.validationResult.failed, 0);

  const mine = observed.find((w) => normalizeFsPath(w.path) === normalizeFsPath(run.worktreePath));
  assert.ok(mine, "the runner's worktree was never observed");
  assert.equal(mine.detached, true, "a no-ref worktree must stay detached, so no branch is touched");
  assert.equal(mine.branch, "");

  assert.equal(isRegisteredWorktree(run.worktreePath), false);
  assert.equal(run.cleanup.removed, true, run.cleanup.warning || "");
  assert.equal(
    git(["for-each-ref", "--format=%(refname)", "refs/heads/lcw/modernization/"]),
    before,
    "the no-ref path must not create a branch",
  );
  assert.equal(shaOf(INTEGRATION_BRANCH), commit, "the no-ref path must not move the anchor");
});

test("rollback persists as a commit on the run branch, and restores the change", { timeout: FLOW_TIMEOUT_MS }, async (t) => {
  if (!docker.ok) return t.skip(`Docker unavailable: ${dockerReason}`);

  // demo-break-win-condition makes the demo's win condition unreachable, so a
  // characterization test fails. That is the only supported way to reach the
  // engine's rollback path without hand-editing the suite.
  const runId = randomUUID();
  const branch = `lcw/modernization/${runId}`;

  const execution = await executeModernization({ runId, operationId: "demo-break-win-condition" });
  assert.equal(execution.status, "completed", JSON.stringify(execution));
  const commit = execution.modernizationCommit;
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(execution.changedFiles, ["server/game/index.js"]);
  retainedBranches.push(branch);
  t.diagnostic(`rollback run branch retained as evidence: ${branch}`);

  // The break is really in the commit, so "the revert undid something" is a
  // claim about observable content, not about a log line.
  const BROKEN = "if (res === 25) {";
  const ORIGINAL = "if (res === 0) {";
  const file = "server/game/index.js";
  const atModernization = git(["show", `${commit}:${file}`]);
  assert.ok(atModernization.includes(BROKEN), "the modernization commit must contain the break");
  assert.equal(atModernization.includes(ORIGINAL), false);

  const run = await runCheckpoint({ commit, ref: branch });

  // The engine failed validation, rolled back, and confirmed the recovery.
  // `outcome` is about the RUNNER, not the verdict: COMPLETED means the engine
  // ran and produced a well-formed result. The verdict is `checkpointStatus`,
  // and the engine's own contract is exit 0 for VERIFIED/RECOVERY_VERIFIED and
  // exit 1 for VALIDATION_FAILED with RECOVERY_VERIFIED.
  assert.equal(run.checkpointStatus, "RECOVERY_VERIFIED", run.stdout.slice(-3000));
  assert.equal(run.checkpoint.status, "RECOVERY_VERIFIED");
  assert.equal(run.exitCode, 1, "RECOVERY_VERIFIED exits 1, by the engine's own contract");
  assert.equal(run.outcome, "COMPLETED", "the engine ran and reported; that is what COMPLETED means");
  assert.equal(run.error, undefined, "a successful engine run is not a runner error");
  assert.ok(
    run.checkpoint.finalStatus.includes("Rolled back via revert commit"),
    `finalStatus must name the revert: ${run.checkpoint.finalStatus}`,
  );
  assert.equal(run.checkpoint.rollbackResult.status, "ROLLED_BACK");
  assert.equal(run.checkpoint.recoveryValidation.status, "PASS");
  assert.equal(run.checkpoint.recoveryValidation.failed, 0, "recovery validation must be green again");
  assert.match(run.checkpoint.rollbackResult.revertCommit, /^[0-9a-f]{40}$/);

  // ── PERSISTENCE ──────────────────────────────────────────────────────────
  // The worktree is gone. The evidence is the branch.
  assert.equal(isRegisteredWorktree(run.worktreePath), false, "the checkpoint worktree must be removed");
  assert.equal(run.cleanup.removed, true, run.cleanup.warning || "");

  const branchTip = shaOf(branch);
  assert.notEqual(branchTip, commit, "the branch tip must have moved past the modernization commit");
  assert.equal(branchTip, run.checkpoint.rollbackResult.revertCommit, "the tip must BE the revert commit");
  assert.ok(
    gitAttempt(["merge-base", "--is-ancestor", commit, branchTip]).ok,
    "the modernization commit must still be an ancestor, so the revert happened on top of it",
  );

  // A real Revert commit, with a Revert subject, authored after the fact.
  const subjects = git(["log", "-2", "--format=%s", branch]).split("\n");
  assert.equal(subjects.length, 2, `expected two commits, got ${subjects.length}`);
  assert.match(subjects[0], /^Revert "/, `the tip must be a Revert commit, got: ${subjects[0]}`);
  assert.equal(subjects[1], execution.commitMessage, "the modernization commit must still be underneath");

  // And the content really changed back. This is the assertion that a
  // "revert command exited 0" check would never have made.
  const atBranchTip = git(["show", `${branch}:${file}`]);
  assert.ok(atBranchTip.includes(ORIGINAL), "the branch tip must hold the original code");
  assert.equal(atBranchTip.includes(BROKEN), false, "the branch tip must not hold the break");

  // Finally, the branch a revert was taken on must still be refused by the safe
  // delete, which is why the suite reports it instead of removing it.
  const safeDelete = gitAttempt(["branch", "-d", branch]);
  assert.equal(safeDelete.ok, false, "an unmerged run branch must not be a -d target");
});
