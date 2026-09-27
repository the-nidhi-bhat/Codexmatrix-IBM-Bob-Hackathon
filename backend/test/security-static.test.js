"use strict";

/**
 * Static safety properties of the M3.3 control plane, asserted so a future
 * change cannot quietly remove them.
 *
 * These are source-level checks on purpose. The dynamic behaviour is covered by
 * the other files in this suite; what is left — "no shell interpolation in the
 * code this milestone owns", "no force delete anywhere", "the server binds
 * loopback only", "no secret is tracked" — is a property of the code as
 * written, and code as written is what this asserts.
 *
 * Every scan strips comments first, preserving line numbers. That is not
 * cosmetic: the M3.3 files carry long explanatory headers that MENTION `exec`,
 * `--force`, `reset --hard` and `command`, and a check that reads documentation
 * as code reports every honest comment as a violation. Prose is also excluded
 * from the "forbidden command" checks by requiring each match to sit in a
 * command position — immediately after a quote or an array bracket — so
 * rollback.js's own message, "No force-push. No reset --hard.", is not mistaken
 * for a reset.
 *
 * The `--force` checks are deliberately NOT a blanket ban. Two
 * `git worktree remove --force` calls are legitimate and load-bearing: a run
 * killed mid-revert can leave its worktree dirty, and refusing to remove it
 * would leak a worktree rather than contain it. Removing a WORKTREE destroys
 * nothing — a scratch copy goes. A force on a BRANCH, or any `reset --hard`,
 * does destroy work, and each is asserted separately, with a test name that
 * says which is which, so a reader never has to infer the distinction.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { REPO_ROOT } = require("./helpers");

/** The code this milestone owns and is therefore allowed to change. */
const OWNED_PREFIXES = ["backend/src/", "frontend/src/"];
/** Everything audited, including the existing engine in tools/. */
const AUDITED_PREFIXES = ["backend/src/", "frontend/src/", "tools/", "legacy/"];

/**
 * Blank out comments, keeping every character position and every newline, so a
 * reported line number still points at the right line.
 *
 * The line-comment rule skips a `//` preceded by `:` so a URL inside a string is
 * not treated as a comment. That is a heuristic, and it is enough here because
 * the corpus is this repository's own sources.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (match, lead) => lead + match.slice(lead.length).replace(/./g, " "));
}

/** Does this index sit where a command or an argument would sit? */
function isCommandPosition(text, index) {
  let i = index - 1;
  for (; i >= 0 && /\s/.test(text[i]); i -= 1) {
    /* skip whitespace back to the delimiter */
  }
  return i >= 0 && ['"', "'", "`", "[", ",", "("].includes(text[i]);
}

function loadSources(prefixes) {
  const listed = execFileSync("git", ["ls-files", "--", ...prefixes], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(line));

  return listed.map((relative) => {
    const raw = fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
    const code = stripComments(raw);
    return {
      relative,
      raw,
      code,
      lines: code.split("\n"),
      find(predicate) {
        return code.split("\n").findIndex((line) => predicate(line)) + 1;
      },
    };
  });
}

const OWNED = loadSources(OWNED_PREFIXES);
const AUDITED = loadSources(AUDITED_PREFIXES);

/** Every code line matching `pattern`, in command position. */
function codeOccurrences(sources, pattern, { commandPosition = false } = {}) {
  const found = [];
  for (const source of sources) {
    for (let i = 0; i < source.lines.length; i += 1) {
      const line = source.lines[i];
      for (const match of line.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
        if (commandPosition && !isCommandPosition(line, match.index)) continue;
        found.push({ file: source.relative, line: i + 1, text: line.trim(), match: match[0] });
      }
    }
  }
  return found;
}

const describe = (hits) => hits.map((h) => `${h.file}:${h.line} ${h.text}`);

