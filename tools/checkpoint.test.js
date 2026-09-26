#!/usr/bin/env node
/**
 * tools/checkpoint.test.js
 *
 * Legacy Code Whisperer — orchestration safety checks (Milestone 3)
 *
 * Verifies the paths of tools/checkpoint.js that can be checked quickly and
 * without mutating the repository:
 *
 *   - usage / --help
 *   - no commit given
 *   - dirty working tree                      (safety path C)
 *   - unknown commit
 *   - commit not in this branch's history
 *   - validation/rollback infrastructure      (safety path D)
 *
 * Every one of these must end in REFUSED with exit code 3 and leave the
 * repository untouched.
 *
 * The two paths that need the real Docker behavioral suite are verified by
 * running the tool for real, not by this script:
 *   A. PASS  : node tools/checkpoint.js <behavior-preserving commit>  -> VERIFIED
 *   B. FAIL  : node tools/checkpoint.js <controlled regression>       -> RECOVERY_VERIFIED
 * Recorded results: validation/README.md, bob_sessions/2026-09-26-execute-verify-rollback.md
 *
 * Usage:  node tools/checkpoint.test.js
 * Exit:   0 when every check passed, 1 otherwise.
 *
 * No new npm dependencies — only Node built-ins (child_process, fs, path).
 */

'use strict';

var spawnSync = require('child_process').spawnSync;
var fs       = require('fs');
var path     = require('path');

var ROOT         = path.resolve(__dirname, '..');
var CHECKPOINT   = path.join(__dirname, 'checkpoint.js');
var RESULT_FILE  = path.join(ROOT, 'validation', 'cp-selftest-tmp.json');
var DIRTY_PROBE  = path.join(ROOT, 'checkpoint-dirty-probe.tmp');
var BOGUS_COMMIT = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

function git(args) {
  var r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

function runCheckpoint(args) {
  if (fs.existsSync(RESULT_FILE)) { fs.unlinkSync(RESULT_FILE); }
  var r = spawnSync('node', [CHECKPOINT].concat(args, ['--result-file', RESULT_FILE]), {
    cwd: ROOT,
    encoding: 'utf8'
  });
  var result = null;
  try { result = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8')); } catch (e) { /* left null */ }
  return {
    code:   r.status,
    output: String(r.stdout) + String(r.stderr),
    result: result
  };
}

function isRefused(run, reasonPattern) {
  return run.code === 3 &&
         run.result !== null &&
         run.result.status === 'REFUSED' &&
         reasonPattern.test(run.result.finalStatus);
}

var passed = 0;
var failed = 0;

function check(name, fn) {
  var error = null;
  try { fn(); } catch (e) { error = e; }
  if (error) { failed++; console.log('not ok ' + (passed + failed) + ' - ' + name); console.log('  ' + error.message); }
  else       { passed++; console.log('ok ' + (passed + failed) + ' - ' + name); }
}

// ── usage ─────────────────────────────────────────────────────────────────────

check('--help prints usage and exits 0', function () {
  var r = spawnSync('node', [CHECKPOINT, '--help'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { throw new Error('exit ' + r.status); }
  if (r.stdout.indexOf('Usage: node tools/checkpoint.js') === -1) { throw new Error('no usage line'); }
});

check('no commit is refused', function () {
  var run = runCheckpoint([]);
  if (!isRefused(run, /No commit specified/)) { throw new Error('output: ' + run.output); }
});

// ── safety path C: dirty working tree ─────────────────────────────────────────

check('a dirty working tree is refused and left untouched', function () {
  var head = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(DIRTY_PROBE, 'untracked probe used by tools/checkpoint.test.js\n', 'utf8');
  try {
    var run = runCheckpoint([head]);
    if (!isRefused(run, /not clean/)) { throw new Error('output: ' + run.output); }
    if (run.result.dirtyFiles.join('\n').indexOf('checkpoint-dirty-probe.tmp') === -1) {
      throw new Error('probe file not listed in dirtyFiles: ' + JSON.stringify(run.result.dirtyFiles));
    }
  } finally {
    if (fs.existsSync(DIRTY_PROBE)) { fs.unlinkSync(DIRTY_PROBE); }
  }
  if (git(['status', '--porcelain']) !== '') { throw new Error('working tree left dirty'); }
});

// ── unknown commit ────────────────────────────────────────────────────────────

check('an unknown commit is refused', function () {
  var run = runCheckpoint([BOGUS_COMMIT]);
  if (!isRefused(run, /does not exist/)) { throw new Error('output: ' + run.output); }
});

// ── commit outside this branch's history ──────────────────────────────────────

check('a commit outside the branch history is refused', function () {
  var outside = null;
  git(['for-each-ref', '--format=%(objectname)', 'refs/heads/']).split('\n').some(function (sha) {
    if (!sha) { return false; }
    var isAncestor = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: ROOT }).status === 0;
    if (!isAncestor) { outside = sha; return true; }
    return false;
  });
  if (outside === null) {
    // Every local branch is merged into this one (integration branch), so no
    // branch tip qualifies. Manufacture a commit that is deliberately not in
    // this history: a child of HEAD that no ref points at. Nothing in the
    // repository, the index or the working tree is touched.
    var tree = git(['rev-parse', 'HEAD^{tree}']).trim();
    outside = git(['commit-tree', tree, '-p', 'HEAD', '-m',
      'test: dangling commit that is not in this branch history']).trim();
  }
  var run = runCheckpoint([outside]);
  if (!isRefused(run, /not an ancestor/)) { throw new Error('output: ' + run.output); }
});

// ── safety path D: infrastructure protection ─────────────────────────────────

check('the validation/rollback infrastructure cannot be checkpointed', function () {
  var log = git(['log', '-n', '100', '--format=%H %s']);
  var infra = null;
  log.split('\n').some(function (line) {
    var subject = line.slice(41);
    if (subject.indexOf('feat(validation):') === 0 || subject.indexOf('feat(rollback):') === 0) {
      infra = line.slice(0, 40);
      return true;
    }
    return false;
  });
  if (infra === null) { throw new Error('no feat(validation)/feat(rollback) commit in history'); }
  var run = runCheckpoint([infra]);
  if (!isRefused(run, /validation\/rollback infrastructure/)) { throw new Error('output: ' + run.output); }
});

console.log('# ' + (passed + failed) + ' tests, ' + passed + ' passed, ' + failed + ' failed, 0 skipped');
process.exit(failed === 0 ? 0 : 1);
