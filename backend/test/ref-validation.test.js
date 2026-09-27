"use strict";

/**
 * Finding 1: the checkpoint runner must refuse bad anchor input with a
 * structured result, and must not crash.
 *
 * Before M3.3 the runner did `const requestedRef = (options.ref ?? "").trim()`
 * and `const commit = (options.commit ?? "").trim()`. `??` replaces only
 * nullish, so a number, object, array or boolean reached `.trim()` and threw a
 * raw TypeError out of a function whose entire contract is to resolve with a
 * structured result for every expected outcome. The same latent defect existed
 * on `commit`.
 *
 * Two invariants are asserted throughout:
 *
 *  1. Every rejection is `{ outcome: "REJECTED", error: { code, message } }`.
 *     Never a throw, never a 500.
 *  2. A rejection decided by input inspection alone runs NO git command. The
 *     runner resolves the repository root only after the SHA and ref checks, so
 *     `repositoryRoot === ""` is positive proof that nothing was executed.
 *
 * These are fast: every case here is refused before any container starts.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

const { runCheckpoint } = require("../dist/checkpointRunner");
const { INTEGRATION_BRANCH } = require("../dist/modernization/executor");
const { REPO_ROOT, git } = require("./helpers");

// A well-formed 40-hex SHA that does not exist. Reaching COMMIT_NOT_FOUND
// proves the value passed the shape check, so a later refusal is about the
// repository and not about the shape.
const ABSENT_SHA = "0".repeat(40);
const ABSENT_RUN_BRANCH = "lcw/modernization/00000000-0000-4000-8000-000000000000";
// A commit that definitely exists, for the cases that must get past the commit
// gate to reach the ref gate.
const REAL_SHA = git(["rev-parse", "integration/final^{commit}"]);

/** Assert a result is a structured refusal and that no git command ran. */
function assertRefusedWithoutGit(result, code) {
  assert.equal(result.outcome, "REJECTED", "must resolve, not throw");
  assert.ok(result.error, "must carry a structured error");
  assert.equal(result.error.code, code);
  assert.equal(typeof result.error.message, "string");
  assert.ok(result.error.message.length > 0, "message must not be empty");

  // No repository resolution means no git ran at all.
  assert.equal(result.repositoryRoot, "", "must not have resolved the repository root");
  assert.equal(result.anchorRef, "", "must not have selected an anchor");
  assert.equal(result.worktreeCreated, false, "must not have created a worktree");
  assert.equal(result.checkpointStatus, null, "must not have run the engine");
  assert.equal(result.exitCode, null, "must not have spawned a child process");
  // The worktree it would have used was never created, so its result file must
  // point at a path under the temp directory that is not a real file.
  assert.equal(path.resolve(result.resultFile).startsWith(path.resolve(os.tmpdir())), true);
  assert.equal(require("node:fs").existsSync(result.resultFile), false);
}

test("a valid-format but absent SHA is refused as COMMIT_NOT_FOUND, not as a shape error", async () => {
  const result = await runCheckpoint({ commit: ABSENT_SHA });
  assert.equal(result.outcome, "REJECTED");
  assert.equal(result.error.code, "COMMIT_NOT_FOUND");
  // This one DID reach git, which is the point: the shape was acceptable, so
  // the runner resolved the root and asked git about the commit.
  assert.equal(result.anchorRef, INTEGRATION_BRANCH);
  assert.equal(result.repositoryRoot, REPO_ROOT);
  assert.equal(result.worktreeCreated, false, "an absent commit must not reach a worktree");
  assert.equal(result.checkpointStatus, null, "no engine run may start for an absent commit");
  assert.equal(result.exitCode, null, "no child process may be spawned");
});

