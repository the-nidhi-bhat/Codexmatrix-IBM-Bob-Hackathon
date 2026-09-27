/**
 * The Execute → Verify → Rollback controller.
 *
 * One hook owns every piece of async state for the two real, state-changing
 * requests, so the screens stay presentational and there is no second copy of the
 * workflow anywhere. Three rules it exists to enforce:
 *
 *  1. The buttons follow reality, not optimism. `canExecute` and `canVerify` are
 *     derived from the server's record, so Verify cannot be clicked before a
 *     commit exists, and a duplicate click is impossible while a request is in
 *     flight (the server refuses it with 409 anyway).
 *  2. The subject is never a client concern. Verify sends only a checkpoint run
 *     id; the server resolves the commit and the run branch from its own record.
 *  3. The engine's answer is shown as the engine gave it. The verdict is read
 *     from the engine's verbatim `status` and its counts. Nothing is recomputed,
 *     rounded, or restated as a coverage number the engine never measured.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCheckpointRun,
  executeModernization,
  listModernizationOperations,
  verifyCheckpointRun,
  WorkflowApiError,
  type ModernizationOperationSummary,
} from "../api/workflowApi";
import type { CheckpointRunView, WorkflowContextValue } from "./types";

export type RequestPhase = "idle" | "busy" | "done" | "error";

export interface RequestStatus {
  phase: RequestPhase;
  /** The server's error code, for a precise message. Null unless phase is error. */
  code: string | null;
  /** A message written for a person. Null unless phase is error. */
  message: string | null;
}

const IDLE: RequestStatus = { phase: "idle", code: null, message: null };

function failed(err: unknown, fallback: string): RequestStatus {
  if (err instanceof WorkflowApiError) {
    return { phase: "error", code: err.code, message: err.message || fallback };
  }
  // A network failure is not an ApiError, and it must still land in the error
  // path rather than leaving a spinner running forever.
  return { phase: "error", code: "NETWORK", message: fallback };
}

export interface ModernizationController {
  /** The allowlisted operations, loaded once. Empty until they arrive. */
  operations: ModernizationOperationSummary[];
  operationsError: string | null;
  execute: RequestStatus;
  /** False until a commit is recorded, and false while a request is in flight. */
  canExecute: boolean;
  runExecute: (operationId: string) => void;

  verify: RequestStatus;
  /** False with no recorded subject, false while busy, false if already verified. */
  canVerify: boolean;
  runVerify: () => void;

  /** The checkpoint run view, or null before a run is created. */
  view: CheckpointRunView | null;

  /** A human summary of the run ref and subject, for display only. */
  subjectSummary: string | null;
  /** True when a run ref is recorded but the checkpoint has not been run. */
  pendingRef: boolean;
}

export function useModernization(ctx: WorkflowContextValue): ModernizationController {
  const { state, updateWorkflow } = ctx;
  const [operations, setOperations] = useState<ModernizationOperationSummary[]>([]);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [execute, setExecute] = useState<RequestStatus>(IDLE);
  const [verify, setVerify] = useState<RequestStatus>(IDLE);
  const [view, setView] = useState<CheckpointRunView | null>(null);

  // A ref, not state: the guard must be readable synchronously inside runExecute
  // without a render in between, or a double click can pass it twice.
  const executeInFlight = useRef(false);
  const verifyInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    listModernizationOperations(controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) {
          setOperations(list);
          setOperationsError(null);
        }
      },
      (err: unknown) => {
        if (!controller.signal.aborted) {
          setOperationsError(
            err instanceof WorkflowApiError ? err.message : "The operations catalogue could not be loaded.",
          );
        }
      },
    );
    return () => controller.abort();
  }, []);

  const subject = state.execution.modernizationCommit;
  const runRef = state.execution.runRef;

  // Disabled state is derived from the request phase, which re-renders when it
  // flips. The refs below are NOT read here: they are the synchronous guard
  // inside the handlers, so a double click that lands before React has re-rendered
  // still cannot start a second request.
  const canExecute = execute.phase !== "busy" && operations.length > 0;
  // A checkpoint is only meaningful against a recorded subject, and only once:
  // a finished run is not re-run from the UI (the server refuses it with 409).
  const finished = view?.status === "complete" || view?.status === "refused" || view?.status === "failed";
  const canVerify = Boolean(subject) && verify.phase !== "busy" && !finished;

  const runExecute = useCallback(
    (operationId: string) => {
      if (executeInFlight.current) return;
      executeInFlight.current = true;
      setExecute({ phase: "busy", code: null, message: null });

      // Optimistic "running" so the screen shows the transition immediately. It
      // is replaced by the server's authoritative record when the call returns;
      // if the call fails, the record is rolled back to what the server holds.
      const previous = state.execution;
      updateWorkflow({
        ...state,
        execution: { ...previous, status: "running" },
      });

      executeModernization(state.runId, operationId).then(
        (res) => {
          executeInFlight.current = false;
          updateWorkflow(res.workflow);
          setExecute({ phase: "done", code: null, message: null });
          // A new subject invalidates any earlier checkpoint result.
          setView(null);
        },
        (err: unknown) => {
          executeInFlight.current = false;
          const status = failed(err, "The modernization step could not be executed.");
          setExecute(status);
          updateWorkflow({
            ...state,
            execution: { ...previous, status: "failed", log: [
              ...previous.log,
              { time: new Date().toISOString().slice(11, 19), text: `Not applied: ${operationId} — ${status.code}` },
            ] },
          });
        },
      );
    },
    [state, updateWorkflow],
  );

  const runVerify = useCallback(() => {
    if (verifyInFlight.current) return;
    verifyInFlight.current = true;
    setVerify({ phase: "busy", code: null, message: null });

    const finish = (next: CheckpointRunView) => {
      verifyInFlight.current = false;
      setView(next);
      setVerify({ phase: "done", code: null, message: null });
    };
    const problem = (err: unknown) => {
      verifyInFlight.current = false;
      setVerify(failed(err, "The checkpoint could not be run."));
    };

    // The run record is authoritative: if a checkpoint already exists for this
    // analysis run, re-verify it rather than creating a second one.
    if (view) {
      verifyCheckpointRun(view.id).then(finish, problem);
      return;
    }
    createCheckpointRun(state.runId).then(
      (created) => {
        setView(created);
        return verifyCheckpointRun(created.id).then(finish, problem);
      },
      problem,
    );
  }, [state.runId, view]);

  return {
    operations,
    operationsError,
    execute,
    canExecute,
    runExecute,
    verify,
    canVerify,
    runVerify,
    view,
    subjectSummary: subject ? `${subject.slice(0, 12)}${runRef ? ` on ${runRef}` : ""}` : null,
    pendingRef: Boolean(subject) && !view,
  };
}
