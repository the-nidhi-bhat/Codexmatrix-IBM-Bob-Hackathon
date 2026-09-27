// ─────────────────────────────────────────────────────────────────────────────
//  Modernization execution API
//
//  client → this router → backend/src/modernization/executor.ts → throwaway
//  git worktree on a server-owned run branch → one real commit → the SERVER-owned
//  run record.
//
//  This is the link the product was missing. `executeModernization` (M3.2) was
//  proven by tests but reachable from no HTTP layer, so the Execute screen had
//  nothing to call and the Verify screen had no commit to verify.
//
//  Trust boundary: the client may send exactly two things — the id of an
//  analysis run this server already holds, and the id of an operation in the
//  allowlisted catalogue. It cannot send a file, a path, a replacement string, a
//  branch, a commit, a message, a command or an executable. The executor is the
//  only thing that decides what a run changes, and it looks the operation up in
//  the catalogue itself.
//
//  What is persisted: the run record's `execution` block. That block is the ONE
//  place a checkpoint subject may come from, and it is written here, server-side,
//  from the executor's own return value. The client never supplies it and never
//  reads it back as an instruction.
//
//  One execution at a time, mirroring the analyze route: two concurrent runs
//  would both branch from the same primary tip, and the second would race
//  the first's base. ponytail: one boolean, no queue.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { executeModernization } from "../modernization/executor";
import { describeOperations, getOperation } from "../modernization/operations";
import { getRun } from "../runStore";
import { readBody, requireText } from "../trust";
import type { ExecutionState } from "../types";

const router = Router();

/** The ONLY fields a client may send. */
const CLIENT_FIELDS = ["analysisRunId", "operationId"] as const;

let executing = false;
/** Exported so the 429 path can be proven in-process without spending a real run. */
export function acquireExecutionSlot(): boolean {
  if (executing) return false;
  executing = true;
  return true;
}
export function releaseExecutionSlot(): void {
  executing = false;
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message, phase: "EXECUTE" } });
}

function now(): string {
  return new Date().toISOString().slice(11, 19);
}

// ── GET /api/modernization/operations ─────────────────────────────────────────

router.get("/modernization/operations", (_req: Request, res: Response): void => {
  // describeOperations() is the catalogue's own display view: ids, titles, risk,
  // impact and the files each operation touches. No absolute path, no source
  // text, no replacement strings.
  res.json({ success: true, operations: describeOperations() });
});

// ── POST /api/modernization/execute ───────────────────────────────────────────

router.post("/modernization/execute", async (req: Request, res: Response): Promise<void> => {
  const body = readBody(req.body, CLIENT_FIELDS);
  if (!body.ok) {
    fail(res, body.status, body.code, body.message);
    return;
  }

  const analysisRunId = requireText(body.value["analysisRunId"], "analysisRunId", "MISSING_ANALYSIS_RUN_ID");
  if (!analysisRunId.ok) {
    fail(res, 400, analysisRunId.code, analysisRunId.message);
    return;
  }
  const operationId = requireText(body.value["operationId"], "operationId", "MISSING_OPERATION_ID");
  if (!operationId.ok) {
    fail(res, 400, operationId.code, operationId.message);
    return;
  }

  const analysisRun = getRun(analysisRunId.value);
  if (!analysisRun) {
    fail(res, 404, "ANALYSIS_RUN_NOT_FOUND", "No analysis run with that id exists on this server.");
    return;
  }

  // Reject an unknown operation id here, with a message a user can act on. The
  // executor refuses it too — this is a clearer error, not a second gate.
  if (!getOperation(operationId.value)) {
    fail(
      res,
      400,
      "UNKNOWN_OPERATION",
      `No such operation in the allowlist. Available: ${describeOperations()
        .map((op) => op.id)
        .join(", ")}.`,
    );
    return;
  }

  if (!acquireExecutionSlot()) {
    fail(
      res,
      429,
      "MODERNIZATION_IN_PROGRESS",
      "Another modernization is executing. Exactly one may run at a time; retry when it finishes.",
    );
    return;
  }

  const execution: ExecutionState = analysisRun.execution;
  const previous = { ...execution };
  execution.status = "running";
  execution.log = [
    ...execution.log,
    { time: now(), text: `Executing ${operationId.value} in an isolated worktree…` },
  ];
  analysisRun.updatedAt = new Date().toISOString();

  console.log(`[EXECUTE] run ${analysisRun.runId} operation ${operationId.value}`);

  let httpStatus = 200;
  let failure: { code: string; message: string } | null = null;

  try {
    const result = await executeModernization({ runId: uuidv4(), operationId: operationId.value });

    if (result.cleanup.warning) {
      console.warn(`[EXECUTE] cleanup warning: ${result.cleanup.warning}`);
    }
    if (result.status !== "completed" && result.code) {
      console.error(`[EXECUTE] run ${analysisRun.runId} ${result.code}: ${result.message ?? "no detail"}`);
    }

    if (result.status === "completed" && result.modernizationCommit && result.branch) {
      // The trusted trio, written server-side from the executor's own return.
      // This is the ONLY place modernizationCommit is ever written, and it is
      // what makes the Verify button meaningful rather than fabricated.
      execution.status = "complete";
      execution.operationId = result.operationId;
      execution.startingCommit = result.startingCommit ?? undefined;
      execution.modernizationCommit = result.modernizationCommit;
      execution.runRef = result.branch;
      execution.filesChanged = result.changedFiles.map((file) => ({ file, additions: 0, deletions: 0 }));
      execution.log = [
        ...execution.log,
        { time: now(), text: `Applied ${result.operationId} on ${result.branch}` },
        { time: now(), text: `Commit ${result.modernizationCommit.slice(0, 12)} created` },
      ];
      if (result.cleanup.warning) {
        execution.log = [...execution.log, { time: now(), text: `Worktree cleanup: ${result.cleanup.warning}` }];
      }
    } else {
      // Refused or failed: nothing was committed, so no subject is recorded and
      // Verify stays closed. The record is restored to what it was rather than
      // left half-updated.
      execution.status = "failed";
      execution.log = [
        ...execution.log,
        {
          time: now(),
          text: `Not applied: ${result.operationId} (${result.code ?? result.status}) — no commit was created`,
        },
      ];
      failure = {
        code: result.code ?? "MODERNIZATION_FAILED",
        message: "The modernization step was not applied, so there is no commit to verify.",
      };
      httpStatus = result.status === "refused" ? 409 : 500;
    }
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[EXECUTE] run ${analysisRun.runId} error: ${detail}`);
    Object.assign(execution, previous);
    execution.status = "failed";
    failure = { code: "MODERNIZATION_FAILED", message: "The modernization run failed." };
    httpStatus = 500;
  } finally {
    analysisRun.updatedAt = new Date().toISOString();
    releaseExecutionSlot();
  }

  // The response carries the run record and nothing else. The executor's
  // worktreePath and its log-only message are deliberately not serialised: the
  // path can resolve outside the repository, and the cleanup outcome the client
  // needs is already in execution.log.
  if (failure) {
    res.status(httpStatus).json({
      success: false,
      error: { ...failure, phase: "EXECUTE" },
      workflow: analysisRun,
    });
    return;
  }

  res.json({ success: true, runId: analysisRun.runId, workflow: analysisRun });
});

export default router;
