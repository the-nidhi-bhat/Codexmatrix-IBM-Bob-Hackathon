#!/usr/bin/env node
// tools/validate.js
// Legacy Code Whisperer — validation adapter
//
// Invoked by the backend when verification is requested for a repository.
// Usage: node tools/validate.js <workdir>
//
// Outputs JSON to stdout:
// { status, total, passed, failed, skipped, exitCode, summary, tests }
//
// Currently: runs `npm test` (if available) and parses output.
// This is a stub implementation — expand with real test runner support.

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const workdir = process.argv[2];

if (!workdir || !fs.existsSync(workdir)) {
  console.log(JSON.stringify({
    status: "failed",
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    exitCode: 1,
    summary: "No working directory provided",
    tests: [],
  }));
  process.exit(1);
}

const pkg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(workdir, "package.json"), "utf-8")); }
  catch { return null; }
})();

const hasTestScript = pkg?.scripts?.test && !pkg.scripts.test.includes("no test specified");
const hasTestDir = fs.existsSync(path.join(workdir, "test")) ||
                   fs.existsSync(path.join(workdir, "tests")) ||
                   fs.existsSync(path.join(workdir, "__tests__"));

if (!hasTestScript && !hasTestDir) {
  console.log(JSON.stringify({
    status: "skipped",
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    exitCode: 0,
    summary: "No test configuration found in this repository.",
    tests: [{
      name: "No tests detected",
      file: "project root",
      status: "skipped",
      duration: "0ms",
    }],
  }));
  process.exit(0);
}

// Future: run npm test and parse TAP/JUnit output
// For now, report that validation requires execution phase
console.log(JSON.stringify({
  status: "pending",
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  exitCode: 0,
  summary: "Test execution is part of the EXECUTE phase. Run validation after applying modernization steps.",
  tests: [],
}));
process.exit(0);
