"use strict";

/**
 * Finding 2: catalogue-driven modernization must never rewrite the safety and
 * control plane.
 *
 * Before M3.3 the only path guard was root containment, and the control plane
 * is inside the root: `tools/checkpoint.js`, `tools/validate.js`,
 * `tools/rollback.js` and the characterization suite all live under the
 * repository. The M3.3 audit proved the gap by constructing operations that
 * targeted those files, watching the executor write and commit them, and then
 * reverting by hand. An operation that edits the engine which verifies the
 * operation is verifying its own rewrite.
 *
 * The fix is `isProtectedPath`, enforced in `planOperation` before the path is
 * resolved and before anything is read, so a protected file is refused whether
 * or not it exists — no existence leak, and no way for a missing file to turn a
 * refusal into a read.
 *
 * These tests are read-only. `planOperation` never writes, and nothing here
 * creates a worktree or a branch.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  F12_EXPRESSION_ENGINE,
  MODERNIZATION_OPERATIONS,
  applyExactEdit,
  countOccurrences,
  getOperation,
  isProtectedPath,
  planOperation,
} = require("../dist/modernization/operations");
const { executeModernization } = require("../dist/modernization/executor");
const { REPO_ROOT, repoStateSnapshot } = require("./helpers");

/** A synthetic catalogue entry aimed at `file`, built exactly like a real one. */
function operationTargeting(file) {
  return {
    id: "test-probe",
    title: "test probe",
    description: "synthetic operation used by the M3.3 safety tests",
    kind: "modernization",
    finding: "TEST",
    reference: "backend/test/executor-safety.test.js",
    risk: "low",
    impact: "none; this operation must never be applicable",
    commitMessage: "test: must never run",
    edits: [
      {
        file,
        exactSource: "#!/usr/bin/env node\n",
        exactReplacement: "#!/usr/bin/env node\n// injected by a test\n",
      },
    ],
  };
}

/** Every spelling of a protected path that must resolve to the same refusal. */
const PROTECTED_TARGETS = [
  "tools/checkpoint.js",
  "tools/validate.js",
  "tools/rollback.js",
  "tools/checkpoint.test.js",
  "tools/new-file-the-executor-invented.js",
  "TOOLS/checkpoint.js",
  "Tools/Validate.js",
  "tools\\checkpoint.js",
  "./tools/checkpoint.js",
  "tools/../tools/checkpoint.js",
  "tools/./checkpoint.js",
  "legacy/get24-baseline/tests/characterization.test.js",
  "legacy/anything",
  "validation/last-result.json",
  "backend/src/checkpointRunner.ts",
  "backend/src/modernization/operations.ts",
  "backend/package.json",
  "backend",
  "IBM_BOB/BOB_USAGE.md",
  "bob_sessions/2026-09-26-execute-verify-rollback.md",
  ".opencode/anything.json",
  ".git/config",
  "PLAN.md",
  "ASSESS.md",
  "plan.md",
];

test("Finding 2: planOperation refuses every spelling of a protected path", async (t) => {
  for (const file of PROTECTED_TARGETS) {
    await t.test(file, () => {
      const plan = planOperation(REPO_ROOT, operationTargeting(file));
      assert.equal(plan.ok, false, `${file} must be refused`);
      assert.equal(plan.code, "PROTECTED_PATH", `${file} must be refused as PROTECTED_PATH`);
      assert.equal(plan.file, file, "the refused path is reported back");
      assert.equal(plan.occurrences, -1, "nothing was counted, because nothing was read");
    });
  }
});

test("Finding 2: a protected file is refused whether or not it exists", () => {
  // `tools/does-not-exist.js` is not a file, so a guard that ran after the
  // existence check would have reported SOURCE_NOT_FOUND and proved nothing
  // about the safety plane. The refusal is a decision about the PATH, not
  // about what is on disk.
  const missing = planOperation(REPO_ROOT, operationTargeting("tools/does-not-exist.js"));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "PROTECTED_PATH");
  assert.equal(missing.occurrences, -1);

  // And it holds when the guard is given a root that is not the repository at
  // all, because the check runs before the root is consulted.
  const wrongRoot = planOperation(path.join(REPO_ROOT, "does-not-exist"), operationTargeting("tools/checkpoint.js"));
  assert.equal(wrongRoot.ok, false);
  assert.equal(wrongRoot.code, "PROTECTED_PATH");
});

