import { useWorkflow } from "../workflow/WorkflowContext";

export default function ReportScreen() {
  const { state } = useWorkflow();
  const r = state.report;
  const repo = state.repository;
  const net = state.safetyNet;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Final Report</h2>
          <p style={{ color: "var(--muted)" }}>
            Audit trail and outcome summary for this modernization session.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              padding: "4px 12px",
              background: "#9e6a0315",
              border: "1px solid #9e6a0333",
              borderRadius: 20,
              fontSize: 11,
              color: "var(--yellow)",
              fontWeight: 600,
            }}
          >
            Demo · mock data
          </div>
          <div
            style={{
              padding: "4px 12px",
              background: "#23863622",
              border: "1px solid #23863644",
              borderRadius: 20,
              fontSize: 11,
              color: "var(--green)",
              fontWeight: 600,
            }}
          >
            ✓ Session complete
          </div>
        </div>
      </div>

      {/* Session summary */}
      <div className="card">
        <div className="section-title">Session Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Steps Completed",  value: r.stepsCompleted.toString(),  color: "var(--green)" },
            { label: "Steps Rolled Back", value: r.stepsRolledBack.toString(), color: "var(--yellow)" },
            { label: "Tests Passing",    value: `${net.passing}/${net.total}`,        color: "var(--green)" },
            { label: "Duration",         value: r.duration,                   color: "var(--text)" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                padding: "12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Repository",     value: repo.name },
            { label: "Runtime Upgrade", value: `${repo.runtime} → 18 LTS` },
            { label: "Session started", value: r.startedAt },
            { label: "Session ended", value: r.endedAt },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "var(--muted)", minWidth: 120, fontSize: 13 }}>{label}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Before / After */}
      <div className="card">
        <div className="section-title">Before → After</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {(["before", "after"] as const).map((side) => {
            const data = r[side];
            const isAfter = side === "after";
            return (
              <div
                key={side}
                style={{
                  padding: "14px",
                  background: isAfter ? "#23863615" : "var(--surface-2)",
                  border: `1px solid ${isAfter ? "#23863644" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 10,
                    color: isAfter ? "var(--green)" : "var(--muted)",
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                  }}
                >
                  {isAfter ? "After" : "Before"}
                </div>
                {Object.entries(data).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v as string}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Changes applied */}
      <div className="card">
        <div className="section-title">Changes Applied</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {r.changesApplied.map((c, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto auto",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < r.changesApplied.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <span
                style={{
                  textAlign: "center",
                  fontWeight: 700,
                  color: c.status === "applied" ? "var(--green)" : c.status === "rolled-back" ? "var(--yellow)" : "var(--red)",
                  fontSize: 16,
                }}
              >
                {c.status === "applied" ? "✓" : c.status === "rolled-back" ? "↺" : "✗"}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                <div className="mono" style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                  {c.files.join(", ")}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 8px",
                  borderRadius: 10,
                  background:
                    c.status === "applied"
                      ? "#23863622"
                      : c.status === "rolled-back"
                      ? "#9e6a0322"
                      : "var(--red-dim)",
                  color:
                    c.status === "applied"
                      ? "var(--green)"
                      : c.status === "rolled-back"
                      ? "var(--yellow)"
                      : "var(--red)",
                  fontWeight: 600,
                }}
              >
                {c.status}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>{c.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rollback history */}
      <div className="card">
        <div className="section-title">Rollback History</div>
        {r.rollbacks.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>No rollbacks in this session.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {r.rollbacks.map((rb, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 14px",
                  background: "#9e6a0315",
                  border: "1px solid #9e6a0333",
                  borderRadius: "var(--radius)",
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "var(--yellow)", fontSize: 16 }}>↺</span>
                  <span style={{ fontWeight: 600 }}>{rb.step}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: "auto" }}>{rb.time}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>{rb.reason}</div>
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 10px",
                    background: "#23863622",
                    borderRadius: 10,
                    color: "var(--green)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ✓ {rb.recovery}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div className="card">
        <div className="section-title">Audit Trail</div>
        <div
          className="mono"
          style={{
            background: "#0d1117",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "12px 14px",
            maxHeight: 280,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {r.auditTrail.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontSize: 12, lineHeight: 1.7 }}>
              <span style={{ color: "var(--muted)", flexShrink: 0, width: 60 }}>{entry.time}</span>
              <span
                style={{
                  color:
                    entry.type === "success"
                      ? "var(--green)"
                      : entry.type === "warn"
                      ? "var(--yellow)"
                      : entry.type === "error"
                      ? "var(--red)"
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
