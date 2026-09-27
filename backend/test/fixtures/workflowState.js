"use strict";

/**
 * A structurally complete WorkflowState for tests that need a run in the server's
 * store but do not need a real analysis behind it.
 *
 * Everything in here is a labelled placeholder. That is deliberate and it is
 * bounded: the routers under test read exactly three things off a run — its
 * `runId`, its `updatedAt`, and its `execution` block — and the browser test
 * needs the shape to satisfy the frontend's runtime validator. No test asserts
 * anything about the placeholder analysis content, so nothing here can be
 * mistaken for a real finding, a real risk score or a real test result.
 *
 * The alternative was a real `git clone` of a public repository per test, which
 * makes the suite depend on the network and adds a minute to every run to
 * exercise three fields.
 */

const { randomUUID } = require("node:crypto");

/** @returns {object} a WorkflowState the frontend validator accepts. */
function makeWorkflowState(runId = randomUUID(), overrides = {}) {
  const now = new Date().toISOString();
  const base = {
    runId,
    currentPhase: "EXECUTE",
    overallStatus: "running",
    createdAt: now,
    updatedAt: now,
    errors: [],
    repository: {
      name: "fixture-repository",
      url: "https://github.com/example/fixture-repository",
      owner: "example",
      branch: "master",
      currentCommit: "0".repeat(40),
      commitMessage: "fixture commit, not a real one",
      runtime: "Node.js (legacy runtime pinned by the baseline)",
      framework: "Express + Socket.IO",
      language: "JavaScript",
      detectedLanguages: ["JavaScript"],
      packageManager: "npm",
      projectType: "web-application",
      lastCommit: "fixture",
      linesOfCode: 0,
      files: 0,
    },
    safetyNet: {
      total: 0,
      passing: 0,
      failing: 0,
      generatedBy: "placeholder: no suite was executed to build this fixture",
      createdAt: now,
    },
    overallProgress: 20,
    risks: [],
    plan: [],
    execution: {
      currentStepId: 1,
      status: "not_available",
      log: [],
      filesChanged: [],
    },
    verification: {
      pass: { stepId: 1, suite: "placeholder", duration: 0, coverage: 0, coverageNote: "placeholder", tests: [] },
      fail: { stepId: 1, suite: "placeholder", duration: 0, coverage: 0, coverageNote: "placeholder", tests: [] },
    },
    rollback: {
      rollbackStatus: "not_triggered",
      recoveryValidation: "not_triggered",
      timeline: [],
    },
    report: {
      changesApplied: [],
      rollbacks: [],
      auditTrail: [],
    },
  };
  return { ...base, ...overrides };
}

module.exports = { makeWorkflowState };