test("Finding 2: the refusal happens before anything is read", () => {
  // planOperation returns before/after content on success. A refusal must
  // carry no file content at all, which is what "before the read" looks like
  // from the outside.
  const plan = planOperation(REPO_ROOT, operationTargeting("tools/checkpoint.js"));
  assert.equal(plan.ok, false);
  assert.equal("before" in plan, false);
  assert.equal("after" in plan, false);
  assert.equal("occurrences" in plan && plan.occurrences >= 0, false);
});

test("Finding 2: the M3.3 audit probe — an operation aimed at the checkpoint engine — is refused", () => {
  // The exact shape the audit used. The audit observed the executor write
  // `tools/checkpoint.js` and commit it. The same construction is now refused
  // at planning, before the worktree ever holds a write.
  for (const file of ["tools/checkpoint.js", "tools/validate.js", "tools/rollback.js"]) {
    const plan = planOperation(REPO_ROOT, operationTargeting(file));
    assert.equal(plan.ok, false, `${file} must not be plannable`);
    assert.equal(plan.code, "PROTECTED_PATH");
  }
});

test("Finding 2: the real catalogue is not blocked, or the fix would be useless", () => {
  // The denylist must not stop the work it exists to make safe. F-12 rewrites
  // the ROOT package.json dependency, and the other operation rewrites a file
  // under server/. Both must still plan cleanly against the real repository.
  for (const operation of MODERNIZATION_OPERATIONS) {
    const plan = planOperation(REPO_ROOT, operation);
    assert.equal(plan.ok, true, `${operation.id} must still be plannable: ${JSON.stringify(plan)}`);
    assert.ok(plan.files.length > 0, `${operation.id} must plan at least one file`);
  }

  // Specifically the two the audit worried about colliding with the safety
  // decision: the root package.json is deliberately NOT protected.
  assert.equal(isProtectedPath("package.json"), false, "F-12 must be able to edit the root package.json");
  const f12Files = planOperation(REPO_ROOT, F12_EXPRESSION_ENGINE).files.map((f) => f.file);
  assert.ok(
    f12Files.includes("package.json"),
    "F-12 must still plan the root package.json edit",
  );
  assert.ok(
    f12Files.some((f) => f.startsWith("server/")),
    "F-12 must still plan the legacy app edit",
  );

  // And the file that F-12 edits really is where the plan says it is.
  const onDisk = fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8");
  assert.equal(
    countOccurrences(onDisk, '"node-expression-eval": "0.1.x"'),
    1,
    "F-12's exactSource must still match exactly once in the real root package.json",
  );
});

test("Finding 2: the root containment guard is intact, not replaced by the denylist", () => {
  // The denylist is an addition. Escaping the repository must still be refused
  // with the original code, and a protected-looking name reached by climbing
  // out and back in must not become trusted by the denylist's own
  // normalization.
  for (const file of [
    "../outside-the-repository.js",
    "../../etc/passwd",
    "server/../../outside.js",
    "C:\\Windows\\System32\\drivers\\etc\\hosts",
    "\\\\server\\share\\payload.js",
    "/etc/passwd",
  ]) {
    const plan = planOperation(REPO_ROOT, operationTargeting(file));
    assert.equal(plan.ok, false, `${file} must be refused`);
    assert.notEqual(plan.code, "PROTECTED_PATH", `${file} is an escape, not a protected path`);
  }
});

test("isProtectedPath normalizes before it compares", () => {
  // Case folding is not cosmetic: Windows resolves these paths
  // case-insensitively, so a denylist a differently-cased spelling walks
  // straight through is not a denylist on this platform.
  for (const spelling of [
    "tools/checkpoint.js",
    "TOOLS/CHECKPOINT.JS",
    "Tools/Checkpoint.JS",
    "tools\\checkpoint.js",
    "./tools/checkpoint.js",
    "tools/../tools/checkpoint.js",
    "tools/./x.js",
  ]) {
    assert.equal(isProtectedPath(spelling), true, `${spelling} must be protected`);
  }

  // And it must not over-match: a name that merely starts with a protected
  // directory name is not inside it.
  for (const spelling of [
    "tools-extra/checkpoint.js",
    "toolsfoo.js",
    "legacy-not-really/thing.js",
    "backendish/src/index.ts",
    "toolsX/checkpoint.js",
    "src/index.ts",
    "server/game/index.js",
    "package.json",
    "PLAN.md.bak",
    "ASSESSMENT.md",
    ".github/workflows/ci.yml",
    "README.md",
  ]) {
    assert.equal(isProtectedPath(spelling), false, `${spelling} must NOT be protected`);
  }
});

