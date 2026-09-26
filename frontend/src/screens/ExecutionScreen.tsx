import React, { useState, useEffect } from "react";
import { executionState } from "../mockData";

const FINAL_LOG_LINE = { time: "10:42:13", text: "✓ All 27 tests passed. Step complete." };
const FAIL_LOG_LINE  = { time: "10:42:13", text: "✗ 1 test failed — regression detected. Initiating rollback…" };

export default function ExecutionScreen({ onVerify, onRollback }: { onVerify?: () => void; onRollback?: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  // Animate log lines appearing one by one
  useEffect(() => {
    if (visibleLines < executionState.log.length) {
      const t = setTimeout(() => setVisibleLines((v) => v + 1), 420);
      return () => clearTimeout(t);
    } else if (!done) {
      // After log finishes, simulate test result
      const t = setTimeout(() => setDone(true), 800);
      return () => clearTimeout(t);
    }
  }, [visibleLines, done]);

  const shownLines = executionState.log.slice(0, visibleLines);
  const finalLine = done ? (failed ? FAIL_LOG_LINE : FINAL_LOG_LINE) : null;

  const step = executionState.currentStep;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Execution</h2>
          <p style={{ color: "var(--muted)" }}>
            IBM Bob is applying changes in real time.
          </p>
        </div>
        {/* Toggle to simulate pass/fail */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => { setDone(false); setFailed(false); setVisibleLines(0); }}
            style={btnStyle("var(--accent)")}
          >
            ↺ Replay
          </button>
          <button
            onClick={() => { setFailed((f) => !f); }}
            style={btnStyle(failed ? "var(--green)" : "var(--red)")}
          >
            {failed ? "Simulate Pass" : "Simulate Failure"}
          </button>
          {done && !failed && onVerify && (
            <button onClick={onVerify} style={btnStyle("var(--green)")}>
              View Verification →
            </button>
          )}
          {failed && done && onRollback && (
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
          background: "#9e6a0322",
          border: "1px solid #9e6a0355",
          borderRadius: "var(--radius)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 20, color: "var(--yellow)" }}>⟳</span>
        <div>
          <div style={{ fontWeight: 700, color: "var(--yellow)" }}>
            Step {step.id} — {step.title}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{step.description}</div>
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
            {shownLines.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 10, lineHeight: 1.7 }}>
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>{line.time}</span>
                <span style={{ color: "var(--text)" }}>{line.text}</span>
              </div>
            ))}
            {finalLine && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  lineHeight: 1.7,
                  color: finalLine.text.startsWith("✓") ? "var(--green)" : "var(--red)",
                  fontWeight: 700,
                }}
              >
                <span style={{ flexShrink: 0 }}>{finalLine.time}</span>
                <span>{finalLine.text}</span>
              </div>
            )}
            {!done && visibleLines === executionState.log.length && (
              <span style={{ color: "var(--muted)", animation: "pulse 1s infinite" }}>▌</span>
            )}
          </div>
        </div>

        {/* Files changed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="section-title">Files Changed</div>
            {executionState.filesChanged.map((fc) => (
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
            style={{
              border: !done
                ? "1px solid var(--border)"
                : finalLine?.text.startsWith("✓")
                ? "1px solid #23863655"
                : "1px solid #da363355",
            }}
          >
            <div className="section-title">Safety Net Tests</div>
            {!done ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--yellow)" }}>
                <span style={{ fontSize: 18 }}>⟳</span>
                <span>Running 27 tests…</span>
              </div>
            ) : finalLine?.text.startsWith("✓") ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--green)" }}>
                <span style={{ fontSize: 18 }}>✓</span>
                <span style={{ fontWeight: 700 }}>27/27 passed</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--red)" }}>
                <span style={{ fontSize: 18 }}>✗</span>
                <span style={{ fontWeight: 700 }}>1 test failed — regression</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(borderColor: string): React.CSSProperties {
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
