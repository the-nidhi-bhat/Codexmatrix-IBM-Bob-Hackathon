import { createContext, useContext, type ReactNode } from "react";
import type { WorkflowContextValue, WorkflowState } from "./types";

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
  /** Adopt a newer server-authoritative copy (the Execute/Verify responses). */
  onStateChange?: (next: WorkflowState) => void;
  children: ReactNode;
}

/**
 * Wraps the dashboard. Provides a single WorkflowState to all screens.
 * The state is owned by App (fetched from backend) and passed in as a prop, so
 * there is exactly one copy of it and no second store to fall out of step.
 */
export function WorkflowProvider({ state, onStateChange, children }: WorkflowProviderProps) {
  const value: WorkflowContextValue = {
    state,
    // A no-op only if the host forgot the callback; App always passes one.
    updateWorkflow: (next) => onStateChange?.(next),
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}
