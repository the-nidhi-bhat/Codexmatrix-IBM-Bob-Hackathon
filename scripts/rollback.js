#!/usr/bin/env node
/**
 * scripts/rollback.js
 *
 * Legacy Code Whisperer — Rollback Mechanism
 *
 * Reads the current validation result, and if the status is FAIL or ERROR,
 * performs a `git revert HEAD --no-edit`, then re-runs validation to confirm
 * the rollback restored a passing state.  Every action is appended to an
 * append-only audit log (rollback-audit.json) so the operation is auditable.
 *
 * Usage:
 *   node scripts/rollback.js
 *   node scripts/rollback.js --result validation-result.json   # default path
 *   node scripts/rollback.js --audit  rollback-audit.json      # default path
 *   node scripts/rollback.js --dry-run                         # no git changes
 *
 * Exit codes:
 *   0  rollback not needed (tests were already passing), OR rollback succeeded
 *      and post-rollback validation confirmed all tests pass
 *   1  rollback was performed but post-rollback validation still FAIL/ERROR
 *   2  internal error
 *
 * Audit log format (JSON array, append-only):
 * [
 *   {
 *     "timestamp": "2026-09-26T19:00:00.000Z",
 *     "trigger":   "FAIL",           // "FAIL" | "ERROR" — why rollback fired
 *     "targetCommit": "<sha>",        // the commit that was reverted
 *     "revertCommit": "<sha>",        // the revert commit created
 *     "dryRun":    false,
 *     "postValidation": { ...result } // full post-rollback validation result
 *     "outcome":   "ROLLBACK_OK"      // "ROLLBACK_OK" | "ROLLBACK_FAILED" | "DRY_RUN"
 *   }
 * ]
 */

'use strict';

var path     = require('path');
var fs       = require('fs');
var execSync = require('child_process').execSync;

var ROOT          = path.resolve(__dirname, '..');
var DEFAULT_RESULT = path.join(ROOT, 'validation-result.json');
var DEFAULT_AUDIT  = path.join(ROOT, 'rollback-audit.json');
var VALIDATE_SCRIPT = path.join(__dirname, 'validate.js');

// --- CLI args -----------------------------------------------------------------
var args = process.argv.slice(2);
var resultPath = DEFAULT_RESULT;
var auditPath  = DEFAULT_AUDIT;
var dryRun     = false;

for (var i = 0; i < args.length; i++) {
  if (args[i] === '--result' && args[i + 1]) { resultPath = path.resolve(args[++i]); }
  else if (args[i] === '--audit'  && args[i + 1]) { auditPath  = path.resolve(args[++i]); }
  else if (args[i] === '--dry-run') { dryRun = true; }
}

// --- Audit log ----------------------------------------------------------------
function readAudit() {
  if (!fs.existsSync(auditPath)) return [];
  try { return JSON.parse(fs.readFileSync(auditPath, 'utf8')); } catch (e) { return []; }
}

function appendAudit(entry) {
  var log = readAudit();
  log.push(entry);
  fs.writeFileSync(auditPath, JSON.stringify(log, null, 2) + '\n', 'utf8');
}

// --- Git helpers --------------------------------------------------------------
function gitHead() {
  return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
}

function gitRevertHead() {
  // Creates a revert commit; does NOT push.
  execSync('git revert HEAD --no-edit', { cwd: ROOT, stdio: 'inherit' });
  return gitHead();
}

// --- Validation re-run -------------------------------------------------------
function runValidation(tmpPath) {
  // Re-run the validation script and return the parsed result.
  var execFileSync = require('child_process').execFileSync;
  try {
    execFileSync(
      process.execPath,
      [VALIDATE_SCRIPT, '--output', tmpPath],
      { cwd: ROOT, stdio: 'inherit' }
    );
  } catch (e) {
    // exit code != 0 means FAIL — still read the result file
  }
  if (!fs.existsSync(tmpPath)) return { status: 'ERROR', passed: 0, failed: 0, skipped: 0, total: 0 };
  try { return JSON.parse(fs.readFileSync(tmpPath, 'utf8')); } catch (e2) {
    return { status: 'ERROR', passed: 0, failed: 0, skipped: 0, total: 0 };
  }
}

// --- Main ---------------------------------------------------------------------
function main() {
  var now = new Date();
  console.log('=== Legacy Code Whisperer — Rollback Check ===');
  console.log('Time:    ' + now.toISOString());
  if (dryRun) console.log('Mode:    DRY-RUN (no git changes will be made)');

  // 1. Read the current validation result
  if (!fs.existsSync(resultPath)) {
    console.error('ERROR: No validation result found at ' + resultPath);
    console.error('Run `node scripts/validate.js` first.');
    process.exit(2);
  }

  var result;
  try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); }
  catch (e) { console.error('ERROR: Could not parse ' + resultPath + ': ' + e.message); process.exit(2); }

  console.log('Result:  ' + result.status + '  (' + result.passed + ' passed, ' + result.failed + ' failed, ' + result.skipped + ' skipped / ' + result.total + ' total)');
  console.log('Commit:  ' + result.commit);
  console.log('Branch:  ' + result.branch);
  console.log('----------------------------------------------');

  // 2. If PASS — nothing to roll back
  if (result.status === 'PASS') {
    console.log('✓ Validation passed — no rollback needed.');
    process.exit(0);
  }

  // 3. FAIL or ERROR — rollback warranted
  console.log('✗ Validation ' + result.status + ' — rollback required.');

  var targetCommit = result.commit;
  var entry = {
    timestamp:   now.toISOString(),
    trigger:     result.status,
    targetCommit: targetCommit,
    revertCommit: null,
    dryRun:      dryRun,
    postValidation: null,
    outcome:     null
  };

  if (dryRun) {
    console.log('DRY-RUN: would revert commit ' + targetCommit);
    entry.outcome = 'DRY_RUN';
    appendAudit(entry);
    console.log('Audit:   ' + auditPath);
    process.exit(0);
  }

  // 4. Perform the revert
  console.log('Reverting commit ' + targetCommit + ' ...');
  var revertCommit;
  try {
    revertCommit = gitRevertHead();
    entry.revertCommit = revertCommit;
    console.log('Revert commit: ' + revertCommit);
  } catch (e) {
    console.error('ERROR: git revert failed: ' + e.message);
    entry.outcome = 'ROLLBACK_FAILED';
    appendAudit(entry);
    process.exit(2);
  }

  // 5. Re-run validation to confirm rollback succeeded
  console.log('----------------------------------------------');
  console.log('Re-running validation to confirm rollback ...');
  var tmpResult = path.join(ROOT, 'validation-result.json');
  var postResult = runValidation(tmpResult);
  entry.postValidation = postResult;

  if (postResult.status === 'PASS') {
    entry.outcome = 'ROLLBACK_OK';
    appendAudit(entry);
    console.log('----------------------------------------------');
    console.log('✓ Rollback succeeded — post-rollback validation PASS (' +
                postResult.passed + '/' + postResult.total + ')');
    console.log('Revert commit: ' + revertCommit);
    console.log('Audit:         ' + auditPath);
    process.exit(0);
  } else {
    entry.outcome = 'ROLLBACK_FAILED';
    appendAudit(entry);
    console.error('----------------------------------------------');
    console.error('✗ Post-rollback validation still ' + postResult.status +
                  ' (' + postResult.passed + '/' + postResult.total + ')');
    console.error('Manual intervention required. See audit: ' + auditPath);
    process.exit(1);
  }
}

main();
