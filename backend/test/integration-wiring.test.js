"use strict";

/**
 * Integration tests for the Execute → Verify → Rollback wiring, driven over real
 * HTTP against the real routers, with a real git worktree, a real commit and the
 * real 18-test Docker validation behind the checkpoint.
 *
 * The two bugs this milestone exists to fix are both asserted here as behaviour,
 * not as a code reading:
 *
 *   1. the verified commit is the commit the executor CREATED, not the
 *      pre-modernization HEAD (`startingCommit`);
 *   2. the checkpoint is anchored on the server-owned run branch, so the engine
 *      checks out ATTACHED and a revert lands on a named branch.
 *
 * Bug 2 is proven the only way it can be: the RECOVERY case does not reach
 * `git revert` unless the worktree is attached to a branch, so a successful
 * recovery with a surviving revert commit is the evidence.
 *
 * Runs are seeded through the real run store rather than by calling /api/analyze,
 * so the suite needs no network and no clone. See test/fixtures/workflowState.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");

const {
  REPO_ROOT,
  git,
  branchExists,
  branchesMatching,
  isUnderTmp,
  worktreeInfo,
  registeredWorktrees,
  normalizeFsPath,
  dockerAvailable,
} = require("./helpers");
const { putRun } = require("../dist/runStore");
const { makeWorkflowState } = require("./fixtures/workflowState");

// ── harness ───────────────────────────────────────────────────────────────────

function mountApp() {
  // The REAL app, from src/app.ts — the same middleware stack, the same error
  // envelope and the same routers that serve production requests.
  return require("../dist/app").createApp();
}

async function withServer(fn) {
  const server = mountApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function post(base, route, body) {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(base, route) {
  const res = await fetch(`${base}${route}`);
  return { status: res.status, body: await res.json() };
}

function seedRun(overrides) {
  const run = makeWorkflowState(randomUUID(), overrides);
  putRun(run);
  return run;
}

/** Execute one catalogue operation against a seeded run. Returns the response. */
async function execute(base, runId, operationId = "f-12-expr-eval") {
  return post(base, "/api/modernization/execute", { analysisRunId: runId, operationId });
}

function commitSubject(sha) {
  return sha.slice(0, 12);
}

/**
 * The only worktree git may have registered is the main tree. Every run creates
 * a throwaway worktree, so this is the assertion that catches a leak — and it is
 * stated positively, because "no leftovers" is easy to satisfy by never having
 * created one in the first place.
 */
function assertOnlyMainWorktree(why) {
  assert.deepEqual(registeredWorktrees().map(normalizeFsPath), [normalizeFsPath(REPO_ROOT)], why);
}

// ── catalogue ─────────────────────────────────────────────────────────────────

test("GET /api/modernization/operations lists the allowlist and nothing executable", async () => {
  await withServer(async (base) => {
    const { status, body } = await get(base, "/api/modernization/operations");
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.operations.length >= 2, "the catalogue must not be empty");

    const ids = body.operations.map((op) => op.id);
    assert.ok(ids.includes("f-12-expr-eval"), "the real F-12 step must be offered");
    assert.ok(ids.includes("demo-break-win-condition"), "the recovery scenario needs a way to break something");

    for (const op of body.operations) {
      for (const key of ["id", "title", "kind", "finding", "risk", "impact", "files"]) {
        assert.ok(key in op, `${op.id} must expose ${key}`);
      }
      // A catalogue entry is a description, not a payload: no absolute path, no
      // replacement source text, nothing that could be applied by a client.
      assert.deepEqual(Object.keys(op).sort(), [
        "files", "finding", "id", "impact", "kind", "risk", "title",
      ]);
      assert.equal(op.edits, undefined, "the catalogue view must not carry edits");
      assert.equal(op.commitMessage, undefined, "nor a commit message");
    }
    assert.equal(JSON.stringify(body).includes(REPO_ROOT), false, "no absolute path may leak in the catalogue");
  });
});

// ── trust boundary, before anything expensive happens ─────────────────────────