test("Finding 1: a non-string ref is refused as INVALID_REF, never a TypeError", async (t) => {
  // Each value is a thing a JavaScript caller, a JSON body, or a future route
  // that forwards client data can realistically hand over.
  const cases = {
    "a number": 42,
    "zero": 0,
    "NaN": Number.NaN,
    "a plain object": { ref: "lcw/modernization/00000000-0000-4000-8000-000000000000" },
    "an object whose toString looks trusted": {
      toString: () => "lcw/modernization/00000000-0000-4000-8000-000000000000",
    },
    "an array": ["lcw/modernization/00000000-0000-4000-8000-000000000000"],
    "an empty array": [],
    "true": true,
    "false": false,
    "a function": function named() {},
    "a Date": new Date(0),
    "a Map": new Map(),
    "a Buffer": Buffer.from("lcw/modernization/x"),
  };

  for (const [label, value] of Object.entries(cases)) {
    await t.test(label, async () => {
      const result = await runCheckpoint({ commit: ABSENT_SHA, ref: value });
      assertRefusedWithoutGit(result, "INVALID_REF");
    });
  }
});

test("Finding 1: the INVALID_REF refusal does not echo the offending value", async () => {
  const marker = "lcw/modernization/deadbeef-dead-beef-dead-beefdeadbeef";
  const hostile = {
    secret: marker,
    note: "if this text reaches the message the refusal is echoing caller data",
  };
  const result = await runCheckpoint({ commit: ABSENT_SHA, ref: hostile });
  assertRefusedWithoutGit(result, "INVALID_REF");
  assert.equal(result.error.message.includes(marker), false, "message must not echo the value");
  assert.equal(result.error.message.includes("secret"), false);
  assert.equal(JSON.stringify(result.error).includes(marker), false, "whole error must not echo it");
});

test("Finding 1: a non-string commit is refused as INVALID_COMMIT_SHA, never a TypeError", async (t) => {
  const cases = {
    "a number": 12345,
    "an object": { commit: ABSENT_SHA },
    "an array": [ABSENT_SHA],
    "true": true,
    "a function": function nope() {},
  };

  for (const [label, value] of Object.entries(cases)) {
    await t.test(label, async () => {
      const result = await runCheckpoint({ commit: value });
      assertRefusedWithoutGit(result, "INVALID_COMMIT_SHA");
    });
  }
});

test("an absent ref keeps its legacy meaning: anchor on integration/final", async (t) => {
  // undefined, null, and the empty/whitespace string all mean "no ref", which
  // is the pre-M3.3 behaviour and must not change. Reaching COMMIT_NOT_FOUND
  // rather than UNTRUSTED_REF proves the default anchor was selected and the
  // value was not treated as a caller-supplied ref.
  for (const [label, ref] of [
    ["omitted", undefined],
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
    ["newline", "\n\t "],
  ]) {
    await t.test(label, async () => {
      const result = await runCheckpoint({ commit: ABSENT_SHA, ref });
      assert.equal(result.error.code, "COMMIT_NOT_FOUND", "must not be refused as an untrusted ref");
      assert.equal(result.anchorRef, INTEGRATION_BRANCH);
      assert.equal(result.repositoryRoot, REPO_ROOT);
    });
  }
});

test("a string ref outside the run-branch namespace is refused as UNTRUSTED_REF", async (t) => {
  const cases = {
    "the default anchor, passed explicitly": INTEGRATION_BRANCH,
    "main": "main",
    "HEAD": "HEAD",
    "a tag": "legacy-baseline",
    "a remote-tracking ref": "origin/integration/final",
    "a commit SHA instead of a name": ABSENT_SHA,
    "the right namespace, wrong branch": "lcw/modernization",
    "the prefix without a uuid": "lcw/modernization/",
    "a uuid without the prefix": "00000000-0000-4000-8000-000000000000",
    "a different namespace": "lcw/verify/deadbeef-dead-beef-dead-beefdeadbeef",
    "a near-miss uuid": "lcw/modernization/00000000-0000-4000-8000-00000000000Z",
    "a nine-digit first group": "lcw/modernization/000000000-0000-4000-8000-000000000000",
    "a newline-smuggled ref": "lcw/modernization/00000000-0000-4000-8000-000000000000\nmain",
    "a NUL-smuggled ref": "lcw/modernization/00000000-0000-4000-8000-000000000000\u0000main",
  };

  for (const [label, ref] of Object.entries(cases)) {
    await t.test(label, async () => {
      const result = await runCheckpoint({ commit: ABSENT_SHA, ref });
      assertRefusedWithoutGit(result, "UNTRUSTED_REF");
    });
  }
});

