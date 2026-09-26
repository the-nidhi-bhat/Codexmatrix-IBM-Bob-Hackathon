import { Fragment, useState } from "react";
import { rollbackScenario } from "../mockData";

type TimelineStatus = "regression" | "rollback" | "restored";

const TIMELINE_CONFIG: Record<TimelineStatus, { icon: string; color: string; bg: string }> = {
  regression: { icon: "✗", color: "var(--red)",    bg: "var(--red-dim)" },
  rollback:   { icon: "↺", color: "var(--yellow)", bg: "var(--yellow-dim)" },
  restored:   { icon: "✓", color: "var(--green)",  bg: "#23863633" },
};

export default function RollbackScreen() {
  const [step, setStep] = useState(0); // 0 = nothing revealed yet
  const { timeline, failedTest, bobExplanation, saferAlternative } = rollbackScenario;

  const totalSteps = timeline.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Rollback</h2>
          <p style={{ color: "var(--muted)" }}>
            A regression was detected — watch the automated safety recovery.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setStep(0)} style={btnStyle("var(--muted)")}>Reset</button>
          {step < totalSteps && (
            <button onClick={() => setStep((s) => s + 1)} style={btnStyle("var(--accent)")}>
              {step === 0 ? "▶ Start Demo" : "Next →"}
            </button>
          )}
        </div>
      </div>

      {/* Main timeline */}
      <div className="card" style={{ display: "flex", gap: 0 }}>
        {timeline.map((item, idx) => {
          const cfg = TIMELINE_CONFIG[item.status as TimelineStatus];
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
              {idx < timeline.length - 1 && (
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
            {failedTest.name}
          </div>
          <div className="mono" style={{ color: "var(--muted)", marginBottom: 12 }}>
            {failedTest.file}
            <span style={{ color: "var(--accent)" }}>:{failedTest.line}</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
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
                {failedTest.expected}
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
                {failedTest.received}
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
            {failedTest.error}
          </div>
        </div>
      )}

      {/* Bob's explanation — show after step 3 */}
      {step >= 3 && (
        <div
          className="card"
          style={{ border: "1px solid #23863655", animation: "fadeIn 0.3s ease" }}
        >
          <div className="section-title" style={{ color: "var(--green)" }}>IBM Bob's Explanation</div>
          <p style={{ lineHeight: 1.8, marginBottom: 16 }}>{bobExplanation}</p>

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
            {saferAlternative}
          </div>
        </div>
      )}

      {/* Restored state notice */}
      {step >= 3 && (
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
              Repository restored to last safe state
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
              Safety net: 27/27 tests passing — ready for next attempt
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
