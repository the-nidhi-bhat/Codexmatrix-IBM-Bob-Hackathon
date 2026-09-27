import { Fragment, useState } from "react";
import { useWorkflow } from "../workflow/WorkflowContext";

const TIMELINE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  regression: { icon: "✕",  color: "var(--red)",    bg: "var(--red-soft)" },
  rollback:   { icon: "↺",  color: "var(--yellow)", bg: "var(--yellow-soft)" },
  restored:   { icon: "✓",  color: "var(--green)",  bg: "var(--green-soft)" },
  unknown:    { icon: "·",  color: "var(--muted)",  bg: "var(--sunk)" },
};

const ROLLBACK_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:       { label: "Pending",       color: "var(--muted)" },
  running:       { label: "Running",       color: "var(--yellow)" },
  complete:      { label: "Complete",      color: "var(--green)" },
  failed:        { label: "Failed",        color: "var(--red)" },
  not_triggered: { label: "Not triggered", color: "var(--muted)" },
};

const RECOVERY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: "var(--muted)" },
  running:  { label: "Running",  color: "var(--yellow)" },
  passed:   { label: "Passed",   color: "var(--green)" },
  failed:   { label: "Failed",   color: "var(--red)" },
  not_run:  { label: "Not run",  color: "var(--muted)" },
};