test("hostile strings are refused on both arguments, and nothing is executed", async (t) => {
  const hostile = [
    "'; rm -rf / #",
    "&& whoami",
    "$(id)",
    "`id`",
    "| cat /etc/passwd",
    "../../etc/passwd",
    "..\\..\\Windows\\System32",
    "C:\\Windows\\System32\\cmd.exe",
    "\\\\server\\share\\payload",
    "~/.ssh/id_rsa",
    "--upload-pack=touch /tmp/pwned",
    "-c core.hooksPath=/tmp/evil",
    "refs/heads/integration/final",
    "integration/final^{commit}",
    "*",
    "lcw/modernization/*",
  ];

  for (const value of hostile) {
    await t.test(`ref: ${JSON.stringify(value)}`, async () => {
      const result = await runCheckpoint({ commit: ABSENT_SHA, ref: value });
      assertRefusedWithoutGit(result, "UNTRUSTED_REF");
    });

    await t.test(`commit: ${JSON.stringify(value)}`, async () => {
      const result = await runCheckpoint({ commit: value });
      assertRefusedWithoutGit(result, "INVALID_COMMIT_SHA");
    });
  }
});

test("a long string is refused on shape, not on a regex that could be pushed", async () => {
  const longRef = `lcw/modernization/${"0".repeat(40_000)}`;
  const refResult = await runCheckpoint({ commit: ABSENT_SHA, ref: longRef });
  assertRefusedWithoutGit(refResult, "UNTRUSTED_REF");

  const longCommit = "a".repeat(100_000);
  const commitResult = await runCheckpoint({ commit: longCommit });
  assertRefusedWithoutGit(commitResult, "INVALID_COMMIT_SHA");
});

test("a commit that is not 40 lowercase hex characters is refused, whatever else it is", async (t) => {
  const cases = {
    "empty": "",
    "whitespace": "   ",
    "a short SHA": git(["rev-parse", "--short", "HEAD"]),
    "an uppercase SHA": "A".repeat(40),
    "mixed case": "aB".repeat(20),
    "41 characters": "a".repeat(41),
    "39 characters": "a".repeat(39),
    "the HEAD name": "HEAD",
    "a branch name": INTEGRATION_BRANCH,
    "a tag name": "legacy-baseline",
    "a range": "HEAD~1..HEAD",
    "a caret expression": "HEAD^{commit}",
    "a path": "src/index.ts",
    "a flag": "--all",
    "hex with an embedded newline": `${ABSENT_SHA.slice(0, 20)}\n${ABSENT_SHA.slice(20)}`,
    "a non-hex letter in the body": `${ABSENT_SHA.slice(0, 39)}z`,
    "a hex prefix with trailing junk": `${ABSENT_SHA}x`,
  };

  for (const [label, value] of Object.entries(cases)) {
    await t.test(label, async () => {
      const result = await runCheckpoint({ commit: value });
      assertRefusedWithoutGit(result, "INVALID_COMMIT_SHA");
    });
  }

  // Surrounding whitespace is still tolerated, as before: the value is trimmed
  // before the shape test, so a padded SHA is not a new failure mode. A padding
  // that survives the trim — an embedded newline — is not tolerated.
  const padded = await runCheckpoint({ commit: `  ${ABSENT_SHA}  ` });
  assert.equal(padded.error.code, "COMMIT_NOT_FOUND", "a padded SHA is still a SHA");
  const newlinePadded = await runCheckpoint({ commit: `\n${ABSENT_SHA}\n` });
  assert.equal(newlinePadded.error.code, "COMMIT_NOT_FOUND", "trim removes a leading newline too");
});

