import { useWorkflow } from "../workflow/WorkflowContext";

export default function VerificationScreen({ onRollback }: { onRollback?: () => void }) {
  const { state } = useWorkflow();
  const v = state.checkpointResult;

  if (!v) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Verification</h2>
          <p style={{ color: "var(--muted)" }}>Safety Net: not run</p>
        </div>
        <div className="card" style={{ color: "var(--muted)" }}>
          No checkpoint result has been received for this workflow.
        </div>
      </div>
    );
  }

  const passed  = v.tests.filter((t) => t.status === "passed").length;
  const failed  = v.tests.filter((t) => t.status === "failed").length;
  const skipped = v.tests.filter((t) => t.status === "skipped").length;
  const overallPass = v.tests.length > 0 && passed === v.tests.length;
  const overallFail = failed > 0;
  const resultColor = overallPass ? "var(--green)" : overallFail ? "var(--red)" : "var(--muted)";

  const stepTitle = state.plan.find((s) => s.id === v.stepId)?.title ?? `Step ${v.stepId}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Verification</h2>
          <p style={{ color: "var(--muted)" }}>
            Safety-net tests run after every modernization step.
          </p>
        </div>
      </div>

      {/* PASS / FAIL banner */}
      <div
        style={{
          padding: "16px 20px",
          background: overallPass ? "#23863622" : overallFail ? "var(--red-dim)" : "var(--surface-2)",
          border: `2px solid ${overallPass ? "#23863666" : overallFail ? "#da363366" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <span style={{ fontSize: 32, color: resultColor }}>
          {overallPass ? "✓" : overallFail ? "✗" : "—"}
        </span>
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: resultColor,
            }}
          >
            {overallPass ? "PASS — All checkpoint tests passing" : overallFail ? "FAIL — Regression detected" : "INCOMPLETE — Result not conclusive"}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
            Step {v.stepId}: {stepTitle} · {v.suite} · {v.duration}
          </div>
        </div>
        {overallFail && onRollback && (
          <button
            onClick={onRollback}
            style={{
              marginLeft: "auto",
              padding: "7px 16px",
              background: "transparent",
              border: "1px solid var(--yellow)",
              borderRadius: "var(--radius)",
              color: "var(--yellow)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            View Rollback →
          </button>
        )}
      </div>

      {/* Summary pills — counts come from workflow state */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "Total",   count: v.tests.length, color: "var(--text)",   bg: "var(--surface-2)" },
          { label: "Passed",  count: passed,          color: "var(--green)",  bg: "#23863622" },
          { label: "Failed",  count: failed,          color: "var(--red)",    bg: "var(--red-dim)" },
          { label: "Skipped", count: skipped,         color: "var(--muted)",  bg: "var(--surface-2)" },
        ].map(({ label, count, color, bg }) => (
          <div
            key={label}
            style={{
              padding: "14px",
              background: bg,
              border: `1px solid ${color}44`,
              borderRadius: "var(--radius)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 800, color }}>{count}</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Test list */}
      <div className="card">
        <div className="section-title">Test Results</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {v.tests.map((t, i) => {
            const color =
              t.status === "passed" ? "var(--green)" : t.status === "failed" ? "var(--red)" : "var(--muted)";
            const icon = t.status === "passed" ? "✓" : t.status === "failed" ? "✗" : "—";
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "9px 0",
                  borderBottom: i < v.tests.length - 1 ? "1px solid var(--border)" : "none",
                  background: t.status === "failed" ? "#da363308" : "transparent",
                  borderRadius: t.status === "failed" ? 4 : 0,
                }}
              >
                <span style={{ color, fontWeight: 700, width: 16, textAlign: "center", flexShrink: 0, marginTop: 1 }}>
                  {icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: t.status === "failed" ? "var(--red)" : "var(--text)" }}>
                    {t.name}
                  </div>
                  <div className="mono" style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                    {t.file}
                    {t.line && <span style={{ color: "var(--accent)" }}>:{t.line}</span>}
                  </div>
                  {t.error && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        background: "var(--surface-2)",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--red)",
                        fontStyle: "italic",
                      }}
                    >
                      {t.error}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "1px 8px",
                    borderRadius: 10,
                    background: `${color}22`,
                    color,
                    border: `1px solid ${color}44`,
                    fontWeight: 600,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {t.duration}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coverage note */}
      <div className="card" style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{v.coverage}%</div>
          <div style={{ color: "var(--muted)", fontSize: 11 }}>Coverage</div>
        </div>
        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20, flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Behavioral safety net</div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
            {v.coverageNote}
          </div>
        </div>
      </div>
    </div>
  );
}