test("the audited file set is real, so none of these checks are vacuous", () => {
  assert.ok(OWNED.length > 10, `expected a real owned file set, got ${OWNED.length}`);
  const audited = AUDITED.map((s) => s.relative);
  for (const required of [
    "tools/checkpoint.js",
    "tools/validate.js",
    "tools/rollback.js",
    "backend/src/checkpointRunner.ts",
    "backend/src/modernization/executor.ts",
    "backend/src/modernization/operations.ts",
    "backend/src/index.ts",
    "backend/src/routes/checkpoint.ts",
  ]) {
    assert.ok(audited.includes(required), `${required} must be audited`);
  }
  assert.ok(audited.some((f) => f.startsWith("frontend/src/")));
});

test("no code this milestone owns hands a command string to a shell", () => {
  // `shell: true` or a bare `exec` would make every argument list in the harness
  // a lie. There must be none, in code. Comments are excluded by stripComments.
  assert.deepEqual(describe(codeOccurrences(OWNED, /shell\s*:\s*true/)), [], "shell: true re-enables injection");
  assert.deepEqual(
    describe(codeOccurrences(OWNED, /(?<![.\w$])exec(?:Sync)?\s*\(/)),
    [],
    "exec/execSync run a shell; use execFile/spawn with an argument array",
  );
  // `eval` is only a call when it stands alone: operations.ts names the string
  // "node-expression-eval" in a commit message, and that is not an eval call.
  assert.deepEqual(
    describe(codeOccurrences(OWNED, /(?<![.\w$-])eval\s*\(/)),
    [],
    "eval of runtime text",
  );
  assert.deepEqual(describe(codeOccurrences(OWNED, /new\s+Function\s*\(/)), [], "new Function is eval");
});

test("the code we own spawns children with argument arrays, never interpolated commands", () => {
  const spawns = codeOccurrences(OWNED, /\b(?:execFile|execFileSync|spawn|spawnSync)\s*\(/);
  // Exactly one site: the engine spawn in the checkpoint runner. Every other
  // call in the code we own goes through the promisified execFile helper above
  // it, so this count is deliberately an exact one - if a second direct spawn
  // ever appears, it must be justified here rather than added quietly.
  assert.equal(spawns.length, 1, `expected the single direct child-process spawn, got:\n${describe(spawns)}`);
  assert.equal(spawns[0].file, "backend/src/checkpointRunner.ts");
  for (const spawn of spawns) {
    assert.equal(
      /\$\{/.test(spawn.text),
      false,
      `string interpolation into a spawn: ${spawn.file}:${spawn.line} ${spawn.text}`,
    );
  }
  // And the helper it wraps is not a shell: one call, argument array, no shell.
  const helpers = codeOccurrences(OWNED, /promisify\(\s*(?:execFile|spawn)/);
  assert.ok(helpers.length > 0, "expected the promisified safe helper to still be in place");
  for (const helper of helpers) {
    assert.equal(
      /\$\{/.test(helper.text),
      false,
      `string interpolation into a promisified helper: ${helper.file}:${helper.line}`,
    );
  }
});

test("the engine spawn in the checkpoint runner is explicitly shell-free", () => {
  const runner = OWNED.find((s) => s.relative === "backend/src/checkpointRunner.ts");
  assert.match(runner.code, /spawn\(/, "the runner spawns the engine");
  assert.match(runner.code, /shell\s*:\s*false/, "and says so explicitly");
  // The engine is node plus a script path built from the verified worktree.
  assert.match(runner.code, /path\.join\([^)]*"tools"\s*,\s*"checkpoint\.js"/);
  // And it is the only thing ever spawned: no shell, no user-supplied binary.
  assert.deepEqual(
    describe(codeOccurrences(OWNED, /\bspawn(?:Sync)?\s*\(/) .filter((h) => h.file !== "backend/src/checkpointRunner.ts")),
    [],
    "only the checkpoint runner may spawn a child",
  );
});

test("FORCE ALLOWED: the only --force in the code removes a scratch worktree", () => {
  const forced = codeOccurrences(AUDITED, /--force/, { commandPosition: true });
  assert.ok(forced.length > 0, "expected the worktree cleanup force to still be present");
  for (const hit of forced) {
    assert.ok(
      /worktree/.test(hit.text) && /remove/.test(hit.text),
      `--force outside a worktree removal: ${hit.file}:${hit.line} ${hit.text}`,
    );
    assert.equal(
      /["'`]branch["'`]/.test(hit.text),
      false,
      `--force on a branch destroys work: ${hit.file}:${hit.line} ${hit.text}`,
    );
  }
  // Both runners clean up a worktree, so both are expected. Named, so that
  // removing one is a visible change to this test rather than a silent one.
  assert.equal(
    forced.filter((f) => f.file === "backend/src/checkpointRunner.ts").length,
    1,
    "the checkpoint runner force-removes a dirty worktree once",
  );
  assert.equal(
    forced.filter((f) => f.file === "backend/src/modernization/executor.ts").length,
    1,
    "the executor force-removes a dirty worktree once",
  );
});

test("FORBIDDEN: no force-deletes a branch, no reset --hard, no clean -f, no force push", () => {
  // Each of these can destroy a teammate's or a run's work. Command position is
  // required, so a refusal MESSAGE that names them is not a violation.
  for (const [label, pattern] of [
    ["a forced branch delete", /branch\s+[^\n]{0,20}?-D\b/],
    ["branch --delete --force", /--delete["'\]]?\s*,\s*["'`]--force/],
    ["git reset --hard", /reset\s+--hard\b/],
    ["git checkout --force", /checkout\s+[^\n]{0,30}?--force\b/],
    ["git clean -f", /clean\s+-[a-z]*f/],
    ["a force push", /push\s+(?:[^\n]{0,30}?\s)?--force(?!-with-lease)/],
    ["a plumbing branch delete", /update-ref\s+-d\s+refs\/heads/],
  ]) {
    const hits = codeOccurrences(AUDITED, pattern, { commandPosition: true });
    assert.deepEqual(describe(hits), [], `found ${label}, which can destroy uncommitted or unrecoverable work`);
  }
});

test("the rollback engine is a git revert, and it is the pre-existing engine's own shape", () => {
  const rollback = AUDITED.find((s) => s.relative === "tools/rollback.js");
  assert.match(rollback.code, /git\s+revert/);
  // Its own printed contract says so, and that string is not a reset:
  assert.match(rollback.raw, /No force-push\. No reset --hard\./);
  assert.deepEqual(
    describe(codeOccurrences([rollback], /reset\s+--hard\b/, { commandPosition: true })),
    [],
    "the word reset appears only in the promise that rollback never does one",
  );
});

test("KNOWN LIMITATION, unchanged by M3.3: the engine composes one git command as a string", () => {
  // tools/rollback.js line ~235 runs `git revert --no-edit <sha>` by string
  // concatenation. It is not reachable with attacker input — the SHA arrives
  // through runCheckpoint's 40-hex check — and the engine is explicitly out of
  // M3.3's scope, so it is left alone and recorded here instead of being
  // quietly excluded from the shell checks above. A future milestone should
  // convert it to execFileSync with an argument array.
  const rollback = AUDITED.find((s) => s.relative === "tools/rollback.js");
  const composed = codeOccurrences([rollback], /run\(\s*["'`]git\s+\w+[^\n]*["'`]\s*\+/);
  assert.ok(
    composed.length > 0,
    "if the engine is ever converted to argument arrays, update this test and the report",
  );
  assert.ok(
    composed.some((hit) => /revert/.test(hit.text)),
    `expected the revert to be among the composed commands, saw:\n${describe(composed)}`,
  );
  // Every composed command in the engine interpolates either targetCommit, the
  // SHA argv validated before the engine was spawned, or fullHash, which the
  // engine itself derives from it by `git rev-parse`. Nothing else is ever
  // concatenated into a command.
  for (const hit of composed) {
    assert.ok(
      /\+\s*(?:targetCommit|fullHash)\s*[,)\s;}]/.test(hit.text),
      `composed a git command from something other than the validated SHA: ${hit.text}`,
    );
  }
  assert.match(
    rollback.code,
    /fullHash\s*=\s*run\(\s*["'`]git rev-parse ["'`]\s*\+\s*targetCommit/,
    "fullHash must be derived from targetCommit by git, never from a caller",
  );
});

test("the backend binds loopback only and does not allow any origin", () => {
  // src/app.ts holds the pipeline since the integration milestone: index.ts only
  // listens. Reading index.ts here would have gone on passing after the config
  // moved, which is the failure mode this assertion exists to prevent.
  const app = OWNED.find((s) => s.relative === "backend/src/app.ts");
  assert.ok(app, "src/app.ts must exist and own the request pipeline");
  // The bind lives with the listen call, in index.ts; the pipeline lives in
  // app.ts. Reading either from the other is how a check goes on passing after
  // the code moved, which is the failure this assertion exists to prevent.
  const entry = OWNED.find((s) => s.relative === "backend/src/index.ts");
  assert.match(entry.code, /listen\(\s*PORT\s*,\s*["']127\.0\.0\.1["']/, "the server must not listen on every interface");
  assert.deepEqual(
    describe(codeOccurrences(OWNED, /listen\(\s*0\.0\.0\.0/)),
    [],
    "a bare 0.0.0.0 listen is the thing to avoid",
  );
  assert.deepEqual(
    describe(codeOccurrences(OWNED, /origin\s*:\s*["'`]?\*["'`]?/)),
    [],
    "CORS must not be a wildcard",
  );
  for (const devOrigin of ["http://localhost:5173", "http://localhost:4173"]) {
    assert.ok(app.raw.includes(devOrigin), `expected the dev origin ${devOrigin} in the allowlist`);
  }
  // A body limit is a trust boundary, not a tuning knob.
  assert.match(app.code, /json\(\s*\{\s*limit\s*:/);
});

test("a malformed or over-sized body is answered in the API envelope, never as HTML", () => {
  // body-parser's default failure is an HTML error page. A client that parses
  // every response as {success, error} would break on it, and the page echoes
  // request content back — this API never echoes input.
  const app = OWNED.find((s) => s.relative === "backend/src/app.ts");
  assert.match(app.code, /entity\.parse\.failed/, "a JSON parse failure must be restated");
  assert.match(app.code, /entity\.too\.large/, "an over-sized body must be restated");
  assert.match(app.code, /MALFORMED_BODY/);
  assert.match(app.code, /BODY_TOO_LARGE/);
  // The parser's own message is not forwarded: it quotes the request.
  assert.equal(/err\.message/.test(app.code), false, "never forward the body parser's message");
  assert.equal(/error\.message/.test(app.code), false, "never forward the body parser's message");
});

test("the checkpoint runner takes no root, path or command from a caller", () => {
  const runner = OWNED.find((s) => s.relative === "backend/src/checkpointRunner.ts");
  assert.match(runner.code, /rev-parse",\s*"--show-toplevel/);

  // The options interface, extracted by line so the body cannot over-capture.
  const start = runner.lines.findIndex((line) => line.includes("export interface RunCheckpointOptions {"));
  assert.notEqual(start, -1, "RunCheckpointOptions must exist");
  const body = [];
  for (let i = start + 1; i < runner.lines.length; i += 1) {
    if (runner.lines[i].trim() === "}") break;
    body.push(runner.lines[i]);
  }
  const fields = body.join("\n");
  for (const accepted of ["commit", "ref", "timeoutMs"]) {
    assert.match(fields, new RegExp(`\\b${accepted}\\??:`), `${accepted} must still be accepted`);
  }
  for (const forbidden of ["root", "cwd", "repositoryRoot", "path", "command", "executable", "shell", "branch", "anchorRef"]) {
    assert.equal(
      new RegExp(`\\b${forbidden}\\??:`).test(fields),
      false,
      `RunCheckpointOptions must not accept ${forbidden}`,
    );
  }
});

test("the executor resolves its own root too", () => {
  const executor = OWNED.find((s) => s.relative === "backend/src/modernization/executor.ts");
  assert.match(executor.code, /rev-parse",\s*"--show-toplevel/);
});

test("no credential material is tracked", () => {
  // Scanned over the tracked file list, so an untracked secret on disk is a
  // different and legitimate thing: it is not being committed.
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const forbidden of [/\.env(\.|$)/, /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /id_rsa$/i, /\.npmrc$/]) {
    const hit = tracked.filter((f) => forbidden.test(f));
    assert.deepEqual(hit, [], `a credential-shaped file is tracked: ${hit.join(", ")}`);
  }

  const contentPatterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a PEM private key"],
    [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
    [/\bghp_[A-Za-z0-9]{36}\b/, "a GitHub personal access token"],
    [/\bsk-[A-Za-z0-9]{32,}\b/, "an OpenAI-style secret key"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "a Slack token"],
  ];
  for (const source of AUDITED) {
    for (const [pattern, label] of contentPatterns) {
      assert.equal(pattern.test(source.raw), false, `${label} in ${source.relative}`);
    }
  }
});

test("the demo fixtures that look like credentials are a decision, not an omission", () => {
  // Named explicitly so this is on the record. The frontend mock data describes
  // a hypothetical auth workflow in prose — "rejects invalid password", "token
  // generation paths" — it holds no credential material, and it is dead code
  // nothing imports. Turning it into a security issue would be inventing a
  // problem; deleting it is out of M3.3's scope.
  const mocks = ["frontend/src/workflow/mockWorkflow.ts", "frontend/src/workflow/mockData.ts"].filter((f) =>
    fs.existsSync(path.join(REPO_ROOT, f)),
  );
  assert.ok(mocks.length > 0, "expected the mock fixtures to still be present, or this test is vacuous");
  for (const relative of mocks) {
    const text = fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
    for (const [pattern, label] of [
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a PEM private key"],
      [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
      [/\bghp_[A-Za-z0-9]{36}\b/, "a GitHub personal access token"],
    ]) {
      assert.equal(pattern.test(text), false, `${label} in ${relative}`);
    }
  }
  // And they are genuinely unimported, which is why this can be about the words.
  const importers = OWNED.filter(
    (s) => !/mock(?:Workflow|Data)\.ts$/.test(s.relative) && /from\s+["'][^"']*mock(?:Workflow|Data)["']/.test(s.raw),
  );
  assert.deepEqual(importers.map((s) => s.relative), [], "the mock fixtures must stay unimported");
});

test("the protected-path denylist covers the control plane, and every entry is lower case", () => {
  // Asserted statically as well as behaviourally, because a silently dropped
  // entry is a security regression no functional test would notice — and
  // because a MIXED-case entry is a real bug class that already shipped once
  // during this milestone: normalizeRelative lower-cases what it is given, so an
  // entry written `PLAN.md` compared "plan.md" to "PLAN.md", never matched, and
  // left the most obviously protected file in the repository unprotected.
  const operations = OWNED.find((s) => s.relative === "backend/src/modernization/operations.ts");
  const block = operations.code.match(/PROTECTED_PATHS[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(block, "PROTECTED_PATHS must be a frozen literal array");
  const entries = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const required of [
    "tools",
    "legacy",
    "validation",
    "backend",
    "ibm_bob",
    "bob_sessions",
    ".opencode",
    ".git",
    "plan.md",
    "assess.md",
  ]) {
    assert.ok(entries.includes(required), `PROTECTED_PATHS is missing ${required}`);
  }
  assert.deepEqual(
    entries.filter((e) => e !== e.toLowerCase()),
    [],
    "PROTECTED_PATHS entries must already be lower case, or they never match",
  );
  // The list must not quietly start blocking the work it exists to make safe.
  assert.equal(entries.includes("package.json"), false, "F-12 must stay able to edit the root package.json");
  assert.equal(entries.includes("server"), false, "the legacy app must stay modernizable");
});