test("execute refuses every field that is not a run id and an operation id", async () => {
  await withServer(async (base) => {
    const run = seedRun();
    // Compared against a snapshot, not against zero: this repository carries
    // historical lcw/modernization/* branches from earlier milestones, and the
    // only claim worth making is that THIS test created none.
    const branchesBefore = branchesMatching(/^lcw\/modernization\//);
    const forbidden = [
      "commit", "ref", "branch", "anchorRef", "path", "file", "cwd", "repositoryRoot",
      "command", "executable", "shell", "message", "commitMessage", "edits",
      "worktree", "runRef", "modernizationCommit", "startingCommit", "resultFile",
    ];
    for (const field of forbidden) {
      const { status, body } = await post(base, "/api/modernization/execute", {
        analysisRunId: run.runId,
        operationId: "f-12-expr-eval",
        [field]: "origin/main; rm -rf /",
      });
      assert.equal(status, 400, `${field} must be rejected`);
      assert.equal(body.error.code, "UNEXPECTED_FIELD", `${field} must be refused by name`);
      assert.ok(body.error.message.includes(field), `the rejection must name ${field}`);
      // The value is never reflected, so it cannot become an injection echo.
      assert.equal(body.error.message.includes("rm -rf"), false, `${field} value must not be echoed`);
    }
    // And nothing above created a commit or a branch.
    assert.equal(run.execution.modernizationCommit, undefined);
    assert.deepEqual(branchesMatching(/^lcw\/modernization\//), branchesBefore);
  });
});

test("execute refuses an unknown run, an unknown operation and a malformed body", async () => {
  await withServer(async (base) => {
    const missing = await post(base, "/api/modernization/execute", {
      analysisRunId: randomUUID(),
      operationId: "f-12-expr-eval",
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "ANALYSIS_RUN_NOT_FOUND");

    const run = seedRun();
    const unknown = await execute(base, run.runId, "rewrite-everything");
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "UNKNOWN_OPERATION");
    // The message is actionable: it lists what IS allowed.
    assert.ok(unknown.body.error.message.includes("f-12-expr-eval"));

    // A body that is not a JSON object is refused either by this route's guard
    // (a JSON array or null reaches it) or by the body parser's own strict mode,
    // which restates the failure in the same envelope so a client never has to
    // parse an HTML error page.
    for (const bad of [null, [], "text", 42, {}]) {
      const res = await post(base, "/api/modernization/execute", bad);
      assert.equal(res.status, 400, `body ${JSON.stringify(bad)} must be refused`);
      assert.ok(
        ["INVALID_BODY", "MISSING_ANALYSIS_RUN_ID", "MISSING_OPERATION_ID", "MALFORMED_BODY"].includes(res.body.error.code),
        `body ${JSON.stringify(bad)} produced ${res.body.error.code}`,
      );
      assert.equal(res.body.success, false, "even a parser failure uses the API envelope");
    }
    const empty = await post(base, "/api/modernization/execute", { analysisRunId: "   ", operationId: "f-12-expr-eval" });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error.code, "MISSING_ANALYSIS_RUN_ID");
  });
});

test("the checkpoint create route refuses the same protected fields", async () => {
  await withServer(async (base) => {
    const run = seedRun();
    for (const field of ["commit", "ref", "branch", "path", "command", "shell", "cwd"]) {
      const { status, body } = await post(base, "/api/checkpoint-runs", {
        analysisRunId: run.runId,
        [field]: "anything",
      });
      assert.equal(status, 400, `${field} must be rejected`);
      assert.equal(body.error.code, "UNEXPECTED_FIELD");
    }
    const missing = await post(base, "/api/checkpoint-runs", { analysisRunId: randomUUID() });
    assert.equal(missing.status, 404);
  });
});

// ── one at a time ─────────────────────────────────────────────────────────────

test("only one modernization executes at a time", async () => {
  await withServer(async (base) => {
    const a = seedRun();
    const b = seedRun();
    const [first, second] = await Promise.all([execute(base, a.runId), execute(base, b.runId)]);

    const statuses = [first.status, second.status].sort();
    assert.equal(statuses[0], 200, "exactly one run executes");
    assert.equal(statuses[1], 429, "the other is told to wait");
    const busy = first.status === 429 ? first : second;
    assert.equal(busy.body.error.code, "MODERNIZATION_IN_PROGRESS");
    // A refused-for-busy run must not be marked failed: nothing was attempted.
    const skipped = busy.body.workflow?.runId === a.runId ? a : b;
    assert.notEqual(skipped.execution.status, "failed");

    // The slot is released, so the next attempt is not permanently blocked.
    const after = await execute(base, b.runId);
    assert.equal(after.status, 200);
  });
});

// ── the real execute → verify chain ───────────────────────────────────────────

test("BUG 1+2: the checkpoint verifies the commit the executor created, on the run branch", async (t) => {
  const docker = dockerAvailable();
  if (!docker.ok) {
    t.skip(`Docker unavailable: ${docker.message}`);
    return;
  }

  await withServer(async (base) => {
    const originalBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const run = seedRun();

    // ── execute ────────────────────────────────────────────────────────────
    const applied = await execute(base, run.runId);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.success, true);
    const execution = applied.body.workflow.execution;
    assert.equal(execution.status, "complete");
    assert.equal(execution.operationId, "f-12-expr-eval");

    // The trusted trio, written server-side.
    assert.match(execution.modernizationCommit, /^[0-9a-f]{40}$/, "a real commit must be recorded");
    assert.match(execution.runRef, /^lcw\/modernization\/[0-9a-f-]{36}$/i, "a real run branch must be recorded");
    assert.match(execution.startingCommit, /^[0-9a-f]{40}$/);

    // The bug: these are DIFFERENT commits, and it is the created one that is
    // the subject. Asserting they differ is what makes the test meaningful.
    assert.notEqual(
      execution.modernizationCommit,
      execution.startingCommit,
      "the subject must be the applied commit, not the pre-existing HEAD",
    );
    assert.equal(execution.modernizationCommit, await git(["rev-parse", execution.runRef]));

    // The executor's own invariants still hold through the HTTP layer.
    assert.equal(branchExists(execution.runRef), true);
    assert.equal(await git(["rev-parse", "--abbrev-ref", "HEAD"]), originalBranch);
    assertOnlyMainWorktree("the apply worktree must be cleaned up");
    assert.ok(!isUnderTmp(REPO_ROOT), "sanity: the repo itself is not under tmp");

    // ── the checkpoint is now resolvable ───────────────────────────────────
    const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const checkpointRunId = created.body.checkpointRun.id;
    assert.equal(created.body.checkpointRun.status, "created");
    assert.equal(created.body.checkpointRun.checkpointStatus, null, "creating a run does not execute anything");

    // ── verify, for real ───────────────────────────────────────────────────
    t.diagnostic(`verifying ${commitSubject(execution.modernizationCommit)} on ${execution.runRef}`);
    const verified = await post(base, `/api/checkpoint-runs/${checkpointRunId}/verify`, {});
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const view = verified.body.checkpointRun;

    assert.equal(view.status, "complete");
    assert.equal(view.subjectCommit, commitSubject(execution.modernizationCommit), "the subject echoed is the created commit");
    assert.equal(view.checkpointStatus, "VERIFIED", "the engine's own verdict, verbatim");
    assert.equal(view.checkpoint.modernizationCommit, execution.modernizationCommit);
    // Two components, two meanings for "startingCommit", and getting this
    // confused is the bug this milestone exists to fix. The EXECUTOR's
    // startingCommit is the HEAD it branched FROM. The ENGINE's is the HEAD of
    // the worktree it verified in, which was checked out AT the subject. So the
    // engine's startingCommit is the subject itself — and the executor's is the
    // base. Verifying the executor's value would have checked the wrong commit.
    assert.equal(
      view.checkpoint.startingCommit,
      execution.modernizationCommit,
      "the engine checks out AT the subject, so its startingCommit is the subject",
    );
    assert.equal(await git(["rev-parse", `${execution.runRef}~1`]), execution.startingCommit,
      "and the executor's startingCommit is the base it branched from");
    // BUG 2: the engine saw the run branch, not the primary tip.
    assert.equal(view.checkpoint.branch, execution.runRef);

    // The real 18 tests actually ran. Counts are the engine's, never ours.
    const validation = view.checkpoint.validationResult;
    assert.equal(validation.status, "PASS");
    assert.equal(validation.total, 18);
    assert.equal(validation.passed, 18);
    assert.equal(validation.failed, 0);
    assert.equal(validation.skipped, 0);
    assert.equal(validation.exitCode, 0);
    // The harness prints one summary per test group, not a grand total; the
    // total of 18 above comes from validate.js summing the groups. Assert both,
    // and assert no group reported a failure.
    assert.match(validation.output, /# 4 tests, 4 passed, 0 failed, 0 skipped/);
    assert.match(validation.output, /# 10 tests, 10 passed, 0 failed, 0 skipped/);
    assert.equal(/^not ok/m.test(validation.output), false, "no test may have failed");
    assert.match(validation.command, /node:6/);
    // No rollback was needed, and the engine says so rather than inventing one.
    assert.equal(view.checkpoint.rollbackResult, null);
    assert.equal(view.checkpoint.recoveryValidation, null);

    // ── lifecycle polling agrees with the POST response ───────────────────
    const polled = await get(base, `/api/checkpoint-runs/${checkpointRunId}`);
    assert.equal(polled.status, 200);
    assert.equal(polled.body.checkpointRun.checkpointStatus, "VERIFIED");
    assert.equal(polled.body.checkpointRun.finishedAt, view.finishedAt);
    assert.ok(view.startedAt && view.finishedAt, "the run must carry real timestamps");

    // The worktree is gone, and the branch survives it: the run branch is the
    // record a rollback would act on.
    assertOnlyMainWorktree("the checkpoint worktree must be cleaned up");
    assert.equal(branchExists(execution.runRef), true);
  });
});

test("BUG 2, proven by recovery: a reverted subject lands on the run branch as a persistent commit", async (t) => {
  const docker = dockerAvailable();
  if (!docker.ok) {
    t.skip(`Docker unavailable: ${docker.message}`);
    return;
  }

  await withServer(async (base) => {
    const mainCommit = await git(["rev-parse", "main"]);
    // A deliberately broken win condition: the commit exists, the tests fail,
    // and the engine must revert it and re-validate. Reverting needs a branch to
    // land on — a detached HEAD would make the revert unreachable.
    const run = seedRun();
    const applied = await execute(base, run.runId, "demo-break-win-condition");
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const { modernizationCommit, runRef, startingCommit } = applied.body.workflow.execution;
    assert.equal(applied.body.workflow.execution.status, "complete");

    const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    const checkpointRunId = created.body.checkpointRun.id;

    t.diagnostic(`recovery over ${commitSubject(modernizationCommit)} on ${runRef}`);
    const verified = await post(base, `/api/checkpoint-runs/${checkpointRunId}/verify`, {});
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const view = verified.body.checkpointRun;

    assert.equal(view.status, "complete");
    assert.equal(view.checkpointStatus, "RECOVERY_VERIFIED", "a rolled-back regression still recovers");

    // The regression was real: it failed, then passed again after the revert.
    assert.equal(view.checkpoint.validationResult.status, "FAIL");
    assert.ok(view.checkpoint.validationResult.failed > 0, "the deliberate regression must actually fail a test");
    assert.equal(view.checkpoint.recoveryValidation.status, "PASS");
    assert.equal(view.checkpoint.recoveryValidation.failed, 0);

    // The revert: a NEW commit, on the run branch, targeting exactly the subject.
    const rollback = view.checkpoint.rollbackResult;
    assert.equal(rollback.status, "ROLLED_BACK");
    assert.equal(rollback.targetCommit, modernizationCommit);
    assert.match(rollback.revertCommit, /^[0-9a-f]{40}$/);
    assert.notEqual(rollback.revertCommit, modernizationCommit, "history is preserved, not reset");
    assert.equal(rollback.branch, runRef);
    assert.ok(rollback.filesChanged.includes("server/game/index.js"), "the regression's file must be reverted");
    assert.equal(rollback.validationRequired, true);

    // BUG 2's real proof: the revert is the tip of the run branch, in the real
    // repository, and the branch itself is untouched by the checkpoint.
    assert.equal(rollback.revertCommit, await git(["rev-parse", runRef]));
    assert.equal(await git(["rev-parse", `${runRef}~1`]), modernizationCommit);
    assert.equal(await git(["rev-parse", `${runRef}~2`]), startingCommit);
    assert.equal(await git(["rev-parse", "main"]), mainCommit,
      "the primary branch must be exactly where it was");
    assertOnlyMainWorktree("the recovery worktree must be cleaned up");

    // The run branch deliberately SURVIVES a completed run: it is the record a
    // later rollback acts on, and `git branch -d` refuses to delete it anyway
    // while it is unmerged. The executor only removes a branch it created for a
    // run that FAILED or was refused — never one that succeeded.
    assert.equal(branchExists(runRef), true, "a successful run's branch is kept as the rollback record");
    assert.equal(await git(["rev-parse", runRef]), rollback.revertCommit);
  });
});

// ── fail closed, cheaply, with no checkpoint run spent ─────────────────────────

test("verify refuses a run with no recorded subject, and names the reason", async () => {
  await withServer(async (base) => {
    const run = seedRun();
    const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    const id = created.body.checkpointRun.id;

    const refused = await post(base, `/api/checkpoint-runs/${id}/verify`, {});
    assert.equal(refused.status, 409);
    assert.equal(refused.body.checkpointRun.status, "refused");
    assert.equal(refused.body.checkpointRun.refusal.code, "APPROVED_SUBJECT_NOT_RECORDED");
    assert.match(refused.body.checkpointRun.refusal.message, /Execute a modernization step first/);
    assert.equal(refused.body.checkpointRun.checkpointStatus, null, "a refusal reports no engine status");
    // The attempt happened and was resolved instantly, so it carries both
    // timestamps — what it does NOT carry is any engine output.
    assert.ok(refused.body.checkpointRun.startedAt, "the attempt is timestamped");
    assert.ok(refused.body.checkpointRun.finishedAt, "and finished");
    assert.equal(refused.body.checkpointRun.checkpoint, null, "nothing was executed, so nothing is reported");
  });
});

test("a subject without a run ref is refused rather than anchored on a guess", async () => {
  await withServer(async (base) => {
    // The exact shape the M3.3 audit found: a commit exists, no run branch. The
    // runner would have defaulted the anchor to main, which is both
    // the wrong anchor and a detached checkout.
    const run = seedRun({
      execution: {
        currentStepId: 1,
        status: "complete",
        log: [],
        filesChanged: [],
        modernizationCommit: await git(["rev-parse", "HEAD"]),
      },
    });
    const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    const refused = await post(base, `/api/checkpoint-runs/${created.body.checkpointRun.id}/verify`, {});
    assert.equal(refused.status, 409);
    assert.equal(refused.body.checkpointRun.refusal.code, "APPROVED_REF_NOT_RECORDED");
    assert.match(refused.body.checkpointRun.refusal.message, /run branch/);
  });
});

test("a recorded ref that is not a server-owned run branch is refused", async () => {
  await withServer(async (base) => {
    for (const badRef of ["main", "integration/final", "lcw/modernization/not-a-uuid", "origin/main", ""]) {
      const run = seedRun({
        execution: {
          currentStepId: 1,
          status: "complete",
          log: [],
          filesChanged: [],
          modernizationCommit: await git(["rev-parse", "HEAD"]),
          runRef: badRef,
        },
      });
      const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
      const refused = await post(base, `/api/checkpoint-runs/${created.body.checkpointRun.id}/verify`, {});
      assert.equal(refused.status, 409, `ref ${JSON.stringify(badRef)} must be refused`);
      assert.equal(refused.body.checkpointRun.refusal.code, "APPROVED_REF_NOT_RECORDED");
    }
  });
});

test("a recorded commit that is not a full 40-hex SHA is refused", async () => {
  await withServer(async (base) => {
    for (const badCommit of ["HEAD", "main", "abc123", `${"a".repeat(39)}`, `${"A".repeat(40)}`, "1234; rm -rf /"]) {
      const run = seedRun({
        execution: {
          currentStepId: 1,
          status: "complete",
          log: [],
          filesChanged: [],
          modernizationCommit: badCommit,
          runRef: `lcw/modernization/${randomUUID()}`,
        },
      });
      const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
      const refused = await post(base, `/api/checkpoint-runs/${created.body.checkpointRun.id}/verify`, {});
      assert.equal(refused.status, 409, `commit ${badCommit} must be refused`);
      assert.equal(refused.body.checkpointRun.refusal.code, "APPROVED_SUBJECT_NOT_RECORDED");
      assert.equal(refused.body.checkpointRun.refusal.message.includes(badCommit), false, "never echo the value");
    }
  });
});

test("a run id that is not a UUID is a 404, and a checkpoint id that is not a UUID is a 404", async () => {
  await withServer(async (base) => {
    const run = seedRun();
    for (const bad of ["../etc", "not-a-uuid", "1", "%2e%2e"]) {
      const created = await post(base, "/api/checkpoint-runs", { analysisRunId: bad });
      assert.ok([400, 404].includes(created.status), `run id ${bad}`);
      assert.equal(created.body.success, false);
    }
    const missing = await get(base, "/api/checkpoint-runs/00000000-0000-0000-0000-000000000000");
    assert.equal(missing.status, 404);
    assert.ok(run.runId);
  });
});

test("a completed checkpoint run cannot be verified twice", async () => {
  await withServer(async (base) => {
    const run = seedRun();
    const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    const id = created.body.checkpointRun.id;

    const first = await post(base, `/api/checkpoint-runs/${id}/verify`, {});
    assert.equal(first.status, 409);
    assert.equal(first.body.checkpointRun.status, "refused");

    // A refusal is terminal too: re-running it would just re-report the same
    // refusal, and the point of the 409 is that the subject cannot change under
    // an existing run's feet.
    const second = await post(base, `/api/checkpoint-runs/${id}/verify`, {});
    assert.equal(second.status, 409);
  });
});

test("two checkpoint runs cannot verify at the same time", async (t) => {
  const docker = dockerAvailable();
  if (!docker.ok) {
    t.skip(`Docker unavailable: ${docker.message}`);
    return;
  }
  await withServer(async (base) => {
    const run = seedRun();
    const applied = await execute(base, run.runId);
    assert.equal(applied.status, 200);

    const a = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    const b = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    const [first, second] = await Promise.all([
      post(base, `/api/checkpoint-runs/${a.body.checkpointRun.id}/verify`, {}),
      post(base, `/api/checkpoint-runs/${b.body.checkpointRun.id}/verify`, {}),
    ]);
    const busy = [first, second].find((r) => r.status === 429);
    assert.ok(busy, `one of the two must be told to wait, got ${first.status} and ${second.status}`);
    assert.equal(busy.body.error.code, "CHECKPOINT_IN_PROGRESS");
  });
});

test("a worktree leak is reported, never hidden — and never left behind", async () => {
  await withServer(async (base) => {
    const run = seedRun();
    const created = await post(base, "/api/checkpoint-runs", { analysisRunId: run.runId });
    await post(base, `/api/checkpoint-runs/${created.body.checkpointRun.id}/verify`, {});
    // Whatever the outcome, no worktree of this repository may survive a run.
    assertOnlyMainWorktree("a refused run must still leave no worktree behind");
    const info = worktreeInfo(REPO_ROOT);
    assert.ok(info.branch, "the main tree is still on its branch");
  });
});
