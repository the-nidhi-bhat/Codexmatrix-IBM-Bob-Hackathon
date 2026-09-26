#!/usr/bin/env node
/**
 * tools/rollback.js
 *
 * Legacy Code Whisperer — Safe Rollback Tool (Milestone 2)
 *
 * Rolls back a specific modernization commit using `git revert`, preserving the
 * full Git history. Does NOT run validation itself — call tools/validate.js
 * separately after rollback to confirm recovery.
 *
 * Usage:
 *   node tools/rollback.js <commit>
 *   node tools/rollback.js <commit> --result-file validation/last-rollback.json
 *   node tools/rollback.js --help
 *
 * Arguments:
 *   <commit>           Required. Full or abbreviated commit hash to revert.
 *                      Must be a modernization commit (not the validation
 *                      infrastructure itself).
 *
 * Options:
 *   --result-file <path>   Write JSON result to this path instead of the
 *                          default (validation/last-rollback.json).
 *   --help                 Print usage and exit.
 *
 * Exit codes:
 *   0   Rollback succeeded — a new revert commit was created.
 *   1   Rollback refused or failed — repository is unchanged.
 *
 * Output format (validation/last-rollback.json):
 *   {
 *     "status":             "ROLLED_BACK" | "REFUSED" | "FAILED",
 *     "targetCommit":       <hash being reverted>,
 *     "revertCommit":       <new commit hash created by revert, or null>,
 *     "branch":             <current branch name>,
 *     "reason":             <human-readable explanation>,
 *     "filesChanged":       <array of files that changed in the revert, or []>,
 *     "validationRequired": true,
 *     "runtimeNote":        "Git restores source files only. Restart any
 *                            running server before re-running validation.",
 *     "timestamp":          <ISO-8601 string>
 *   }
 *
 * Safety checks (in order):
 *   1. git is on PATH
 *   2. working tree is clean (refuse if dirty)
 *   3. target commit exists in the repo
 *   4. target commit is an ancestor of HEAD (in our history)
 *   5. target commit is not a validation/tooling-only commit
 *   6. git revert --no-edit succeeds
 *
 * If any check fails the tool exits 1 and writes a REFUSED result.
 * The repository is NOT modified on a REFUSED exit.
 *
 * No new npm dependencies — only Node built-ins (child_process, fs, path).
 */

'use strict';

var execSync = require('child_process').execSync;
var fs       = require('fs');
var path     = require('path');

var ROOT        = path.resolve(__dirname, '..');
var RESULT_DIR  = path.join(ROOT, 'validation');
var DEFAULT_OUT = path.join(RESULT_DIR, 'last-rollback.json');

// ── Parse arguments ──────────────────────────────────────────────────────────

var args       = process.argv.slice(2);
var targetCommit = null;
var resultFile   = DEFAULT_OUT;

if (args.indexOf('--help') !== -1 || args.indexOf('-h') !== -1) {
  console.log([
    '',
    'Usage: node tools/rollback.js <commit> [--result-file <path>]',
    '',
    '  <commit>               Modernization commit hash to revert.',
    '  --result-file <path>   Write JSON result here (default: validation/last-rollback.json).',
    '',
    'The tool runs safety checks before modifying anything:',
    '  - Working tree must be clean.',
    '  - Commit must exist and be an ancestor of HEAD.',
    '  - Commit must not be a validation/tooling-only change.',
    '',
    'Rollback uses: git revert --no-edit <commit>',
    'History is preserved. No force-push. No reset --hard.',
    ''
  ].join('\n'));
  process.exit(0);
}