test("a well-formed run branch that does not exist fails closed as REF_NOT_FOUND", async () => {
  // The commit must be real, or the commit gate is reached first: the runner
  // checks the subject exists before it resolves the anchor, and REF_NOT_FOUND
  // is only observable once that gate is passed.
  const result = await runCheckpoint({ commit: REAL_SHA, ref: ABSENT_RUN_BRANCH });
  assert.equal(result.outcome, "REJECTED");
  assert.equal(result.error.code, "REF_NOT_FOUND");
  assert.equal(result.anchorRef, ABSENT_RUN_BRANCH);
  assert.equal(result.repositoryRoot, REPO_ROOT);
  assert.equal(result.worktreeCreated, false);
  assert.equal(result.checkpointStatus, null, "no engine run may start without a real anchor");
});

test("a commit that exists but is reachable from no branch fails closed", async () => {
  // `git commit-tree` creates a real commit object and writes no ref, no branch
  // and no worktree change, so this is the exact "unreferenced commit" case: it
  // resolves, so COMMIT_NOT_FOUND cannot catch it, and it is not an ancestor of
  // integration/final, so containment must.
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  const orphan = git([
    "-c", "user.name=M3.3 Test",
    "-c", "user.email=m33@test.invalid",
    "commit-tree", tree,
    "-m", "test: unreferenced commit, no ref points here",
  ]);
  assert.match(orphan, /^[0-9a-f]{40}$/);

  const result = await runCheckpoint({ commit: orphan });
  assert.equal(result.outcome, "REJECTED");
  assert.equal(result.error.code, "COMMIT_NOT_ANCESTOR");
  assert.equal(result.worktreeCreated, false);
  assert.equal(result.repositoryRoot, REPO_ROOT);

  // And the same commit is not accepted under a run-branch anchor either, but
  // only because the anchor is resolved first and does not exist.
  const anchored = await runCheckpoint({ commit: orphan, ref: ABSENT_RUN_BRANCH });
  assert.equal(anchored.error.code, "REF_NOT_FOUND", "the anchor must be resolved before containment");
});

test("a descendant of the anchor is accepted for containment, so the checks above are not vacuous", async () => {
  // The integration tip is by definition an ancestor of integration/final, so
  // the containment gate must let it through. That is proved by contrast: the
  // same commit, anchored on a ref that does not exist, fails at the REF gate,
  // which is only reachable because containment was not the blocker. The
  // positive end-to-end proof — that a contained commit really does reach a
  // worktree and the engine — is in checkpoint-flow.test.js.
  const orphan = (() => {
    const tree = git(["rev-parse", "HEAD^{tree}"]);
    return git([
      "-c", "user.name=M3.3 Test",
      "-c", "user.email=m33@test.invalid",
      "commit-tree", tree,
      "-m", "test: unreferenced commit, no ref points here",
    ]);
  })();

  const orphanResult = await runCheckpoint({ commit: orphan });
  assert.equal(orphanResult.error.code, "COMMIT_NOT_ANCESTOR");
  assert.equal(orphanResult.repositoryRoot, REPO_ROOT, "the orphan must have reached git");

  // REAL_SHA is contained in integration/final, so it cannot produce
  // COMMIT_NOT_ANCESTOR. Only the missing anchor can stop it.
  const containedUnderMissingAnchor = await runCheckpoint({ commit: REAL_SHA, ref: ABSENT_RUN_BRANCH });
  assert.equal(containedUnderMissingAnchor.error.code, "REF_NOT_FOUND");
  assert.equal(containedUnderMissingAnchor.anchorRef, ABSENT_RUN_BRANCH);
});
