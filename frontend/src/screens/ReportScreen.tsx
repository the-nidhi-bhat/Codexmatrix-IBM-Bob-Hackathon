import { useWorkflow } from "../workflow/WorkflowContext";

const STATUS_TONE: Record<string, string> = {
  completed: "tag-green",
  passed: "tag-green",
  failed: "tag-high",
  running: "tag-medium",
  rolled_back: "tag-medium",
};

export default function ReportScreen() {
  const { state } = useWorkflow();
  const r = state.report;
  const repo = state.repository;

  const summary = [
    {
      label: "Steps completed",
      value: state.execution.status === "not_available" ? "n/a" : r.stepsCompleted.toString(),
      tone: "var(--text)",
    },
    {
      label: "Steps rolled back",
      value: state.rollback.rollbackStatus === "not_triggered" ? "none" : r.stepsRolledBack.toString(),
      tone: "var(--text)",
    },
    {
      label: "Tests passing",
      value:
        state.checkpointResult?.status === "not_available" ? "n/a"
        : state.checkpointResult?.status === "running" ? "running"
        : state.checkpointResult?.status === "passed" || state.checkpointResult?.status === "failed"
          ? `${state.checkpointResult.passed}/${state.checkpointResult.total}`
          : "not run",
      tone: "var(--text)",
    },
    { label: "Duration", value: r.duration, tone: "var(--text)" },
  ];

  return (
    <div className="stack stack-24">
      <div className="page-head">
        <div>
          <h1 className="page-title">Final report</h1>
          <p className="page-sub">Audit trail and outcome summary for this modernization session.</p>
        </div>
        <span className={`tag ${STATUS_TONE[state.overallStatus] ?? ""}`}>{state.overallStatus}</span>
      </div>

      {/* Session summary */}
      <div className="card">
        <div className="section-title">Session summary</div>
        <div className="cols-4" style={{ marginBottom: 20 }}>
          {summary.map(({ label, value, tone }) => (
            <div key={label}>
              <div className="stat-value stat-value-sm" style={{ color: tone }}>{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
        <div className="cols-2" style={{ gap: 10 }}>
          {[
            { label: "Repository",      value: repo.name },
            { label: "Runtime",         value: repo.runtime },
            { label: "Session started", value: r.startedAt },
            { label: "Session ended",   value: r.endedAt },
          ].map(({ label, value }) => (
            <div key={label} className="kv">
              <span className="kv-key">{label}</span>
              <span className="kv-val mono" style={{ fontSize: 12, color: "var(--accent)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Before / After */}
      <div className="card">
        <div className="section-title">Before → after</div>
        <div className="cols-2">
          {(["before", "after"] as const).map((side) => {
            const data = r[side];
            const isAfter = side === "after";
            return (
              <div
                key={side}
                className="panel"
                style={{
                  padding: "16px 18px",
                  background: isAfter ? "var(--green-soft)" : "var(--sunk)",
                  borderColor: isAfter ? "#cfe2d7" : "var(--line)",
                }}
              >
                <div
                  style={{
                    fontWeight: 650,
                    marginBottom: 10,
                    color: isAfter ? "var(--green)" : "var(--muted)",
                    textTransform: "uppercase",
                    fontSize: 10.5,
                    letterSpacing: "0.11em",
                  }}
                >
                  {isAfter ? "After" : "Before"}
                </div>
                {Object.entries(data).map(([k, v]) => (
                  <div key={k} className="kv" style={{ padding: "6px 0", fontSize: 13 }}>
                    <span className="kv-key" style={{ flex: 1, minWidth: 0 }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: "right" }}>{v as string}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Changes applied */}
      <div className="card">
        <div className="section-title">Changes applied</div>
        {r.changesApplied.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No changes were applied in this session.</p>
        )}
        {r.changesApplied.map((c, i) => {
          const tone =
            c.status === "applied" ? "var(--green)" : c.status === "rolled-back" ? "var(--yellow)" : "var(--red)";
          const tag =
            c.status === "applied" ? "tag-green" : c.status === "rolled-back" ? "tag-medium" : "tag-high";
          return (
            <div
              key={i}
              className="row"
              style={{
                gap: 14,
                padding: "12px 0",
                borderBottom: i < r.changesApplied.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <span style={{ color: tone, fontWeight: 700, width: 18, textAlign: "center", flexShrink: 0 }}>
                {c.status === "applied" ? "✓" : c.status === "rolled-back" ? "↺" : "✕"}
              </span>
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title}</div>
                <div className="mono" style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 3 }}>
                  {c.files.join(", ")}
                </div>
              </div>
              <span className={`tag ${tag}`}>{c.status}</span>
              <span className="mono dim" style={{ fontSize: 11, flexShrink: 0 }}>{c.time}</span>
            </div>
          );
        })}
      </div>

      {/* Rollback history */}
      <div className="card">
        <div className="section-title">Rollback history</div>
        {r.rollbacks.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No rollbacks in this session.</p>
        ) : (
          <div className="stack stack-12">
            {r.rollbacks.map((rb, i) => (
              <div key={i} className="note note-warn" style={{ padding: "15px 18px" }}>
                <div className="row" style={{ gap: 12, alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ color: "var(--yellow)", fontSize: 15 }}>↺</span>
                  <span style={{ fontWeight: 600 }}>{rb.step}</span>
                  <span className="mono dim" style={{ fontSize: 11.5, marginLeft: "auto" }}>{rb.time}</span>
                </div>
                <div style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.65 }}>{rb.reason}</div>
                <span className="tag tag-green" style={{ marginTop: 12 }}>✓ {rb.recovery}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div className="card">
        <div className="section-title">Audit trail</div>
        <div className="log-block" style={{ maxHeight: 300 }}>
          {r.auditTrail.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 14 }}>
              <span style={{ color: "var(--muted)", flexShrink: 0, width: 58 }}>{entry.time}</span>
              <span
                style={{
                  color:
                    entry.type === "success" ? "var(--green)"
                    : entry.type === "warn" ? "var(--yellow)"
                    : entry.type === "error" ? "var(--red)"
                    : "var(--text)",
                }}
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
