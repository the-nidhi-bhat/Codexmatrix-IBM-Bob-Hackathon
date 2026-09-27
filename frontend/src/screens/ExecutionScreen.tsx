import type { CSSProperties } from "react";
import { useWorkflow } from "../workflow/WorkflowContext";
import type { ModernizationController } from "../workflow/useModernization";

const EXECUTION_STATUS: Record<string, { label: string; color: string }> = {
  not_available: { label: "Nothing executed yet", color: "var(--muted)" },
  running: { label: "Running", color: "var(--yellow)" },
  complete: { label: "Applied", color: "var(--green)" },
  failed: { label: "Not applied", color: "var(--red)" },
};

const ENGINE_COLORS: Record<string, string> = {
  VERIFIED: "var(--green)",
  RECOVERY_VERIFIED: "var(--green)",
  RECOVERY_FAILED: "var(--red)",
  VALIDATION_FAILED: "var(--red)",
  REFUSED: "var(--red)",
};

export default function ExecutionScreen({
  controller,
  onVerify,
  onRollback,
}: {
  controller: ModernizationController;
  onVerify?: () => void;
  onRollback?: () => void;
}) {
  const { state } = useWorkflow();
  const { execution, plan } = state;
  const step = plan.find((item) => item.id === execution.currentStepId);

  // The status is the server's record, read directly. It used to be forced to
  // "not available" whenever no checkpoint result existed, which made a real
  // execution look like no execution at all.
  const status = EXECUTION_STATUS[execution.status] ?? { label: execution.status, color: "var(--muted)" };
  const executed = execution.status !== "not_available";

  // Counts come from the engine's own validation result, verbatim. When the
  // engine has not run, there are no counts, and none are invented.
  const validation = controller.view?.checkpoint?.validationResult ?? undefined;
  const subject = controller.view?.checkpointStatus ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Execution</h2>
          <p style={{ color: "var(--muted)" }}>
            <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {controller.view && onVerify && (
            <button onClick={onVerify} style={btnStyle("var(--green)")}>
              View Verification →
            </button>
          )}
          {controller.view?.checkpoint?.rollbackResult && onRollback && (
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
          background: execution.status === "running" ? "#9e6a0322" : "var(--surface-2)",
          border: `1px solid ${execution.status === "running" ? "#9e6a0355" : "var(--border)"}`,
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

      {/* Execute: the only thing this screen can do is ask the server to apply an
          allowlisted operation. The client names the operation, never the file. */}
      <div className="card">
        <div className="section-title">Apply a Modernization Step</div>
        {controller.operationsError ? (
          <div style={{ color: "var(--red)" }}>The operations catalogue could not be loaded: {controller.operationsError}</div>
        ) : controller.operations.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>Loading the operations catalogue…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {controller.operations.map((operation) => (
              <div
                key={operation.id}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{operation.title}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                    <span className="mono">{operation.id}</span> · {operation.kind} · {operation.finding} · risk: {operation.risk}
                  </div>
                  <div className="mono" style={{ color: "var(--accent)", fontSize: 12, marginTop: 4 }}>
                    {operation.files.join("  ")}
                  </div>
                </div>
                <button
                  onClick={() => controller.runExecute(operation.id)}
                  disabled={!controller.canExecute}
                  style={{ ...btnStyle("var(--accent)"), opacity: controller.canExecute ? 1 : 0.45, cursor: controller.canExecute ? "pointer" : "not-allowed" }}
                >
                  {controller.execute.phase === "busy" ? "Applying…" : "Apply"}
                </button>
              </div>
            ))}
          </div>
        )}

        {controller.execute.phase === "error" && controller.execute.message && (
          <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>
            {controller.execute.message} <span className="mono">({controller.execute.code})</span>
          </div>
        )}

        {execution.modernizationCommit && (
          <div
            className="mono"
            style={{ marginTop: 12, padding: "10px 12px", background: "#0d1117", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
          >
            <div>
              <span style={{ color: "var(--muted)" }}>subject&nbsp;&nbsp;</span>
              {execution.modernizationCommit}
            </div>
            {execution.runRef && (
              <div>
                <span style={{ color: "var(--muted)" }}>run ref&nbsp;</span>
                {execution.runRef}
              </div>
            )}
          </div>
        )}
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
            {(executed
              ? execution.log
              : [{ time: "—", text: "Nothing executed yet. Apply a step above to create a real commit." }]
            ).map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 10, lineHeight: 1.7 }}>
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>{line.time}</span>
                <span style={{ color: "var(--text)" }}>{line.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Files changed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="section-title">Files Changed</div>
            {execution.filesChanged.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No files changed yet.</div>
            ) : (
              execution.filesChanged.map((fc) => (
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
                  {/* Line counts are not reported by the executor, so they are not
                      shown. The file list is the real, server-reported evidence. */}
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>modified by the apply step</div>
                </div>
              ))
            )}
          </div>

          {/* Safety Net: the engine's real counts, or an honest "not run". */}
          <div className="card" style={{ border: "1px solid var(--border)" }}>
            <div className="section-title">Safety Net</div>
            {validation ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: ENGINE_COLORS[subject ?? ""] ?? "var(--muted)" }}>
                  <span style={{ fontSize: 18 }}>{subject === "VERIFIED" || subject === "RECOVERY_VERIFIED" ? "✓" : "✗"}</span>
                  <span style={{ fontWeight: 700 }}>{subject}</span>
                </div>
                <div style={{ fontSize: 13 }}>
                  {validation.passed ?? "—"} passed, {validation.failed ?? "—"} failed, {validation.skipped ?? "—"} skipped
                  {typeof validation.total === "number" ? ` of ${validation.total}` : ""}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--muted)" }}>
                Safety Net: not run. The 18-test legacy suite runs through{" "}
                <code>tools/checkpoint.js</code> on the Verify screen, against a real commit.
              </div>
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
