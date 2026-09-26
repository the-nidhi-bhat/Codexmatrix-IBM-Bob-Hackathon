import { createContext, useContext, useState, type ReactNode } from "react";
import type { WorkflowContextValue, WorkflowState, VerificationRun } from "./types";

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
  /** Pre-fetched workflow state from the backend (or mock). */
  state: WorkflowState;
  children: ReactNode;
}

/**
 * Wraps the dashboard. Provides a single WorkflowState to all screens.
 * The state is owned by App (fetched from backend) and passed in as a prop.
 */
export function WorkflowProvider({ state, children }: WorkflowProviderProps) {
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
