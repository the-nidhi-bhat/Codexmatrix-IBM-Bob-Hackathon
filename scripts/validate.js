#!/usr/bin/env node
/**
 * scripts/validate.js
 *
 * Runs the 18-test Get24 behavioral safety net (legacy/get24-baseline/tests/)
 * against the current working tree using the locally-installed Node runtime.
 *
 * Usage:
 *   node scripts/validate.js
 *   node scripts/validate.js --output validation-result.json   # default path
 *
 * Exit codes:
 *   0  all suites passed
 *   1  one or more tests failed (rollback warranted)
 *   2  internal error (could not run tests at all)
 *
 * Output  (--output path, default: validation-result.json):
 * {
 *   "timestamp":  "2026-09-26T19:00:00.000Z",
 *   "node":       "v24.21.0",
 *   "commit":     "<sha>",
 *   "branch":     "samrudhi/validation-rollback",
 *   "passed":     18,
 *   "failed":     0,
 *   "skipped":    0,
 *   "total":      18,
 *   "exitStatus": 0,
 *   "status":     "PASS",          // "PASS" | "FAIL" | "ERROR"
 *   "suites": [
 *     { "name": "http",        "passed": 4,  "failed": 0, "skipped": 0, "exitCode": 0 },
 *     { "name": "socket",      "passed": 4,  "failed": 0, "skipped": 0, "exitCode": 0 },
 *     { "name": "game-events", "passed": 10, "failed": 0, "skipped": 0, "exitCode": 0 }
 *   ],
 *   "rawOutput": "..."
 * }
 */

'use strict';

var path    = require('path');
var fs      = require('fs');
var spawn   = require('child_process').spawn;
var execSync = require('child_process').execSync;

var ROOT   = path.resolve(__dirname, '..');
var SUITES = ['http', 'socket', 'game-events'];

// --- CLI args -----------------------------------------------------------------
var args = process.argv.slice(2);
var outputPath = path.join(ROOT, 'validation-result.json');
for (var i = 0; i < args.length - 1; i++) {
  if (args[i] === '--output') {
    outputPath = path.resolve(args[i + 1]);
    i++;
  }
}

// --- Git helpers --------------------------------------------------------------
function gitInfo() {
  try {
    var commit = execSync('git rev-parse HEAD',        { cwd: ROOT }).toString().trim();
    var branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim();
    return { commit: commit, branch: branch };
  } catch (e) {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

// --- TAP-ish output parser ----------------------------------------------------
// Harness prints: "# N tests, P passed, F failed, S skipped"
var SUMMARY_RE = /^#\s+(\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+skipped/m;

function parseSummary(output) {
  var m = SUMMARY_RE.exec(output);
  if (!m) return null;
  return {
    total:   parseInt(m[1], 10),
    passed:  parseInt(m[2], 10),
    failed:  parseInt(m[3], 10),
    skipped: parseInt(m[4], 10)
  };
}

// --- Suite runner -------------------------------------------------------------
function runSuite(name) {
  return new Promise(function (resolve) {
    var testFile = path.join(ROOT, 'legacy', 'get24-baseline', 'tests', name + '.test.js');
    var out = '';
    var err = '';
    var child = spawn(process.execPath, [testFile], {
      cwd:   ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', function (d) { out += d; process.stdout.write(d); });
    child.stderr.on('data', function (d) { err += d; });
    child.on('close', function (code) {
      var summary = parseSummary(out) || { total: 0, passed: 0, failed: 0, skipped: 0 };
      resolve({
        name:     name,
        passed:   summary.passed,
        failed:   summary.failed,
        skipped:  summary.skipped,
        exitCode: code,
        output:   out,
        stderr:   err
      });
    });
  });
}

// --- Main ---------------------------------------------------------------------
function main() {
  var git = gitInfo();
  var start = new Date();
  console.log('=== Legacy Code Whisperer — Validation Run ===');
  console.log('Time:   ' + start.toISOString());
  console.log('Node:   ' + process.version);
  console.log('Commit: ' + git.commit);
  console.log('Branch: ' + git.branch);
  console.log('----------------------------------------------');

  // Run suites sequentially so port reuse is safe
  var suiteResults = [];
  var rawParts = [];

  function runNext(idx) {
    if (idx >= SUITES.length) return Promise.resolve();
    return runSuite(SUITES[idx]).then(function (result) {
      suiteResults.push(result);
      rawParts.push(result.output);
      if (result.stderr) rawParts.push('[stderr] ' + result.stderr);
      return runNext(idx + 1);
    });
  }

  return runNext(0).then(function () {
    var totals = suiteResults.reduce(function (acc, s) {
      acc.passed  += s.passed;
      acc.failed  += s.failed;
      acc.skipped += s.skipped;
      return acc;
    }, { passed: 0, failed: 0, skipped: 0 });

    var anyFailed = suiteResults.some(function (s) { return s.failed > 0 || s.exitCode !== 0; });
    var exitStatus = anyFailed ? 1 : 0;
    var status     = anyFailed ? 'FAIL' : 'PASS';

    var result = {
      timestamp:  start.toISOString(),
      node:       process.version,
      commit:     git.commit,
      branch:     git.branch,
      passed:     totals.passed,
      failed:     totals.failed,
      skipped:    totals.skipped,
      total:      totals.passed + totals.failed + totals.skipped,
      exitStatus: exitStatus,
      status:     status,
      suites:     suiteResults.map(function (s) {
        return {
          name:     s.name,
          passed:   s.passed,
          failed:   s.failed,
          skipped:  s.skipped,
          exitCode: s.exitCode
        };
      }),
      rawOutput:  rawParts.join('\n')
    };

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

    console.log('----------------------------------------------');
    console.log('Result: ' + status + '  (' + result.passed + ' passed, ' + result.failed + ' failed, ' + result.skipped + ' skipped / ' + result.total + ' total)');
    console.log('Written: ' + outputPath);

    process.exit(exitStatus);
  }).catch(function (err) {
    console.error('validate.js internal error:', err);

    var errorResult = {
      timestamp:  start.toISOString(),
      node:       process.version,
      commit:     git.commit,
      branch:     git.branch,
      passed:     0,
      failed:     0,
      skipped:    0,
      total:      0,
      exitStatus: 2,
      status:     'ERROR',
      suites:     [],
      rawOutput:  String(err)
    };
    fs.writeFileSync(outputPath, JSON.stringify(errorResult, null, 2) + '\n', 'utf8');
    process.exit(2);
  });
}

main();