test("the pure edit helpers are unchanged and still exact", () => {
  // The safety fix must not have loosened the exact-match contract that the
  // whole catalogue depends on.
  assert.equal(countOccurrences("aaa", "a"), 3);
  assert.equal(countOccurrences("aaa", "aa"), 1);
  assert.equal(countOccurrences("aaa", "b"), 0);

  const single = applyExactEdit("one\ntwo\n", { exactSource: "two", exactReplacement: "TWO" });
  assert.equal(single.ok, true);
  assert.equal(single.content, "one\nTWO\n");
  assert.equal(single.occurrences, undefined, "success carries no count field");

  // Zero and many are both refused.
  assert.equal(applyExactEdit("one\n", { exactSource: "zz", exactReplacement: "x" }).ok, false);
  assert.equal(applyExactEdit("a\na\n", { exactSource: "a", exactReplacement: "b" }).ok, false);
  assert.equal(applyExactEdit("a\na\n", { exactSource: "a", exactReplacement: "b" }).occurrences, 2);

  // A replacement identical to the source is NOT refused here. The pure helper
  // only promises exactness, and an unchanged plan is a legitimate thing for
  // the caller to be handed. The executor is what turns it into OPERATION_NO_EFFECT,
  // because only the executor knows nothing was written. That split is asserted
  // in executor-lifecycle.test.js.
  const noop = applyExactEdit("a\n", { exactSource: "a", exactReplacement: "a" });
  assert.equal(noop.ok, true);
  assert.equal(noop.content, "a\n");
});

test("an unknown operation id is refused before the repository is touched", async () => {
  const before = repoStateSnapshot();
  const result = await executeModernization({ runId: randomUUID(), operationId: "no-such-operation" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "UNKNOWN_OPERATION");
  assert.equal(result.modernizationCommit, null);
  assert.equal(result.branch, null);
  assert.equal(result.worktreePath, "", "no worktree was ever assigned");
  const after = repoStateSnapshot();
  assert.deepEqual(after.worktrees, before.worktrees, "no worktree may appear");
  assert.deepEqual(after.branches, before.branches, "no branch may appear");
});

test("a runId that is not a server-generated UUID is refused, and reaches no git state", async (t) => {
  // The runId is the only caller-influenced value that reaches a git argument
  // list, which is why it is pattern-locked. Each of these would be a branch
  // name if it were not.
  const hostile = [
    "not-a-uuid",
    "../../etc",
    "lcw/modernization/../../main",
    "a; rm -rf /",
    "$(id)",
    "`id`",
    "&& whoami",
    "--upload-pack=touch /tmp/pwned",
    "00000000-0000-4000-8000-000000000000; main",
    "0000000000000000000000000000000000000000",
    "00000000-0000-4000-8000-000000000000-00000000-0000-0000-0000-000000000000",
    "x".repeat(500),
  ];

  for (const runId of hostile) {
    await t.test(JSON.stringify(runId).slice(0, 60), async () => {
      const before = repoStateSnapshot();
      const result = await executeModernization({ runId, operationId: F12_EXPRESSION_ENGINE.id });
      assert.equal(result.status, "refused", "must be refused");
      assert.equal(result.code, "INVALID_RUN_ID", `expected INVALID_RUN_ID for ${runId}`);
      assert.equal(result.branch, null, "a refused runId must not even name a branch");
      assert.equal(result.modernizationCommit, null);
      assert.equal(result.cleanup.removed, true);
      const after = repoStateSnapshot();
      assert.deepEqual(after.worktrees, before.worktrees, "no worktree may appear");
      assert.deepEqual(after.branches, before.branches, "no branch may appear");
    });
  }
});

test("getOperation only returns catalogue entries, and the catalogue is frozen", () => {
  for (const id of ["f-12-expr-eval", "demo-break-win-condition"]) {
    assert.ok(getOperation(id), `${id} must be in the catalogue`);
  }
  for (const id of ["", "F-12", "../f-12-expr-eval", "f-12-expr-eval ", "constructor", "__proto__", "toString"]) {
    assert.equal(getOperation(id), undefined, `${id} must not resolve to an operation`);
  }
  assert.equal(Object.isFrozen(MODERNIZATION_OPERATIONS), true, "the catalogue must be frozen");
  assert.ok(getOperation("f-12-expr-eval").edits.length > 0, "an operation must carry its edits");
});
