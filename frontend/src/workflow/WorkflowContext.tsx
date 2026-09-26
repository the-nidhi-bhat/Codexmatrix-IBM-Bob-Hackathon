import { createContext, useContext, useState, type ReactNode } from "react";
import type { WorkflowContextValue, WorkflowState, VerificationRun } from "./types";
import { buildMockWorkflowState } from "./mockWorkflow";

// ── Context ──────────────────────────────────────────────────────────────────

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Use this hook in any screen to read the shared workflow state.
 * Throws if called outside a WorkflowProvider.
 */
export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) {
    throw new Error("useWorkflow must be used inside <WorkflowProvider>");
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface WorkflowProviderProps {
  /** Repository URL entered by the user on the Start screen. */
  repoUrl: string;
  children: ReactNode;
}

/**
 * Wraps the dashboard. Provides a single WorkflowState to all screens.
 *
 * In demo mode: builds the state from mockWorkflow.ts using the supplied repoUrl.
 * In production: replace buildMockWorkflowState() with a real data source.
 */
export function WorkflowProvider({ repoUrl, children }: WorkflowProviderProps) {
  // Build the workflow state once per session (repoUrl is fixed after Start).
  // In production this would come from an API/subscription.
  const [state] = useState<WorkflowState>(() => buildMockWorkflowState(repoUrl));

  const [verificationMode, setVerificationMode] = useState<"pass" | "fail">("fail");

  const activeVerification: VerificationRun = state.verification[verificationMode];

  const value: WorkflowContextValue = {
    state,
    verificationMode,
    setVerificationMode,
    activeVerification,
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}