for (var i = 0; i < args.length; i++) {
  if (args[i] === '--result-file' && args[i + 1]) {
    resultFile = path.resolve(args[i + 1]);
    i++;
  } else if (args[i][0] !== '-') {
    targetCommit = args[i];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

var timestamp = new Date().toISOString();

function run(cmd, opts) {
  return execSync(cmd, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts || {})).trim();
}

function writeResult(result) {
  if (!fs.existsSync(RESULT_DIR)) {
    fs.mkdirSync(RESULT_DIR, { recursive: true });
  }
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

function refuse(reason, extra) {
  var result = Object.assign({
    status:             'REFUSED',
    targetCommit:       targetCommit || '(none)',
    revertCommit:       null,
    branch:             currentBranch(),
    reason:             reason,
    filesChanged:       [],
    validationRequired: false,
    runtimeNote:        'No changes were made to the repository.',
    timestamp:          timestamp
  }, extra || {});
  writeResult(result);
  console.error('[rollback] REFUSED: ' + reason);
  console.error('[rollback] Result written to: ' + resultFile);
  process.exit(1);
}

function currentBranch() {
  try { return run('git rev-parse --abbrev-ref HEAD'); }
  catch (e) { return '(unknown)'; }
}

// ── Commits that must NEVER be rolled back via this tool ─────────────────────
// These are the validation infrastructure commits on this branch.
// Rolling them back would destroy the safety net itself.
var PROTECTED_COMMIT_SUBJECTS = [
  'feat(validation):',
  'feat(rollback):'
];

// ── Check: usage ─────────────────────────────────────────────────────────────

if (!targetCommit) {
  refuse('No commit specified. Usage: node tools/rollback.js <commit>');
}

console.log('[rollback] Target commit : ' + targetCommit);
console.log('[rollback] Branch        : ' + currentBranch());
console.log('[rollback] Result file   : ' + resultFile);
console.log('');

// ── Check 1: git is available ─────────────────────────────────────────────────

try {
  run('git --version');
} catch (e) {
  refuse('git is not available on PATH: ' + e.message);
}

// ── Check 2: working tree is clean ────────────────────────────────────────────

var statusOutput;
try {
  statusOutput = run('git status --porcelain');
} catch (e) {
  refuse('Could not read git status: ' + e.message);
}

if (statusOutput.length > 0) {
  refuse(
    'Working tree is not clean. Stash or commit your changes before rolling back.',
    { dirtyFiles: statusOutput.split('\n').filter(Boolean) }
  );
}

// ── Check 3: target commit exists ────────────────────────────────────────────

var fullHash, commitSubject, commitAuthor, commitDate;
try {
  // Use git rev-parse to resolve the short hash, then verify it's a commit
  // object with cat-file. Avoids '^{commit}' syntax which cmd.exe may mangle.
  fullHash = run('git rev-parse ' + targetCommit);
  var objType = run('git cat-file -t ' + fullHash);
  if (objType !== 'commit') {
    throw new Error(fullHash + ' is a ' + objType + ', not a commit');
  }
  commitSubject = run('git log -1 --format=%s ' + fullHash);
  commitAuthor  = run('git log -1 --format=%an ' + fullHash);
  commitDate    = run('git log -1 --format=%ci ' + fullHash);
} catch (e) {
  refuse('Commit ' + targetCommit + ' does not exist in this repository: ' + e.message);
}

console.log('[rollback] Commit found  : ' + fullHash.slice(0, 12) + ' — ' + commitSubject);

// ── Check 4: commit is an ancestor of HEAD ────────────────────────────────────

try {
  // git merge-base --is-ancestor exits 0 if it IS an ancestor, 1 if not
  run('git merge-base --is-ancestor ' + targetCommit + ' HEAD');
} catch (e) {
  refuse(
    'Commit ' + targetCommit + ' (' + commitSubject + ') is not an ancestor of HEAD. ' +
    'Only commits already in this branch\'s history can be reverted.'
  );
}

// ── Check 5: commit is not validation infrastructure ─────────────────────────

for (var p = 0; p < PROTECTED_COMMIT_SUBJECTS.length; p++) {
  if (commitSubject.indexOf(PROTECTED_COMMIT_SUBJECTS[p]) === 0) {
    refuse(
      'Commit ' + targetCommit + ' (' + commitSubject + ') is the validation/rollback ' +
      'infrastructure itself. Rolling it back would destroy the safety net. ' +
      'This must not be done via this tool.'
    );
  }
}

// ── All checks passed — perform the revert ───────────────────────────────────

console.log('[rollback] All safety checks passed. Performing: git revert --no-edit ' + targetCommit);
console.log('');

var revertOutput = '';
try {
  revertOutput = run('git revert --no-edit ' + targetCommit, { stdio: 'pipe' });
} catch (e) {
  // revert can fail if there are merge conflicts
  var result = {
    status:             'FAILED',
    targetCommit:       fullHash,
    revertCommit:       null,
    branch:             currentBranch(),
    reason:             'git revert failed (possibly a merge conflict): ' + e.message,
    filesChanged:       [],
    validationRequired: false,
    runtimeNote:        'The repository may be in a conflicted state. Run: git revert --abort',
    timestamp:          timestamp
  };
  writeResult(result);
  console.error('[rollback] FAILED: ' + e.message);
  console.error('[rollback] If git revert left conflicts, run: git revert --abort');
  console.error('[rollback] Result written to: ' + resultFile);
  process.exit(1);
}

// ── Capture the new revert commit hash ───────────────────────────────────────

var revertCommit;
try {
  revertCommit = run('git rev-parse HEAD');
} catch (e) {
  revertCommit = null;
}

// ── Capture files changed in the revert ──────────────────────────────────────

var filesChanged = [];
try {
  var diffOutput = run('git diff-tree --no-commit-id -r --name-only HEAD');
  filesChanged = diffOutput.split('\n').filter(Boolean);
} catch (e) {
  filesChanged = [];
}

// ── Write result ─────────────────────────────────────────────────────────────

var result = {
  status:             'ROLLED_BACK',
  targetCommit:       fullHash,
  revertCommit:       revertCommit,
  branch:             currentBranch(),
  reason:             'Reverted modernization commit: ' + commitSubject,
  originalAuthor:     commitAuthor,
  originalDate:       commitDate,
  filesChanged:       filesChanged,
  validationRequired: true,
  runtimeNote:        'Git restores source files only. If any server process was running ' +
                      'with the previous code, it must be restarted before re-running validation.',
  timestamp:          timestamp
};

writeResult(result);

// ── Human-readable summary ────────────────────────────────────────────────────

console.log(revertOutput);
console.log('──────────────────────────────────────');
console.log('Rollback result   : ' + result.status);
console.log('  reverted        : ' + fullHash.slice(0, 12) + ' — ' + commitSubject);
console.log('  revert commit   : ' + (revertCommit ? revertCommit.slice(0, 12) : '(unknown)'));
console.log('  branch          : ' + result.branch);
console.log('  files changed   : ' + (filesChanged.length > 0 ? filesChanged.join(', ') : '(none)'));
console.log('');
console.log('  NEXT STEP: run validation to confirm recovery:');
console.log('    node tools/validate.js');
console.log('');
console.log('  RUNTIME NOTE: ' + result.runtimeNote);
console.log('  saved           : ' + resultFile);
console.log('──────────────────────────────────────');

process.exit(0);
