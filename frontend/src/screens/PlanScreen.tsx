import { useState } from "react";
import type { PlanStep, StepStatus } from "../workflow/types";
import { useWorkflow } from "../workflow/WorkflowContext";

const STATUS_CONFIG: Record<StepStatus, { icon: string; color: string; label: string }> = {
  pending:     { icon: "○", color: "var(--muted)",   label: "Pending" },
  running:     { icon: "⟳", color: "var(--yellow)",  label: "Executing" },
  passed:      { icon: "✓", color: "var(--green)",   label: "Completed" },
  failed:      { icon: "✗", color: "var(--red)",     label: "Failed" },
  rolled_back: { icon: "↺", color: "var(--yellow)",  label: "Rolled back" },
  recovered:   { icon: "✓", color: "var(--green)",   label: "Recovered" },
};

function ConnectorLine({ active }: { active: boolean }) {
  return (
    <div
      style={{
        width: 2,
        height: 28,
        background: active ? "var(--green)" : "var(--border)",
        marginLeft: 15,
        transition: "background 0.3s",
      }}
    />
  );
}

function StepRow({ step, isLast, selected, onSelect }: {
  step: PlanStep;
  isLast: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = STATUS_CONFIG[step.status];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 16,
          cursor: "pointer",
        }}
        onClick={onSelect}
      >
        {/* Timeline icon */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: `2px solid ${cfg.color}`,
              background:
                step.status === "passed" || step.status === "recovered"
                  ? "#23863633"
                  : step.status === "running"
                  ? "#9e6a0333"
                  : "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: cfg.color,
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            {cfg.icon}
          </div>
        </div>

        {/* Step body */}
        <div
          style={{
            flex: 1,
            padding: "6px 14px 14px",
            background: selected ? "var(--surface-2)" : "transparent",
            borderRadius: "var(--radius)",
            border: selected ? `1px solid ${cfg.color}44` : "1px solid transparent",
            transition: "all 0.15s",
            opacity: step.status === "pending" ? 0.6 : 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>
              Step {step.id} — {step.title}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "1px 8px",
                borderRadius: 10,
                background:
                  step.status === "passed" || step.status === "recovered"
                    ? "#23863633"
                    : step.status === "running"
                    ? "#9e6a0333"
                    : step.status === "failed" || step.status === "rolled_back"
                    ? "var(--red-dim)"
                    : "var(--surface-2)",
                color: cfg.color,
                fontWeight: 600,
              }}
            >
              {cfg.label}
            </span>
          </div>
          <div style={{ color: "var(--muted)", marginBottom: 8 }}>{step.description}</div>

          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {/* Risk + Expected Impact */}
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start" }}>
                <div>
                  <div className="section-title">Risk</div>
                  <span className={`tag tag-${step.risk}`}>{step.risk}</span>
                </div>
                <div>
                  <div className="section-title">Expected impact</div>
                  <div style={{ color: "var(--accent)", fontSize: 13, lineHeight: 1.6 }}>
                    {step.expectedImpact}
                  </div>
                </div>
              </div>
              <div>
                <div className="section-title">Files affected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {step.filesAffected.map((f) => (
                    <span
                      key={f}
                      className="mono"
                      style={{
                        padding: "2px 10px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--accent)",
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              {step.testsDelta && (
                <div>
                  <div className="section-title">Test result</div>
                  <span
                    className="mono"
                    style={{
                      color:
                        step.testsDelta.includes("✓") ? "var(--green)" : "var(--yellow)",
                    }}
                  >
                    {step.testsDelta}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isLast && (
        <ConnectorLine active={step.status === "passed" || step.status === "recovered"} />
      )}
    </div>
  );
}

export default function PlanScreen() {
  const { state } = useWorkflow();
  const planSteps = state.plan;

  const [selected, setSelected] = useState<number | null>(3);
  const completed  = planSteps.filter((s) => s.status === "passed" || s.status === "recovered").length;
  const inProgress = planSteps.filter((s) => s.status === "running").length;
  const pending    = planSteps.filter((s) => s.status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Modernization Plan</h2>
        <p style={{ color: "var(--muted)" }}>
          IBM Bob's incremental step-by-step plan — click any step for details.
        </p>
      </div>

      <div className="card" style={{ display: "flex", gap: 24, alignItems: "center" }}>
        {[
          { label: "Completed",   count: completed,  color: "var(--green)"  },
          { label: "In Progress", count: inProgress, color: "var(--yellow)" },
          { label: "Pending",     count: pending,    color: "var(--muted)"  },
          { label: "Total Steps", count: planSteps.length, color: "var(--text)" },
        ].map(({ label, count, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{count}</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ paddingBottom: 8 }}>
        {planSteps.map((step, idx) => (
          <StepRow
            key={step.id}
            step={step}
            isLast={idx === planSteps.length - 1}
            selected={selected === step.id}
            onSelect={() => setSelected(selected === step.id ? null : step.id)}
          />
        ))}
      </div>
    </div>
  );
}
