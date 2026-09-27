import { useWorkflow } from "../workflow/WorkflowContext";

const EXECUTION_STATUS: Record<string, { label: string; color: string; status: string }> = {
  not_available: { label: "Execution not available", color: "var(--muted)",   status: "status-muted" },
  running:       { label: "Running",                 color: "var(--yellow)",  status: "status-warn" },
  complete:      { label: "Complete",                color: "var(--green)",   status: "status-ok" },
  failed:        { label: "Failed",                  color: "var(--red)",     status: "status-danger" },
};

export default function ExecutionScreen({ onVerify, onRollback, onExecute, onRunVerification }: {
  onVerify?: () => void;
  onRollback?: () => void;
  onExecute?: () => void;
  onRunVerification?: () => void;
}) {
  const { state } = useWorkflow();
  const { execution, plan } = state;
  const step = plan.find((item) => item.id === execution.currentStepId);
  const checkpoint = state.checkpointResult;
  const status = EXECUTION_STATUS[execution.status] ?? { label: "Unknown status", color: "var(--muted)", status: "status-muted" };
  const passed = checkpoint?.passed ?? 0;
  const failed = checkpoint?.failed ?? 0;
  const skipped = checkpoint?.skipped ?? 0;
  const allPassed = Boolean(checkpoint && checkpoint.status === "passed");
  const busy = state.operationStatus === "running";

  return (
    <div className="stack stack-24">
      <div className="page-head">
        <div>
          <h1 className="page-title">Execution</h1>
          <p className="page-sub"><span className={status.status}>{status.label}</span></p>
        </div>
        <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
          {onExecute && (
            <button className="btn btn-solid" onClick={onExecute} disabled={busy}>
              Execute next safe step
            </button>
          )}
          {onRunVerification && (
            <button className="btn btn-outline" onClick={onRunVerification} disabled={busy}>
              Run verification
            </button>
          )}
          {checkpoint && onVerify && (
            <button className="btn btn-quiet" onClick={onVerify}>View verification →</button>
          )}
          {checkpoint && failed > 0 && onRollback && (
            <button className="btn btn-danger" onClick={onRollback}>View rollback →</button>
          )}
        </div>
      </div>

      {/* Current step */}
      <div className={`note ${execution.status === "running" ? "note-warn" : ""}`}>
        <div className="row" style={{ gap: 13, alignItems: "flex-start" }}>
          <span style={{ fontSize: 15, color: status.color, lineHeight: 1.3 }}>●</span>
          <div className="grow">
            {step ? (
              <>
                <div className="note-title" style={{ color: status.color }}>
                  Step {step.id} — {step.title}
                </div>
                <div className="note-body">{step.description}</div>
              </>
            ) : (
              <div className="note-title" style={{ color: "var(--muted)", fontWeight: 500 }}>
                No active execution step.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log + files */}
      <div className="cols-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="section-title">Activity log</div>
          <div className="log-block" style={{ minHeight: 232, maxHeight: 330 }}>
            {execution.log.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>{line.time}</span>
                <span style={{ color: "var(--text)" }}>{line.text}</span>
              </div>
            ))}
            {!execution.log.length && <span style={{ color: "var(--muted)" }}>{execution.message || status.label}</span>}
          </div>
        </div>

        <div className="stack stack-16">
          <div className="card">
            <div className="section-title">Files changed</div>
            {execution.filesChanged.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>No files have been modified yet.</p>
            )}
            {execution.filesChanged.map((fc) => (
              <div key={fc.file} className="list-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 5 }}>
                <span className="mono" style={{ color: "var(--accent)" }}>{fc.file}</span>
                <div className="row" style={{ gap: 14, fontSize: 12 }}>
                  <span style={{ color: "var(--green)" }}>+{fc.additions}</span>
                  <span style={{ color: "var(--red)" }}>−{fc.deletions}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="section-title">Safety net tests</div>
            {checkpoint && checkpoint.status !== "not_run" && checkpoint.status !== "not_available" ? (
              <div className="row" style={{ gap: 10, alignItems: "flex-start", color: failed ? "var(--red)" : allPassed ? "var(--green)" : "var(--muted)" }}>
                <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{failed ? "✕" : allPassed ? "✓" : "—"}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  <strong style={{ textTransform: "capitalize" }}>{checkpoint.status}</strong> — {checkpoint.total} total,{" "}
                  {passed} passed, {failed} failed, {skipped} skipped; exit code {checkpoint.exitCode ?? "not available"}.
                </span>
              </div>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                {checkpoint?.summary ?? "Safety net: not run"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
