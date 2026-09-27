import { useWorkflow } from "../workflow/WorkflowContext";

export default function VerificationScreen({ onRollback, onRunVerification }: { onRollback?: () => void; onRunVerification?: () => void }) {
  const { state } = useWorkflow();
  const v = state.checkpointResult;
  const busy = state.operationStatus === "running";

  if (!v) {
    return (
      <div className="stack stack-20">
        <div className="page-head">
          <div>
            <h1 className="page-title">Verification</h1>
            <p className="page-sub">Safety net · not run</p>
          </div>
          {onRunVerification && (
            <button className="btn btn-solid" onClick={onRunVerification} disabled={busy}>
              Run safe verification
            </button>
          )}
        </div>
        <div className="note">
          <div className="note-title" style={{ color: "var(--muted)" }}>No checkpoint result yet</div>
          <div className="note-body">
            No checkpoint result has been received for this workflow. Run a verification to
            build the safety net baseline.
          </div>
        </div>
      </div>
    );
  }

  const passed  = v.passed;
  const failed  = v.failed;
  const skipped = v.skipped;
  const overallPass = v.status === "passed" && v.total > 0;
  const overallFail = v.status === "failed";
  const hasTestResults = v.status === "passed" || v.status === "failed";
  const resultColor = overallPass ? "var(--green)" : overallFail ? "var(--red)" : "var(--muted)";

  const stepTitle = state.plan.find((s) => s.id === v.stepId)?.title ?? `Step ${v.stepId}`;

  const headline =
    v.status === "not_available" ? "Verification not available"
    : overallPass ? "Pass — all checkpoint tests are green"
    : overallFail ? "Fail — regression detected"
    : v.status === "running" ? "Verification running"
    : "Incomplete — result not conclusive";

  return (
    <div className="stack stack-24">
      <div className="page-head">
        <div>
          <h1 className="page-title">Verification</h1>
          <p className="page-sub">{v.summary}</p>
        </div>
        {onRunVerification && (
          <button className="btn btn-outline" onClick={onRunVerification} disabled={busy}>
            {busy ? "Verification running…" : "Run safe verification"}
          </button>
        )}
      </div>

      {/* Result banner */}
      <div className={`note ${overallPass ? "note-ok" : overallFail ? "note-danger" : ""}`}>
        <div className="row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span style={{ fontSize: 26, lineHeight: 1.1, color: resultColor }}>
            {overallPass ? "✓" : overallFail ? "✕" : "—"}
          </span>
          <div className="grow">
            <div className="note-title" style={{ color: resultColor }}>{headline}</div>
            <div className="note-body">
              Step {v.stepId} — {stepTitle} · {v.suite} · {v.duration} · exit code {v.exitCode ?? "not available"}
            </div>
          </div>
          {overallFail && onRollback && (
            <button className="btn btn-danger" onClick={onRollback}>View rollback →</button>
          )}
        </div>
      </div>

      {!hasTestResults && <div className="note"><div className="note-body" style={{ marginTop: 0 }}>{v.summary}</div></div>}

      {hasTestResults && (
        <div className="cols-4">
          {[
            { label: "Total",   count: v.total,   color: "var(--text)",   top: "var(--line-2)" },
            { label: "Passed",  count: passed,    color: "var(--green)",  top: "var(--green)" },
            { label: "Failed",  count: failed,    color: "var(--red)",    top: "var(--red)" },
            { label: "Skipped", count: skipped,   color: "var(--muted)",  top: "var(--line-2)" },
          ].map(({ label, count, color, top }) => (
            <div key={label} className="stat" style={{ borderTop: `3px solid ${top}` }}>
              <div className="stat-value" style={{ color }}>{count}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="section-title">Verification summary</div>
        <p style={{ lineHeight: 1.7 }}>{v.summary}</p>
        <div className="mono" style={{ color: "var(--muted)", marginTop: 10, overflowWrap: "anywhere" }}>
          {v.command ?? "Command: not available"}
        </div>
        {v.output && (
          <div className="log-block" style={{ marginTop: 14, maxHeight: 320 }}>{v.output}</div>
        )}
      </div>

      {hasTestResults && (
        <div className="card">
          <div className="section-title">Test results</div>
          {v.tests.map((t, i) => {
            const color =
              t.status === "passed" ? "var(--green)" : t.status === "failed" ? "var(--red)" : "var(--muted)";
            const icon = t.status === "passed" ? "✓" : t.status === "failed" ? "✕" : "—";
            return (
              <div
                key={i}
                className="row"
                style={{
                  alignItems: "flex-start",
                  gap: 13,
                  padding: "11px 12px",
                  borderBottom: i < v.tests.length - 1 ? "1px solid var(--line)" : "none",
                  background: t.status === "failed" ? "var(--red-soft)" : "transparent",
                  marginLeft: t.status === "failed" ? -12 : 0,
                  marginRight: t.status === "failed" ? -12 : 0,
                }}
              >
                <span style={{ color, fontWeight: 700, width: 16, textAlign: "center", flexShrink: 0, marginTop: 1 }}>
                  {icon}
                </span>
                <div className="grow">
                  <div style={{ fontSize: 13.5, color: t.status === "failed" ? "var(--red)" : "var(--text)" }}>
                    {t.name}
                  </div>
                  <div className="mono" style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 2 }}>
                    {t.file}
                    {t.line && <span style={{ color: "var(--accent)" }}>:{t.line}</span>}
                  </div>
                  {t.error && (
                    <div
                      className="mono"
                      style={{
                        marginTop: 7,
                        padding: "8px 11px",
                        background: "var(--card)",
                        border: "1px solid #efd2cf",
                        borderRadius: 6,
                        fontSize: 11.5,
                        color: "var(--red)",
                        lineHeight: 1.6,
                      }}
                    >
                      {t.error}
                    </div>
                  )}
                </div>
                <span className="tag" style={{ flexShrink: 0, marginTop: 2, textTransform: "none" }}>
                  {t.duration}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasTestResults && (
        <div className="card row" style={{ gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div className="stat-value" style={{ fontSize: 24, color: v.coverage > 0 ? "var(--text)" : "var(--muted)" }}>
              {v.coverage > 0 ? `${v.coverage}%` : "n/a"}
            </div>
            <div className="stat-label">Coverage</div>
          </div>
          <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 24, flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 5 }}>Behavioural safety net</div>
            <div style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.65 }}>{v.coverageNote}</div>
          </div>
        </div>
      )}
    </div>
  );
}
