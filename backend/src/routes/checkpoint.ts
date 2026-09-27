// ─────────────────────────────────────────────────────────────────────────────
//  Checkpoint run lifecycle API
//
//  client → this router → backend/src/checkpointRunner.ts → isolated Git
//  worktree → the EXISTING tools/checkpoint.js → real validate / rollback /
//  recovery → the engine's own result file → this response.
//
//  Trust boundary: the client may send exactly one thing — the id of an analysis
//  run that already exists on this server. It cannot send a commit, a path, a
//  branch, a command, a cwd, an executable or a result-file path. The subject
//  commit is resolved from the server-owned run record; the repository, the
//  worktree, the tool, the executable, argv, the result file and the timeout all
//  belong to the M1 runner.
//
//  No abort endpoint at this milestone: runCheckpoint() owns its child process
//  and its timeout, and cancellation here would mean a second process-control
//  implementation — the exact thing the isolated runner removed.
//
//  Deliberately absent: any reconstruction of the engine's logic. The engine's
//  result file is passed through verbatim, counts included. If it is absent, this
//  API reports that nothing ran; it never manufactures a status or a count.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { runCheckpoint } from "../checkpointRunner";
import { RUN_BRANCH } from "../modernization/executor";
import { getRun } from "../runStore";
import { readBody, requireText } from "../trust";
import type {
  CheckpointRefusal,
  CheckpointRunStatus,
  CheckpointRunView,
  WorkflowState,
} from "../types";

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const MAX_STORED_RUNS = 50;

/** The ONLY field a client may send. Anything else is rejected by name, so a
 *  commit/branch/path/command/executable in the body can never be acted on. */
const CLIENT_FIELDS = ["analysisRunId"] as const;

/** Client-safe text per runner error code. The runner's own `message` can embed
 *  absolute paths and tool output, so it is logged, never returned. */
const REFUSAL_TEXT: Record<string, string> = {
  INVALID_COMMIT_SHA: "The server-resolved commit is not a full 40-character SHA.",
  REPO_ROOT_UNRESOLVED: "The controlled repository could not be identified on the server.",
  COMMIT_NOT_FOUND: "The approved commit is not present in the controlled repository.",
  COMMIT_NOT_ANCESTOR: "The approved commit is not part of the controlled branch history.",
  ENGINE_NOT_PRESENT: "The approved commit predates the checkpoint engine, so it cannot be verified.",
  WORKTREE_CREATE_FAILED: "The isolated worktree could not be created.",
  WORKTREE_OUTSIDE_TMP: "The isolated worktree resolved outside the server's temp directory.",
  SPAWN_FAILED: "The checkpoint engine could not be started.",
  TIMEOUT: "The checkpoint engine exceeded its time limit.",
  NO_RESULT_FILE: "The checkpoint engine produced no result file.",
  MALFORMED_RESULT: "The checkpoint engine produced an unreadable result.",
};

