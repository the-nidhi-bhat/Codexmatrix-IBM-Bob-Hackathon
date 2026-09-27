// ─────────────────────────────────────────────────────────────────────────────
//  The server-owned analysis run store.
//
//  A run is a WorkflowState this server created from its own `git clone`. It is
//  the record a checkpoint subject may be read from, so it is the trust anchor
//  for the Execute → Verify → Rollback chain: nothing a client sends can add a
//  commit or a branch to a run, only ask this server to look one up.
//
//  It lives in its own module rather than inside routes/analyze.ts because two
//  routers and the test harness all need to reach it, and importing a store out
//  of a route module is how a second, parallel store gets created by accident.
//
//  ponytail: in memory, last 50 runs, one process. A restart drops the runs and
//  the UI says "not run" rather than showing a stale result, which is the honest
//  failure. Swap for Redis/DB the day the server runs in more than one process.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowState } from "./types";

const runs = new Map<string, WorkflowState>();
const MAX_RUNS = 50;

export function getRun(runId: string): WorkflowState | undefined {
  return runs.get(runId);
}

/** Store a run, evicting the oldest past MAX_RUNS. */
export function putRun(workflow: WorkflowState): void {
  runs.set(workflow.runId, workflow);
  if (runs.size > MAX_RUNS) {
    const oldest = runs.keys().next().value;
    if (oldest) runs.delete(oldest);
  }
}

export function runCount(): number {
  return runs.size;
}
