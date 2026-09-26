import { Fragment, useState } from "react";
import { useWorkflow } from "../workflow/WorkflowContext";

const TIMELINE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  regression: { icon: "✗", color: "var(--red)",    bg: "var(--red-dim)" },
  rollback:   { icon: "↺", color: "var(--yellow)", bg: "var(--yellow-dim)" },
  restored:   { icon: "✓", color: "var(--green)",  bg: "#23863633" },
  unknown:    { icon: "?", color: "var(--muted)",  bg: "var(--surface-2)" },
};

const ROLLBACK_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "var(--muted)" },
  running: { label: "Running", color: "var(--yellow)" },
  complete: { label: "Complete", color: "var(--green)" },
  failed: { label: "Failed", color: "var(--red)" },
  not_triggered: { label: "not triggered", color: "var(--muted)" },
};

const RECOVERY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "var(--muted)" },
  running: { label: "Running", color: "var(--yellow)" },
  passed: { label: "Passed", color: "var(--green)" },
  failed: { label: "Failed", color: "var(--red)" },
  not_run: { label: "not run", color: "var(--muted)" },
};

export default function RollbackScreen() {
  const { state } = useWorkflow();
  const rb = state.rollback;
  const [step, setStep] = useState(0);
  const rollbackStatus = ROLLBACK_STATUS_CONFIG[rb.rollbackStatus] ?? { label: "Unknown status", color: "var(--muted)" };
  const recoveryStatus = RECOVERY_STATUS_CONFIG[rb.recoveryValidation] ?? { label: "Unknown status", color: "var(--muted)" };

  if (!ROLLBACK_STATUS_CONFIG[rb.rollbackStatus]) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Rollback</h2>
        <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap", color: "var(--muted)" }}>
          <span>Rollback: {rollbackStatus.label}</span>
          <span>Recovery: {recoveryStatus.label}</span>
        </div>
      </div>
    );
  }

  if (rb.rollbackStatus === "not_triggered") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Rollback</h2>
          <p style={{ color: "var(--muted)" }}>No rollback has been triggered for this workflow.</p>
        </div>
        <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span style={{ color: rollbackStatus.color }}>Rollback: {rollbackStatus.label}</span>
          <span style={{ color: recoveryStatus.color }}>Recovery: {recoveryStatus.label}</span>
        </div>
      </div>
    );
  }

  const totalSteps = rb.timeline.length;

  const stepTitle = state.plan.find((s) => s.id === rb.stepId)?.title ?? `Step ${rb.stepId}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Rollback</h2>
          <p style={{ color: "var(--muted)" }}>
            Rollback and recovery status from this workflow.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setStep(0)} style={btnStyle("var(--muted)")}>Reset</button>
          {step < totalSteps && (
            <button onClick={() => setStep((s) => s + 1)} style={btnStyle("var(--accent)")}>
              {step === 0 ? "▶ Start Timeline" : "Next →"}
            </button>
          )}
        </div>
      </div>

      {/* Step context */}
      <div
        style={{
          padding: "10px 16px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          display: "flex",
          gap: 24,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>Step  </span>
          <span style={{ fontWeight: 600 }}>Step {rb.stepId} — {stepTitle}</span>
        </div>
        <div className="mono" style={{ fontSize: 11 }}>
          <span style={{ color: "var(--muted)" }}>good commit  </span>
          <span style={{ color: "var(--green)" }}>{rb.previousCommit}</span>
          <span style={{ color: "var(--muted)", margin: "0 8px" }}>→</span>
          <span style={{ color: "var(--muted)" }}>failed commit  </span>
          <span style={{ color: "var(--red)" }}>{rb.failedCommit}</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <span style={{ fontSize: 12 }}>
            <span style={{ color: "var(--muted)" }}>Rollback:  </span>
            <span style={{ color: rollbackStatus.color, fontWeight: 600 }}>
              {rollbackStatus.label}
            </span>
          </span>
          <span style={{ fontSize: 12 }}>
            <span style={{ color: "var(--muted)" }}>Recovery:  </span>
            <span style={{ color: recoveryStatus.color, fontWeight: 600 }}>
              {recoveryStatus.label}
            </span>
          </span>
        </div>
      </div>

      {/* Main timeline */}
      <div className="card" style={{ display: "flex", gap: 0 }}>
        {rb.timeline.map((item, idx) => {
          const cfg = TIMELINE_CONFIG[item.status] ?? TIMELINE_CONFIG.unknown;
          const active = idx < step;
          const current = idx === step - 1;
          return (
            <Fragment key={item.status}>
              <div
                style={{
                  flex: 1,
                  padding: "18px 14px",
                  background: active ? cfg.bg : "transparent",
                  border: `1px solid ${active ? cfg.color + "55" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  transition: "all 0.3s",
                  textAlign: "center",
                  margin: "0 4px",
                  boxShadow: current ? `0 0 0 2px ${cfg.color}66` : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    color: active ? cfg.color : "var(--border)",
                    fontWeight: 700,
                    marginBottom: 6,
                    transition: "color 0.3s",
                  }}
                >
                  {cfg.icon}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: active ? cfg.color : "var(--muted)",
                    transition: "color 0.3s",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  {active ? item.time : "--:--:--"}
                </div>
              </div>
              {idx < rb.timeline.length - 1 && (
                <div
                  style={{
                    alignSelf: "center",
                    fontSize: 20,
                    color: idx < step - 1 ? "var(--green)" : "var(--border)",
                    margin: "0 2px",
                    transition: "color 0.3s",
                  }}
                >
                  →
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Failed test detail — show after step 1 */}
      {step >= 1 && (
        <div
          className="card"
          style={{ border: "1px solid #da363555", animation: "fadeIn 0.3s ease" }}
        >
          <div className="section-title" style={{ color: "var(--red)" }}>Failed Test</div>
          <div style={{ marginBottom: 10, fontWeight: 600 }}>
            {rb.failedTestName}
          </div>
          <div className="mono" style={{ color: "var(--muted)", marginBottom: 12 }}>
            {rb.failedTestFile}
            <span style={{ color: "var(--accent)" }}>:{rb.failedTestLine}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div
              style={{
                padding: "10px 14px",
                background: "#23863622",
                border: "1px solid #23863644",
                borderRadius: "var(--radius)",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4 }}>Expected</div>
              <div className="mono" style={{ color: "var(--green)", fontSize: 16, fontWeight: 700 }}>
                {rb.expectedValue}
              </div>
            </div>
            <div
              style={{
                padding: "10px 14px",
                background: "var(--red-dim)",
                border: "1px solid #da363644",
                borderRadius: "var(--radius)",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4 }}>Received</div>
              <div className="mono" style={{ color: "var(--red)", fontSize: 16, fontWeight: 700 }}>
                {rb.receivedValue}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            {rb.errorMessage}
          </div>
        </div>
      )}

      {/* Bob's explanation — show after step 3 */}
      {rb.rollbackStatus === "complete" && rb.recoveryValidation === "passed" && (
        <div
          className="card"
          style={{ border: "1px solid #23863655", animation: "fadeIn 0.3s ease" }}
        >
          <div className="section-title" style={{ color: "var(--green)" }}>IBM Bob's Explanation</div>
          <p style={{ lineHeight: 1.8, marginBottom: 16 }}>{rb.bobExplanation}</p>

          <div className="section-title" style={{ color: "var(--accent)" }}>Safer Alternative</div>
          <div
            style={{
              padding: "12px 16px",
              background: "var(--accent-dim)",
              border: "1px solid #1f6feb44",
              borderRadius: "var(--radius)",
              color: "var(--accent)",
              lineHeight: 1.7,
            }}
          >
            {rb.saferAlternative}
          </div>
        </div>
      )}

      {/* Restored state notice */}
      {rb.rollbackStatus === "complete" && rb.recoveryValidation === "passed" && (
        <div
          className="card"
          style={{
            background: "#23863615",
            border: "1px solid #23863655",
            display: "flex",
            alignItems: "center",
            gap: 14,
            animation: "fadeIn 0.3s ease",
          }}
        >
          <span style={{ fontSize: 28, color: "var(--green)" }}>✓</span>
          <div>
            <div style={{ fontWeight: 700, color: "var(--green)", fontSize: 15 }}>
              Repository restored to commit {rb.previousCommit}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
              Recovery validation: {recoveryStatus.label}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 16px",
    borderRadius: "var(--radius)",
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  };
}