interface StoredRun {
  id: string;
  analysisRunId: string;
  status: CheckpointRunStatus;
  subjectCommit: string | null;
  checkpointStatus: string | null;
  checkpoint: Record<string, unknown> | null;
  refusal: CheckpointRefusal | null;
  cleanupWarning: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// In-memory store, same lifetime and eviction as the analysis run store.
const runs = new Map<string, StoredRun>();

// Exactly one checkpoint may execute at a time — enforced here, not in the UI.
// Exported so the 429 path can be proven in-process by an out-of-tree harness
// without spending a real engine run. ponytail: one boolean, no queue.
let slotHeld = false;
export function acquireCheckpointSlot(): boolean {
  if (slotHeld) return false;
  slotHeld = true;
  return true;
}
export function releaseCheckpointSlot(): void {
  slotHeld = false;
}

class SubjectNotResolvable extends Error {
  constructor(readonly refusal: CheckpointRefusal) {
    super(refusal.message);
  }
}

/**
 * Resolve the checkpoint subject from the SERVER-owned run record.
 *
 * Two things are required together, and both come from the record the execute
 * stage wrote:
 *
 *   commit  execution.modernizationCommit — the commit the executor CREATED.
 *   ref     execution.runRef — lcw/modernization/<runId>, the server-owned run
 *           branch that holds it.
 *
 * Why not `startingCommit`: that is HEAD *before* the operation was applied, so
 * verifying it would verify the pre-modernization tree and report VERIFIED for a
 * change that was never checked. It is recorded for the audit trail, not used as
 * a subject.
 *
 * Why the ref is required rather than defaulted: a modernization commit is a
 * CHILD of the integration tip, so it is genuinely not an ancestor of
 * `integration/final`. Defaulting the anchor to the integration branch would
 * refuse every legitimate run; worse, it would verify against the wrong anchor.
 * Anchoring on the run branch is both true and narrower — the commit must be
 * inside the branch the server itself created. Attaching the worktree to that
 * branch (instead of checking out detached) is also what lets the engine's own
 * `git revert` land as a persistent commit instead of on a throwaway HEAD.
 *
 * If either piece is missing the run is refused, never guessed. A checkpoint
 * with no trustworthy subject is worse than no checkpoint at all.
 */
function resolveTrustedSubject(run: WorkflowState): { commit: string; ref: string } {
  const commit = run.execution?.modernizationCommit;
  if (typeof commit !== "string" || !COMMIT_SHA.test(commit)) {
    throw new SubjectNotResolvable({
      code: "APPROVED_SUBJECT_NOT_RECORDED",
      message:
        "No approved modernization commit is recorded for this run, so no checkpoint subject could be resolved. Execute a modernization step first; the subject is resolved server-side and is never taken from the request.",
    });
  }

  const ref = run.execution?.runRef;
  // The same RUN_BRANCH pattern the executor creates branches with, so a value
  // that is not one of ours is refused before it reaches a git argument.
  if (typeof ref !== "string" || !RUN_BRANCH.test(ref)) {
    throw new SubjectNotResolvable({
      code: "APPROVED_REF_NOT_RECORDED",
      message:
        "No server-owned run branch is recorded for this run, so the checkpoint has no anchor to verify against. A modernization commit is verified inside the run branch the server created for it.",
    });
  }

  return { commit, ref };
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message, phase: "VERIFY" } });
}

