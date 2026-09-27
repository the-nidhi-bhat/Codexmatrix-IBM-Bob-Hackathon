"use strict";

/**
 * Finding 4: the validation runner must stay on `npm install`.
 *
 * The audit was right that `npm install` does not enforce the dependency lock.
 * The fix is not to switch to `npm ci`, because `npm ci` does not exist in the
 * runtime this tool validates in. node:6 ships npm 3.10.10; `npm ci` arrived in
 * npm 5.7.0 and no flag makes it available. Running it would turn every
 * validation run into a usage error, which is a false safety net — worse than
 * the original problem, because it would look like a failure to fix rather than
 * a decision.
 *
 * So the decision is locked in here, in three layers:
 *
 *   1. The command is asserted, so a well-meaning "let's use npm ci" edit fails
 *      a test instead of breaking every future validation run.
 *   2. The counter parser is unit-tested directly, because that arithmetic is
 *      what decides PASS versus FAIL, and a parser that reports 18/18 from
 *      output that never ran is exactly the kind of bug this suite exists to
 *      catch.
 *   3. A real run asserts the end-to-end contract: 18 of 18, in the container,
 *      against the actual legacy tree.
 *
 * The `npm ci` probe test is the reason this is not merely a comment: it proves
 * the premise of the whole decision is still true, rather than trusted.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { REPO_ROOT, dockerAvailable, gitAttempt } = require("./helpers");

const VALIDATE = path.join(REPO_ROOT, "tools", "validate.js");
const DOCKER = dockerAvailable();

function validateSource() {
  return fs.readFileSync(VALIDATE, "utf8");
}

/**
 * `parseCounters` is module-private in a Node-6-syntax file that runs its whole
 * main flow on require, so it cannot be imported. It is lifted out of the source
 * and evaluated in isolation: that keeps the production file untouched (it must
 * stay runnable by node 6) while still testing the real implementation rather
 * than a copy of it.
 */
