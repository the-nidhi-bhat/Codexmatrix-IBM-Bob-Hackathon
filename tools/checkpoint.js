#!/usr/bin/env node
/**
 * tools/checkpoint.js
 *
 * Legacy Code Whisperer — Modernization Checkpoint Orchestrator (Milestone 3)
 *
 * Orchestrates the full Execute → Verify → Rollback → Recover workflow for a
 * single modernization commit that has already been applied to the branch.
 *
 * It does NOT re-implement validation or rollback logic. It delegates to:
 *   tools/validate.js   — behavioral safety-net runner
 *   tools/rollback.js   — safe git-revert rollback
 *
 * Usage:
 *   node tools/checkpoint.js <commit>
 *   node tools/checkpoint.js <commit> --result-file validation/last-checkpoint.json
 *   node tools/checkpoint.js --help
 *
 * Arguments:
 *   <commit>                 Required. The modernization commit to verify. It
 *                            must already be in the branch history (i.e. the
 *                            change has been applied and committed).
 *
 * Options:
 *   --result-file <path>     Write JSON result here (default:
 *                            validation/last-checkpoint.json).
 *   --help                   Print usage and exit.
 *
 * Workflow:
 *   1. READY       — initial state; safety checks passed
 *   2. VERIFYING   — running tools/validate.js
 *   3. VERIFIED    — validation passed; checkpoint is the new known-good
 *      OR
 *   3. VALIDATION_FAILED — validation failed; proceeding to rollback
 *   4. ROLLBACK_STARTED  — invoking tools/rollback.js
 *   5. ROLLED_BACK       — rollback succeeded; source restored
 *   6. VERIFYING         — running tools/validate.js again (recovery check)
 *   7. RECOVERY_VERIFIED — recovery validation passed
 *      OR
 *   7. RECOVERY_FAILED   — recovery validation also failed
 *
 * Refusal states:
 *   REFUSED — pre-condition check failed; repository is NOT modified
 *
 * Exit codes:
 *   0   VERIFIED or RECOVERY_VERIFIED
 *   1   VALIDATION_FAILED with RECOVERY_VERIFIED (rollback succeeded)
 *   2   VALIDATION_FAILED with RECOVERY_FAILED  (rollback did not help)
 *   3   REFUSED or internal error
 *
 * Output schema (validation/last-checkpoint.json):
 *   {
 *     "status":                <final workflow state>,
 *     "modernizationStep":     <commit subject line>,
 *     "startingCommit":        <HEAD at the time validation was invoked>,
 *     "modernizationCommit":   <full hash of the modernization commit>,
 *     "branch":                <current branch name>,
 *     "validationResult":      <validate.js result object or null>,
 *     "rollbackResult":        <rollback.js result object or null>,
 *     "recoveryValidation":    <second validate.js result object or null>,
 *     "finalStatus":           <one-line human explanation>,
 *     "timestamp":             <ISO-8601 string>,
 *     "runtimeNote":           <server-restart note when applicable>
 *   }
 *
 * No new npm dependencies — only Node built-ins (child_process, fs, path).
 */

'use strict';

var spawnSync = require('child_process').spawnSync;
var execSync  = require('child_process').execSync;
var fs        = require('fs');
var path      = require('path');

var ROOT        = path.resolve(__dirname, '..');
var RESULT_DIR  = path.join(ROOT, 'validation');
var DEFAULT_OUT = path.join(RESULT_DIR, 'last-checkpoint.json');

var VALIDATE_SCRIPT = path.join(__dirname, 'validate.js');
var ROLLBACK_SCRIPT = path.join(__dirname, 'rollback.js');

var RUNTIME_NOTE =
  'Git restores source files only. If a server process is running with the ' +
  'previous code it must be restarted before recovery validation reflects the ' +
  'rolled-back source. In this tool\'s automated flow the validation suite ' +
  'launches a fresh server subprocess via Docker, so no manual restart is ' +
  'needed when using the Docker-based harness.';

// ── Parse arguments ───────────────────────────────────────────────────────────

var args           = process.argv.slice(2);
var targetCommit   = null;
var resultFile     = DEFAULT_OUT;