function toView(run: StoredRun): CheckpointRunView {
  return {
    id: run.id,
    analysisRunId: run.analysisRunId,
    status: run.status,
    subjectCommit: run.subjectCommit,
    checkpointStatus: run.checkpointStatus,
    checkpoint: run.checkpoint,
    refusal: run.refusal,
    cleanupWarning: run.cleanupWarning,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

// ── POST /api/checkpoint-runs ─────────────────────────────────────────────────

router.post("/checkpoint-runs", (req: Request, res: Response): void => {
  const body = readBody(req.body, CLIENT_FIELDS);
  if (!body.ok) {
    // Names only, never values: a rejected field is not echoed back.
    fail(res, body.status, body.code, body.message);
    return;
  }

  const analysisRunId = requireText(body.value["analysisRunId"], "analysisRunId", "MISSING_ANALYSIS_RUN_ID");
  if (!analysisRunId.ok) {
    fail(res, 400, analysisRunId.code, analysisRunId.message);
    return;
  }

  const analysisRun = getRun(analysisRunId.value);
  if (!analysisRun) {
    fail(res, 404, "ANALYSIS_RUN_NOT_FOUND", "No analysis run with that id exists on this server.");
    return;
  }

  const now = new Date().toISOString();
  const stored: StoredRun = {
    id: uuidv4(),
    analysisRunId: analysisRun.runId,
    status: "created",
    subjectCommit: null,
    checkpointStatus: null,
    checkpoint: null,
    refusal: null,
    cleanupWarning: false,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
  };
  runs.set(stored.id, stored);
  if (runs.size > MAX_STORED_RUNS) {
    const oldest = runs.keys().next().value;
    if (oldest) runs.delete(oldest);
  }

  console.log(`[CHECKPOINT] run ${stored.id} created for analysis run ${analysisRun.runId}`);
  res.status(201).json({ success: true, checkpointRun: toView(stored) });
});

// ── POST /api/checkpoint-runs/:id/verify ──────────────────────────────────────

router.post("/checkpoint-runs/:id/verify", async (req: Request, res: Response): Promise<void> => {
  const id = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  // The id is only ever a Map key. It is never turned into a path, a command or
  // an argument to the runner.
  const stored = typeof id === "string" && UUID.test(id) ? runs.get(id) : undefined;
  if (!stored) {
    fail(res, 404, "CHECKPOINT_RUN_NOT_FOUND", "No checkpoint run with that id exists on this server.");
    return;
  }

  if (stored.status === "complete") {
    fail(res, 409, "CHECKPOINT_ALREADY_COMPLETE", "This checkpoint run already produced a result.");
    return;
  }

  if (stored.status === "running" || !acquireCheckpointSlot()) {
    fail(
      res,
      429,
      "CHECKPOINT_IN_PROGRESS",
      "Another checkpoint is executing. Exactly one may run at a time; retry when it finishes."
    );
    return;
  }

  stored.status = "running";
  stored.startedAt = new Date().toISOString();
  stored.refusal = null;
  console.log(`[CHECKPOINT] run ${stored.id} verifying`);

  // The response is serialised AFTER the finally block, so finishedAt and the
  // released slot are always reflected in what the client receives.
  let httpStatus = 200;
  let errorOverride: { code: string; message: string } | null = null;

  try {
    const analysisRun = getRun(stored.analysisRunId);
    if (!analysisRun) {
      httpStatus = 404;
      errorOverride = {
        code: "ANALYSIS_RUN_NOT_FOUND",
        message: "The analysis run this checkpoint belongs to is no longer held by the server.",
      };
      stored.status = "failed";
      stored.refusal = { ...errorOverride };
    } else {
      const subject = resolveTrustedSubject(analysisRun);
      stored.subjectCommit = subject.commit.slice(0, 12);

      const result = await runCheckpoint({ commit: subject.commit, ref: subject.ref });

      // Server log keeps the paths and the tool output; the client gets neither.
      if (result.cleanup.warning) {
        console.warn(`[CHECKPOINT] run ${stored.id} cleanup warning: ${result.cleanup.warning}`);
      }
      if (result.error) {
        console.error(`[CHECKPOINT] run ${stored.id} ${result.error.code}: ${result.error.message}`);
      }
      stored.cleanupWarning = !result.cleanup.removed || Boolean(result.cleanup.warning);

      if (result.outcome === "COMPLETED") {
        // Verbatim pass-through. validationResult counts inside it are the engine's.
        stored.checkpoint = result.checkpoint;
        stored.checkpointStatus = result.checkpointStatus;
        console.log(`[CHECKPOINT] run ${stored.id} engine status ${result.checkpointStatus}`);
        if (result.checkpointStatus === "REFUSED") {
          stored.status = "refused";
          stored.refusal = {
            code: "CHECKPOINT_REFUSED",
            message: "The checkpoint engine refused this run. The repository was not modified.",
          };
          httpStatus = 409;
        } else {
          stored.status = "complete";
        }
      } else {
        const code =
          result.error?.code ?? (result.outcome === "REJECTED" ? "CHECKPOINT_REJECTED" : "CHECKPOINT_FAILED");
        stored.status = result.outcome === "REJECTED" ? "refused" : "failed";
        stored.refusal = {
          code,
          message:
            REFUSAL_TEXT[code] ??
            (result.outcome === "REJECTED"
              ? "The server refused to run a checkpoint for this subject."
              : "The checkpoint run failed."),
        };
        httpStatus = code === "TIMEOUT" ? 504 : result.outcome === "REJECTED" ? 409 : 500;
      }
    }
  } catch (err: unknown) {
    if (err instanceof SubjectNotResolvable) {
      stored.status = "refused";
      stored.refusal = err.refusal;
      httpStatus = 409;
      console.log(`[CHECKPOINT] run ${stored.id} refused: ${err.refusal.code}`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      stored.status = "failed";
      stored.refusal = { code: "CHECKPOINT_FAILED", message: "The checkpoint run failed." };
      httpStatus = 500;
      console.error(`[CHECKPOINT] run ${stored.id} error: ${message}`);
    }
  } finally {
    stored.finishedAt = new Date().toISOString();
    releaseCheckpointSlot();
  }

  if (errorOverride) {
    fail(res, httpStatus, errorOverride.code, errorOverride.message);
    return;
  }
  res.status(httpStatus).json({ success: true, checkpointRun: toView(stored) });
});

// ── GET /api/checkpoint-runs/:id ──────────────────────────────────────────────

router.get("/checkpoint-runs/:id", (req: Request, res: Response): void => {
  const id = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const stored = typeof id === "string" && UUID.test(id) ? runs.get(id) : undefined;
  if (!stored) {
    fail(res, 404, "CHECKPOINT_RUN_NOT_FOUND", "No checkpoint run with that id exists on this server.");
    return;
  }
  res.json({ success: true, checkpointRun: toView(stored) });
});

export default router;
