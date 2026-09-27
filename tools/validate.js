#!/usr/bin/env node
/**
 * tools/validate.js
 *
 * Legacy Code Whisperer — Validation Runner (Milestone 1)
 *
 * Invokes the existing behavioral safety net inside the Node 6 Docker container
 * (the same command documented in PLAN.md and legacy/get24-baseline/tests/README.md)
 * and produces a structured JSON result plus a human-readable summary.
 *
 * Usage:
 *   node tools/validate.js
 *   node tools/validate.js --result-file validation/last-result.json
 *
 * Exit codes:
 *   0  all tests passed (PASS)
 *   1  one or more tests failed, or the runner itself errored (FAIL)
 *
 * Output format (validation/last-result.json):
 *   {
 *     "status":    "PASS" | "FAIL",
 *     "passed":    <number>,
 *     "failed":    <number>,
 *     "skipped":   <number>,
 *     "total":     <number>,
 *     "exitCode":  <number>,
 *     "command":   <string>,
 *     "timestamp": <ISO-8601 string>,
 *     "output":    <full stdout+stderr string>,
 *     "error":     <string | null>
 *   }
 *
 * No new npm dependencies — only Node built-ins (child_process, fs, path).
 */

'use strict';

var spawn   = require('child_process').spawn;
var fs      = require('fs');
var path    = require('path');

var ROOT     = path.resolve(__dirname, '..');
var RESULT_DIR  = path.join(ROOT, 'validation');
var DEFAULT_OUT = path.join(RESULT_DIR, 'last-result.json');

// ── Parse --result-file override ────────────────────────────────────────────
var resultFile = DEFAULT_OUT;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--result-file' && args[i + 1]) {
    resultFile = path.resolve(args[i + 1]);
    i++;
  }
}

// ── The validation command (exactly as documented in PLAN.md) ───────────────
// Why this is `npm install` and NOT `npm ci` (M3.3 audit finding 4)
//
// An independent audit correctly flagged that `npm install` does not enforce
// the dependency lock, so a changed transitive dependency could silently alter
// what the 18 tests run against while the result still reported "VERIFIED".
// The fix is NOT to switch to `npm ci`, because `npm ci` does not exist in this
// runtime. Verified empirically against the image this file uses:
//
//   docker run --rm node:6 bash -c "npm --version"  ->  3.10.10
//   docker run --rm node:6 bash -c "npm ci"        ->  exit 1, usage error
//
// `npm ci` was introduced in npm 5.7.0; node:6 ships npm 3.10.10, and no flag
// makes it available. Upgrading the container would stop this being a legacy
// characterization target, which is the entire purpose of the suite. On top of
// that `npm ci` needs a committed lockfile at /app: the root
// package-lock.json is deliberately NOT committed (.gitignore documents why — a
// lockfile from a modern host npm must never enter this tree), and npm 3 does
// not even write one. The reproducible reference install is captured the old
// way, in legacy/get24-baseline/repro/npm-shrinkwrap.json.
//
// Switching to `npm ci` here would turn every validation run into a usage
// error, i.e. a false safety net. backend/test/validation-tooling.test.js locks
// this decision in so the next reader does not "fix" it blindly.
var DOCKER_CMD = 'docker';
var DOCKER_ARGS = [
  'run', '--rm',
  '-v', ROOT + ':/app',
  '-v', 'get24-nm:/app/node_modules',
  '-w', '/app',
  'node:6',
  'bash', '-c',
  'npm install --silent >/dev/null 2>&1; sh legacy/get24-baseline/tests/run.sh'
];
var COMMAND_STRING = DOCKER_CMD + ' ' + DOCKER_ARGS.join(' ');

// ── Result aggregation helpers ───────────────────────────────────────────────

/**
 * Parse all "# N tests, N passed, N failed, N skipped" lines from the combined
 * output of all three suites and sum the counters.
 *
 * Harness format (harness.js line 247):
 *   # <total> tests, <passed> passed, <failed> failed, 0 skipped
 */
function parseCounters(output) {
  var passed = 0, failed = 0, skipped = 0, total = 0;
  var re = /^#\s+(\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+skipped/mg;
  var match;
  while ((match = re.exec(output)) !== null) {
    total   += parseInt(match[1], 10);
    passed  += parseInt(match[2], 10);
    failed  += parseInt(match[3], 10);
    skipped += parseInt(match[4], 10);
  }
  return { total: total, passed: passed, failed: failed, skipped: skipped };
}

// ── Main ─────────────────────────────────────────────────────────────────────

var timestamp = new Date().toISOString();
var output    = '';

console.log('[validate] Running safety net…');
console.log('[validate] Command: ' + COMMAND_STRING);
console.log('');

var proc = spawn(DOCKER_CMD, DOCKER_ARGS, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

proc.stdout.setEncoding('utf8');
proc.stderr.setEncoding('utf8');
proc.stdout.on('data', function (d) { output += d; process.stdout.write(d); });
proc.stderr.on('data', function (d) { output += d; process.stderr.write(d); });

proc.on('close', function (code) {
  var exitCode = (code === null) ? 1 : code;
  var counters = parseCounters(output);
  var status   = (exitCode === 0 && counters.failed === 0) ? 'PASS' : 'FAIL';

  var result = {
    status:    status,
    passed:    counters.passed,
    failed:    counters.failed,
    skipped:   counters.skipped,
    total:     counters.total,
    exitCode:  exitCode,
    command:   COMMAND_STRING,
    timestamp: timestamp,
    output:    output,
    error:     null
  };

  // Ensure output directory exists
  if (!fs.existsSync(RESULT_DIR)) {
    fs.mkdirSync(RESULT_DIR, { recursive: true });
  }
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n', 'utf8');

  // Human-readable summary
  console.log('');
  console.log('──────────────────────────────────────');
  console.log('Validation result : ' + status);
  console.log('  passed  : ' + counters.passed);
  console.log('  failed  : ' + counters.failed);
  console.log('  skipped : ' + counters.skipped);
  console.log('  total   : ' + counters.total);
  console.log('  exit    : ' + exitCode);
  console.log('  saved   : ' + resultFile);
  console.log('──────────────────────────────────────');

  process.exit(exitCode);
});

proc.on('error', function (err) {
  var result = {
    status:    'FAIL',
    passed:    0,
    failed:    0,
    skipped:   0,
    total:     0,
    exitCode:  1,
    command:   COMMAND_STRING,
    timestamp: timestamp,
    output:    output,
    error:     err.message
  };

  if (!fs.existsSync(RESULT_DIR)) {
    fs.mkdirSync(RESULT_DIR, { recursive: true });
  }
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n', 'utf8');

  console.error('[validate] ERROR: ' + err.message);
  console.error('[validate] Is Docker installed and running?');
  process.exit(1);
});