if (args.indexOf('--help') !== -1 || args.indexOf('-h') !== -1) {
  console.log([
    '',
    'Usage: node tools/checkpoint.js <commit> [--result-file <path>]',
    '',
    '  <commit>               Modernization commit already in branch history.',
    '  --result-file <path>   Write JSON result here (default:',
    '                         validation/last-checkpoint.json).',
    '',
    'Workflow:',
    '  1. Validate the current source tree.',
    '  2a. If PASS  → VERIFIED. Done.',
    '  2b. If FAIL  → rollback the modernization commit (git revert).',
    '       3. Validate again.',
    '          PASS  → RECOVERY_VERIFIED. Exit 1.',
    '          FAIL  → RECOVERY_FAILED.   Exit 2.',
    '',
    'Delegates to:',
    '  tools/validate.js   — behavioral safety-net runner',
    '  tools/rollback.js   — safe git-revert rollback',
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function currentBranch() {
  try { return run('git rev-parse --abbrev-ref HEAD'); }
  catch (e) { return '(unknown)'; }
}

function currentHead() {
  try { return run('git rev-parse HEAD'); }
  catch (e) { return null; }
}

function refuse(reason, partial) {
  var result = Object.assign({
    status:               'REFUSED',
    modernizationStep:    null,
    startingCommit:       currentHead(),
    modernizationCommit:  targetCommit || '(none)',
    branch:               currentBranch(),
    validationResult:     null,
    rollbackResult:       null,
    recoveryValidation:   null,
    finalStatus:          reason,
    timestamp:            timestamp,
    runtimeNote:          null
  }, partial || {});
  writeResult(result);
  console.error('[checkpoint] REFUSED: ' + reason);
  console.error('[checkpoint] Result written to: ' + resultFile);
  process.exit(3);
}

// ── Run validate.js as a child process ───────────────────────────────────────

function runValidation(label, outFile) {
  console.log('[checkpoint] ' + label + ': node tools/validate.js --result-file ' + outFile);
  console.log('');
  var r = spawnSync('node', [VALIDATE_SCRIPT, '--result-file', outFile], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8'
  });
  // read back the written JSON
  var result = null;
  try {
    result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } catch (e) {
    result = { status: 'FAIL', error: 'Could not read validation result: ' + e.message };
  }
  return result;
}

// ── Run rollback.js as a child process ────────────────────────────────────────

function runRollback(commit, outFile) {
  console.log('[checkpoint] ROLLBACK: node tools/rollback.js ' + commit + ' --result-file ' + outFile);
  console.log('');
  var r = spawnSync('node', [ROLLBACK_SCRIPT, commit, '--result-file', outFile], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8'
  });
  var result = null;
  try {
    result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } catch (e) {
    result = { status: 'FAILED', error: 'Could not read rollback result: ' + e.message };
  }
  return result;
}

// ── Pre-flight checks ─────────────────────────────────────────────────────────

if (!targetCommit) {
  refuse('No commit specified. Usage: node tools/checkpoint.js <commit>');
}

console.log('[checkpoint] Modernization commit : ' + targetCommit);
console.log('[checkpoint] Branch               : ' + currentBranch());
console.log('[checkpoint] Result file          : ' + resultFile);
console.log('');

// Check 1: working tree is clean
var statusOutput;
try { statusOutput = run('git status --porcelain'); }
catch (e) { refuse('Could not read git status: ' + e.message); }

if (statusOutput.length > 0) {
  refuse(
    'Working tree is not clean. Stash or commit changes before running a checkpoint.',
    { dirtyFiles: statusOutput.split('\n').filter(Boolean) }
  );
}

// Check 2: target commit exists and is an ancestor of HEAD
var fullHash, commitSubject;
try {
  fullHash      = run('git rev-parse ' + targetCommit);
  var objType   = run('git cat-file -t ' + fullHash);
  if (objType !== 'commit') throw new Error(fullHash + ' is a ' + objType);
  commitSubject = run('git log -1 --format=%s ' + fullHash);
} catch (e) {
  refuse('Commit ' + targetCommit + ' does not exist: ' + e.message);
}

try {
  run('git merge-base --is-ancestor ' + targetCommit + ' HEAD');
} catch (e) {
  refuse(
    'Commit ' + targetCommit + ' (' + commitSubject + ') is not an ancestor of HEAD. ' +
    'The modernization commit must already be applied to this branch.'
  );
}

console.log('[checkpoint] Commit found  : ' + fullHash.slice(0, 12) + ' — ' + commitSubject);
console.log('');

// Check 3: not the validation/rollback infrastructure
var PROTECTED_PREFIXES = ['feat(validation):', 'feat(rollback):'];
for (var p = 0; p < PROTECTED_PREFIXES.length; p++) {
  if (commitSubject.indexOf(PROTECTED_PREFIXES[p]) === 0) {
    refuse(
      'Commit ' + targetCommit + ' (' + commitSubject + ') is the validation/rollback ' +
      'infrastructure. Checkpointing it would risk rolling back the safety net itself.'
    );
  }
}

var startingCommit = currentHead();

// ── Temp file paths for sub-tool results ──────────────────────────────────────

var valTmpFile  = path.join(RESULT_DIR, 'cp-validation-tmp.json');
var rbTmpFile   = path.join(RESULT_DIR, 'cp-rollback-tmp.json');
var recTmpFile  = path.join(RESULT_DIR, 'cp-recovery-tmp.json');

// ── PHASE 1: Validate ─────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════');
console.log('[checkpoint] PHASE 1: VERIFYING modernization commit');
console.log('  ' + fullHash.slice(0, 12) + ' — ' + commitSubject);
console.log('══════════════════════════════════════════════════════');
console.log('');

var validationResult = runValidation('VERIFYING', valTmpFile);

if (validationResult.status === 'PASS') {
  // ── HAPPY PATH ──────────────────────────────────────────────────────────────
  var result = {
    status:               'VERIFIED',
    modernizationStep:    commitSubject,
    startingCommit:       startingCommit,
    modernizationCommit:  fullHash,
    branch:               currentBranch(),
    validationResult:     validationResult,
    rollbackResult:       null,
    recoveryValidation:   null,
    finalStatus:          'Modernization commit verified. All ' + validationResult.passed + ' behavioral tests pass. ' +
                          'Commit ' + fullHash.slice(0, 12) + ' is the new known-good checkpoint.',
    timestamp:            timestamp,
    runtimeNote:          null
  };
  writeResult(result);

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('Checkpoint status : VERIFIED');
  console.log('  commit          : ' + fullHash.slice(0, 12) + ' — ' + commitSubject);
  console.log('  tests passed    : ' + validationResult.passed);
  console.log('  tests failed    : ' + validationResult.failed);
  console.log('  saved           : ' + resultFile);
  console.log('══════════════════════════════════════════════════════');
  process.exit(0);
}

// ── FAILURE PATH ───────────────────────────────────────────────────────────────

console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('[checkpoint] PHASE 2: VALIDATION FAILED — starting rollback');
console.log('══════════════════════════════════════════════════════');
console.log('');

var rollbackResult = runRollback(fullHash, rbTmpFile);

if (rollbackResult.status !== 'ROLLED_BACK') {
  // Rollback itself failed or was refused
  var result = {
    status:               'VALIDATION_FAILED',
    modernizationStep:    commitSubject,
    startingCommit:       startingCommit,
    modernizationCommit:  fullHash,
    branch:               currentBranch(),
    validationResult:     validationResult,
    rollbackResult:       rollbackResult,
    recoveryValidation:   null,
    finalStatus:          'Validation failed AND rollback was refused/failed. Manual intervention required. ' +
                          'Rollback reason: ' + (rollbackResult.reason || '(unknown)'),
    timestamp:            timestamp,
    runtimeNote:          RUNTIME_NOTE
  };
  writeResult(result);

  console.error('');
  console.error('[checkpoint] ERROR: Rollback was not completed: ' + (rollbackResult.status) + ' — ' + (rollbackResult.reason || ''));
  console.error('[checkpoint] Manual intervention required.');
  console.error('[checkpoint] Result written to: ' + resultFile);
  process.exit(3);
}

// ── PHASE 3: Recovery validation ──────────────────────────────────────────────

console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('[checkpoint] PHASE 3: RECOVERY VALIDATION');
console.log('[checkpoint] NOTE: ' + RUNTIME_NOTE);
console.log('══════════════════════════════════════════════════════');
console.log('');

var recoveryResult = runValidation('RECOVERY VERIFYING', recTmpFile);

var finalStatus;
var finalState;
var exitCode;

if (recoveryResult.status === 'PASS') {
  finalState  = 'RECOVERY_VERIFIED';
  exitCode    = 1;
  finalStatus = 'Modernization commit ' + fullHash.slice(0, 12) + ' failed validation (' +
                validationResult.failed + ' test(s) failed). ' +
                'Rolled back via revert commit ' + (rollbackResult.revertCommit || '(unknown)').slice(0, 12) + '. ' +
                'Recovery validation: PASS (' + recoveryResult.passed + '/' + recoveryResult.total + '). ' +
                'The modernization step should not be retried unchanged.';
} else {
  finalState  = 'RECOVERY_FAILED';
  exitCode    = 2;
  finalStatus = 'Modernization commit ' + fullHash.slice(0, 12) + ' failed validation. ' +
                'Rollback was applied but recovery validation ALSO failed (' +
                recoveryResult.failed + ' test(s) failed). ' +
                'Manual investigation required.';
}

var result = {
  status:               finalState,
  modernizationStep:    commitSubject,
  startingCommit:       startingCommit,
  modernizationCommit:  fullHash,
  branch:               currentBranch(),
  validationResult:     validationResult,
  rollbackResult:       rollbackResult,
  recoveryValidation:   recoveryResult,
  finalStatus:          finalStatus,
  timestamp:            timestamp,
  runtimeNote:          RUNTIME_NOTE
};
writeResult(result);

console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('Checkpoint status : ' + finalState);
console.log('  original commit : ' + fullHash.slice(0, 12) + ' — ' + commitSubject);
console.log('  validation      : FAIL (' + validationResult.failed + ' test(s) failed)');
console.log('  revert commit   : ' + (rollbackResult.revertCommit || '(unknown)').slice(0, 12));
console.log('  recovery        : ' + recoveryResult.status +
            ' (' + recoveryResult.passed + '/' + recoveryResult.total + ' passed)');
console.log('  saved           : ' + resultFile);
console.log('══════════════════════════════════════════════════════');

process.exit(exitCode);
