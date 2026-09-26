import type { CSSProperties } from "react";
import { useWorkflow } from "../workflow/WorkflowContext";

const EXECUTION_STATUS: Record<string, { label: string; color: string }> = {
  not_available: { label: "Execution not available", color: "var(--muted)" },
  running: { label: "Running", color: "var(--yellow)" },
  complete: { label: "Complete", color: "var(--green)" },
  failed: { label: "Failed", color: "var(--red)" },
};

export default function ExecutionScreen({ onVerify, onRollback }: { onVerify?: () => void; onRollback?: () => void }) {
  const { state } = useWorkflow();
  const { execution, plan } = state;
  const step = plan.find((item) => item.id === execution.currentStepId);
  const checkpoint = state.checkpointResult?.tests.length ? state.checkpointResult : undefined;
  const status = checkpoint
    ? EXECUTION_STATUS[execution.status] ?? { label: "Unknown status", color: "var(--muted)" }
    : { label: "Execution: not available", color: "var(--muted)" };
  const passed = checkpoint?.tests.filter((test) => test.status === "passed").length ?? 0;
  const failed = checkpoint?.tests.filter((test) => test.status === "failed").length ?? 0;
  const skipped = checkpoint?.tests.filter((test) => test.status === "skipped").length ?? 0;
  const allPassed = Boolean(checkpoint && passed === checkpoint.tests.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Execution</h2>
          <p style={{ color: "var(--muted)" }}>
            <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {checkpoint && failed === 0 && onVerify && (
            <button onClick={onVerify} style={btnStyle("var(--green)")}>
              View Verification →
            </button>
          )}
          {checkpoint && failed > 0 && onRollback && (
            <button onClick={onRollback} style={btnStyle("var(--yellow)")}>
              View Rollback →
            </button>
          )}
        </div>
      </div>

      {/* Current step banner */}
      <div
        style={{
          padding: "14px 18px",
          background: checkpoint && execution.status === "running" ? "#9e6a0322" : "var(--surface-2)",
          border: `1px solid ${checkpoint && execution.status === "running" ? "#9e6a0355" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 20, color: status.color }}>●</span>
        <div>
          {step ? (
            <>
              <div style={{ fontWeight: 700, color: status.color }}>
                Step {step.id} — {step.title}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{step.description}</div>
            </>
          ) : (
            <div style={{ color: "var(--muted)" }}>No active execution step.</div>
          )}
        </div>
      </div>

      {/* Two-column: log + files */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Activity log */}
        <div className="card">
          <div className="section-title">Activity Log</div>
          <div
            className="mono"
            style={{
              background: "#0d1117",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "12px 14px",
              minHeight: 220,
              maxHeight: 320,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {(checkpoint && execution.status !== "not_available" ? execution.log : []).map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 10, lineHeight: 1.7 }}>
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>{line.time}</span>
                <span style={{ color: "var(--text)" }}>{line.text}</span>
              </div>
            ))}
            {!checkpoint && (
              <span style={{ color: "var(--muted)" }}>Execution: not available</span>
            )}
          </div>
        </div>

        {/* Files changed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="section-title">Files Changed</div>
            {execution.filesChanged.map((fc) => (
              <div
                key={fc.file}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span className="mono" style={{ color: "var(--accent)" }}>{fc.file}</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ color: "var(--green)", fontSize: 12 }}>+{fc.additions}</span>
                  <span style={{ color: "var(--red)", fontSize: 12 }}>−{fc.deletions}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Test status */}
          <div
            className="card"
            style={{ border: "1px solid var(--border)" }}
          >
            <div className="section-title">Safety Net Tests</div>
            {checkpoint ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: failed ? "var(--red)" : allPassed ? "var(--green)" : "var(--muted)" }}>
                <span style={{ fontSize: 18 }}>{failed ? "✗" : allPassed ? "✓" : "—"}</span>
                <span style={{ fontWeight: 700 }}>{passed} passed, {failed} failed, {skipped} skipped</span>
              </div>
            ) : (
              <div style={{ color: "var(--muted)" }}>Safety Net: not run</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(borderColor: string): CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: "var(--radius)",
    border: `1px solid ${borderColor}`,
    background: "transparent",
    color: borderColor,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}