function loadParseCounters() {
  const source = validateSource();
  const start = source.indexOf("function parseCounters");
  assert.notEqual(start, -1, "parseCounters must exist in tools/validate.js");
  const end = source.indexOf("\n}\n", start);
  assert.notEqual(end, -1, "parseCounters must be a complete function");
  const body = source.slice(start, end + 3);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return parseCounters;`)();
}

test("the validation command installs with npm install, never npm ci", () => {
  const source = validateSource();
  const command = source.match(/'npm[^']*run\.sh'/);
  assert.ok(command, "the harness invocation must still be present");
  assert.match(command[0], /npm install/, "the documented decision is npm install");
  assert.doesNotMatch(command[0], /npm ci\b/, "npm ci does not exist in node:6's npm 3.10.10");

  // The decision is only worth keeping if it is explained where the next reader
  // will look, which is the line they are about to edit.
  const commentStart = source.indexOf("var DOCKER_CMD");
  const explainingComment = source.slice(Math.max(0, commentStart - 2600), commentStart);
  assert.match(explainingComment, /3\.10\.10/, "the exact npm version must be recorded");
  assert.match(explainingComment, /5\.7\.0/, "the version that introduced npm ci must be recorded");
  assert.match(explainingComment, /npm-shrinkwrap\.json/, "the reproducibility artifact must be named");
});

test("the pinned container is node 6, the legacy runtime itself", () => {
  const source = validateSource();
  assert.match(source, /'node:6'/, "upgrading the image stops this being a legacy characterization target");
  assert.doesNotMatch(source, /'node:(?!6\b)\d+'/, "no other node image may be used");
  // The legacy tree is mounted at /app and the named volume carries node_modules,
  // so the host's own install is never used to judge the legacy app.
  assert.match(source, /'-v',\s*ROOT \+ ':\/app'/);
  assert.match(source, /'-v',\s*'get24-nm:\/app\/node_modules'/);
  assert.match(source, /'-w',\s*'\/app'/);
});

test("PREMISE: npm ci really is unavailable in the runtime this tool uses", (t) => {
  if (!DOCKER.ok) return t.skip(`docker unavailable: ${DOCKER.message}`);
  const probe = spawnSync(
    "docker",
    ["run", "--rm", "node:6", "bash", "-c", "npm ci"],
    { encoding: "utf8", windowsHide: true, timeout: 300_000 },
  );
  assert.notEqual(probe.status, 0, "npm ci must fail on node:6, or the decision needs revisiting");

  const version = spawnSync("docker", ["run", "--rm", "node:6", "bash", "-c", "npm --version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 300_000,
  });
  const npmVersion = version.stdout.trim();
  assert.match(npmVersion, /^3\./, `expected npm 3.x, got ${npmVersion}`);
  assert.match(npmVersion, /^3\.10\.10$/, `the comment must match reality, got ${npmVersion}`);
});

test("the counter parser only counts real harness summary lines", () => {
  const parseCounters = loadParseCounters();

  // Real shape, captured from a real run: 4 + 4 + 10 = 18.
  const real = [
    "# 4 tests, 4 passed, 0 failed, 0 skipped",
    "# 4 tests, 4 passed, 0 failed, 0 skipped",
    "# 10 tests, 10 passed, 0 failed, 0 skipped",
  ].join("\n");
  assert.deepEqual(parseCounters(real), { total: 18, passed: 18, failed: 0, skipped: 0 });

  // A failure must not be lost in the sum. The line is bare, exactly as the
  // harness prints it: a suite name after the '#' would not match at all.
  const withFailure = "# 10 tests, 9 passed, 1 failed, 0 skipped";
  assert.deepEqual(parseCounters(withFailure), { total: 10, passed: 9, failed: 1, skipped: 0 });
  // And a named variant is not counted, which is the parser's real blind spot:
  // an unanchored parse would happily total a suite label.
  assert.deepEqual(parseCounters("# http: 10 tests, 9 passed, 1 failed, 0 skipped"), {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  });

  // Prose that merely contains numbers must not be counted. This is the case
  // that matters: a summary line in an error message could otherwise inflate a
  // pass count, and PASS is decided on failed === 0.
  assert.deepEqual(parseCounters("expected 20 tests, 20 passed, 0 failed, 0 skipped but the run aborted"), {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  });
  assert.deepEqual(parseCounters(""), { total: 0, passed: 0, failed: 0, skipped: 0 });
  assert.deepEqual(parseCounters("npm ERR! code EUSAGE"), { total: 0, passed: 0, failed: 0, skipped: 0 });
});

test("the runner refuses to report PASS when the output proves nothing ran", () => {
  // The decision rule, stated directly: PASS requires a clean exit AND zero
  // failures, and an empty parse is zero failures, so the exit code is the only
  // thing standing between a crashed container and a green safety net. A child
  // that dies from a signal reports code null, and the tool maps that to 1.
  const source = validateSource();
  assert.match(source, /var exitCode = \(code === null\) \? 1 : code;/);
  assert.match(source, /status\s*= \(exitCode === 0 && counters\.failed === 0\) \? 'PASS' : 'FAIL'/);
  // And a spawn error is FAIL with a populated error field, never a silent pass.
  assert.match(source, /error:\s+err\.message/);
});

test("a real run validates the legacy tree in the container, 18 of 18", (t) => {
  if (!DOCKER.ok) return t.skip(`docker unavailable: ${DOCKER.message}`);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcw-validate-"));
  const resultFile = path.join(outDir, "result.json");
  try {
    const run = spawnSync(process.execPath, [VALIDATE, "--result-file", resultFile], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30 * 60 * 1000,
    });

    assert.equal(run.status, 0, `validation failed:\n${run.stdout}\n${run.stderr}`);
    const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));

    assert.equal(result.status, "PASS");
    assert.equal(result.failed, 0);
    assert.equal(result.total, 18, "the committed safety net is 18 tests");
    assert.equal(result.passed, 18);
    assert.equal(result.skipped, 0, "a skipped test is not a passing test");
    assert.equal(result.exitCode, 0);
    assert.equal(result.error, null);
    assert.match(result.command, /npm install/);
    assert.ok(result.timestamp, "a result without a timestamp is not an audit record");
    assert.ok(result.output.length > 0, "the raw output must be kept as evidence");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("the legacy tree the container validates is the committed one", () => {
  // The run above mounts REPO_ROOT. If the harness were missing, empty, or
  // uncommitted, the 18 could be 18 of nothing.
  const runSh = path.join(REPO_ROOT, "legacy", "get24-baseline", "tests", "run.sh");
  assert.ok(fs.existsSync(runSh), "the committed harness must exist");
  assert.match(fs.readFileSync(runSh, "utf8"), /http.*socket.*game-events/s);

  const tracked = execFileSync("git", ["ls-files", "--", "legacy/get24-baseline"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const suite of ["http.test.js", "socket.test.js", "game-events.test.js"]) {
    assert.ok(tracked.includes(path.posix.join("legacy/get24-baseline/tests", suite)), `${suite} must be committed`);
  }
  for (const support of ["run.sh", "harness.js", "preload.js", "xhr-shim.js"]) {
    assert.ok(
      tracked.includes(path.posix.join("legacy/get24-baseline/tests", support)),
      `${support} must be committed, or the 18 cannot run`,
    );
  }
  assert.ok(
    tracked.some((f) => /npm-shrinkwrap\.json$/.test(f)),
    "the reproducibility record must be committed alongside",
  );
  // The root lockfile must not be COMMITTED. A modern host npm's lockfile in a
  // node-6 tree is a different, wrong artifact, not a safety improvement — and
  // if the host has left one on disk untracked, that is fine and ignored, so the
  // assertion is on tracking, not on the file's existence.
  const trackedAtRoot = execFileSync("git", ["ls-files", "--", "package-lock.json", "npm-shrinkwrap.json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(trackedAtRoot, [], "no host-npm lockfile may be tracked at the repository root");
  if (fs.existsSync(path.join(REPO_ROOT, "package-lock.json"))) {
    assert.ok(
      gitAttempt(["check-ignore", "-q", "package-lock.json"]).ok,
      "a lockfile on disk must be gitignored, not merely untracked",
    );
  }
  assert.ok(fs.existsSync(path.join(REPO_ROOT, "legacy", "get24-baseline", "repro", "npm-shrinkwrap.json")));
});
