#!/usr/bin/env node
// tools/rollback.js
// Legacy Code Whisperer — rollback adapter
//
// Invoked by the backend when a regression is detected during verification.
// Usage: node tools/rollback.js <workdir> <targetCommit>
//
// Outputs JSON to stdout:
// { triggered, targetCommit, rollbackCommit, status, reason }
//
// Currently: performs git reset --hard to the target commit.
// IMPORTANT: Only operates on the isolated temp workspace — never on the user's repo.

const { execFileSync } = require("child_process");
const fs = require("fs");

const workdir = process.argv[2];
const targetCommit = process.argv[3];

if (!workdir || !targetCommit) {
  console.log(JSON.stringify({
    triggered: false,
    targetCommit: null,
    rollbackCommit: null,
    status: "failed",
    reason: "Missing arguments: workdir and targetCommit are required.",
  }));
  process.exit(1);
}

if (!fs.existsSync(workdir)) {
  console.log(JSON.stringify({
    triggered: false,
    targetCommit,
    rollbackCommit: null,
    status: "failed",
    reason: "Working directory does not exist.",
  }));
  process.exit(1);
}

try {
  const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workdir }).toString().trim().slice(0, 12);
  execFileSync("git", ["reset", "--hard", targetCommit], { cwd: workdir });
  const after = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workdir }).toString().trim().slice(0, 12);

  console.log(JSON.stringify({
    triggered: true,
    targetCommit,
    rollbackCommit: after,
    status: "complete",
    reason: `Rolled back from ${before} to ${after} in isolated workspace.`,
  }));
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({
    triggered: true,
    targetCommit,
    rollbackCommit: null,
    status: "failed",
    reason: err.message ?? "git reset failed",
  }));
  process.exit(1);
}