export default function RollbackScreen() {
  const { state } = useWorkflow();
  const rb = state.rollback;
  const [step, setStep] = useState(0);
  const rollbackStatus = ROLLBACK_STATUS_CONFIG[rb.rollbackStatus] ?? { label: "Unknown", color: "var(--muted)" };
  const recoveryStatus = RECOVERY_STATUS_CONFIG[rb.recoveryValidation] ?? { label: "Unknown", color: "var(--muted)" };

  if (!ROLLBACK_STATUS_CONFIG[rb.rollbackStatus]) {
    return (
      <div className="stack stack-20">
        <div className="page-head">
          <div>
            <h1 className="page-title">Rollback</h1>
            <p className="page-sub">Status is still being determined for this workflow.</p>
          </div>
        </div>
        <div className="note row" style={{ gap: 28, flexWrap: "wrap" }}>
          <span className="status" style={{ color: rollbackStatus.color }}>Rollback · {rollbackStatus.label}</span>
          <span className="status" style={{ color: recoveryStatus.color }}>Recovery · {recoveryStatus.label}</span>
        </div>
      </div>
    );
  }

  if (rb.rollbackStatus === "not_triggered") {
    return (
      <div className="stack stack-20">
        <div className="page-head">
          <div>
            <h1 className="page-title">Rollback</h1>
            <p className="page-sub">No rollback has been triggered for this workflow.</p>
          </div>
        </div>
        <div className="note row" style={{ gap: 28, flexWrap: "wrap" }}>
          <span className="status" style={{ color: rollbackStatus.color }}>Rollback · {rollbackStatus.label}</span>
          <span className="status" style={{ color: recoveryStatus.color }}>Recovery · {recoveryStatus.label}</span>
        </div>
        <div className="card">
          <div className="section-title">What happens here</div>
          <p style={{ color: "var(--text-2)", lineHeight: 1.75, maxWidth: "68ch" }}>
            If a checkpoint verification fails after a change, the commit is reverted
            automatically, the repository is returned to its last known-good state, and the
            recovery run is re-verified before anything else is attempted.
          </p>
        </div>
      </div>
    );
  }

  const totalSteps = rb.timeline.length;
  const stepTitle = state.plan.find((s) => s.id === rb.stepId)?.title ?? `Step ${rb.stepId}`;
  const explainVisible = rb.rollbackStatus === "complete" && rb.recoveryValidation === "passed";

  return (
    <div className="stack stack-24">
      <div className="page-head">
        <div>
          <h1 className="page-title">Rollback</h1>
          <p className="page-sub">Regression, revert and recovery — step through the timeline.</p>
        </div>
        <div className="row" style={{ gap: 9 }}>
          <button className="btn btn-quiet" onClick={() => setStep(0)} disabled={step === 0}>Reset</button>
          {step < totalSteps && (
            <button className="btn btn-solid" onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? "Start timeline" : "Next step →"}
            </button>
          )}
        </div>
      </div>

      {/* Context bar */}
      <div className="panel" style={{ padding: "14px 20px", display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5 }}>
          <span className="dim" style={{ marginRight: 9 }}>Affected</span>
          <strong>Step {rb.stepId} — {stepTitle}</strong>
        </div>
        <div className="mono" style={{ fontSize: 11.5 }}>
          <span className="dim">good </span>
          <span style={{ color: "var(--green)" }}>{rb.previousCommit}</span>
          <span className="dim" style={{ margin: "0 9px" }}>→</span>
          <span className="dim">failed </span>
          <span style={{ color: "var(--red)" }}>{rb.failedCommit}</span>
        </div>
        <div className="row" style={{ gap: 20, marginLeft: "auto", fontSize: 12.5 }}>
          <span className="status" style={{ color: rollbackStatus.color }}>Rollback · {rollbackStatus.label}</span>
          <span className="status" style={{ color: recoveryStatus.color }}>Recovery · {recoveryStatus.label}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="card card-flush">
        <div style={{ display: "flex", alignItems: "stretch" }}>
          {rb.timeline.map((item, idx) => {
            const cfg = TIMELINE_CONFIG[item.status] ?? TIMELINE_CONFIG.unknown;
            const active = idx < step;
            const current = idx === step - 1;
            return (
              <Fragment key={item.status}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "20px 18px",
                    background: active ? cfg.bg : "var(--card)",
                    borderRight: idx < rb.timeline.length - 1 ? "1px solid var(--line)" : "none",
                    borderTop: `3px solid ${active ? cfg.color : "transparent"}`,
                    transition: "background 0.3s, border-color 0.3s",
                    boxShadow: current ? "inset 0 0 0 1px rgba(27,26,23,0.06)" : "none",
                  }}
                >
                  <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: active ? cfg.color : "var(--muted)",
                        border: `1.5px solid ${active ? cfg.color : "var(--line-2)"}`,
                        background: "var(--card)",
                        flexShrink: 0,
                        transition: "all 0.3s",
                      }}
                    >
                      {cfg.icon}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: active ? cfg.color : "var(--muted)" }}>
                      {item.label}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: active ? "var(--text-2)" : "var(--line-2)" }}>
                    {active ? item.time : "--:--:--"}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Failed test detail */}
      {step >= 1 && (
        <div className="note note-danger" style={{ animation: "fadeIn 0.3s ease" }}>
          <div className="section-title" style={{ color: "var(--red)", marginBottom: 10 }}>Failed test</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{rb.failedTestName}</div>
          <div className="mono" style={{ color: "var(--text-2)", marginTop: 4 }}>
            {rb.failedTestFile}
            <span style={{ color: "var(--accent)" }}>:{rb.failedTestLine}</span>
          </div>

          <div className="cols-2" style={{ marginTop: 16 }}>
            <div className="note note-ok" style={{ padding: "13px 16px" }}>
              <div className="stat-label" style={{ marginTop: 0 }}>Expected</div>
              <div className="mono" style={{ color: "var(--green)", fontSize: 16, fontWeight: 600, marginTop: 6 }}>
                {rb.expectedValue}
              </div>
            </div>
            <div className="note note-danger" style={{ padding: "13px 16px", background: "#fff", borderColor: "#efd2cf" }}>
              <div className="stat-label" style={{ marginTop: 0 }}>Received</div>
              <div className="mono" style={{ color: "var(--red)", fontSize: 16, fontWeight: 600, marginTop: 6 }}>
                {rb.receivedValue}
              </div>
            </div>
          </div>

          <div
            className="mono"
            style={{
              marginTop: 14,
              padding: "12px 15px",
              background: "var(--card)",
              border: "1px solid #efd2cf",
              borderRadius: 8,
              color: "var(--text-2)",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            {rb.errorMessage}
          </div>
        </div>
      )}

      {/* Bob's explanation + safer alternative */}
      {explainVisible && (
        <div className="card" style={{ animation: "fadeIn 0.3s ease" }}>
          <div className="section-title">IBM Bob's explanation</div>
          <p style={{ lineHeight: 1.8, maxWidth: "74ch", fontSize: 14.5 }}>{rb.bobExplanation}</p>

          <div className="section-title" style={{ marginTop: 24 }}>Safer alternative</div>
          <div className="note note-accent" style={{ color: "var(--accent-ink)", lineHeight: 1.75, fontSize: 14 }}>
            {rb.saferAlternative}
          </div>
        </div>
      )}

      {/* Restored notice */}
      {explainVisible && (
        <div className="note note-ok" style={{ animation: "fadeIn 0.3s ease" }}>
          <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
            <span style={{ fontSize: 22, color: "var(--green)", lineHeight: 1.1 }}>✓</span>
            <div>
              <div className="note-title" style={{ color: "var(--green)" }}>
                Repository restored to commit {rb.previousCommit}
              </div>
              <div className="note-body">Recovery validation · {recoveryStatus.label}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
