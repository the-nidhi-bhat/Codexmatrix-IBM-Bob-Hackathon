import { useState } from "react";
import type { PlanStep } from "../workflow/types";
import { useWorkflow } from "../workflow/WorkflowContext";

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string; tag: string }> = {
  pending:     { icon: "○", color: "var(--muted)",  label: "Pending",     tag: "" },
  running:     { icon: "•", color: "var(--yellow)", label: "Executing",   tag: "tag-medium" },
  passed:      { icon: "✓", color: "var(--green)",  label: "Completed",   tag: "tag-green" },
  failed:      { icon: "✕", color: "var(--red)",    label: "Failed",      tag: "tag-high" },
  rolled_back: { icon: "↺", color: "var(--yellow)", label: "Rolled back", tag: "tag-medium" },
  recovered:   { icon: "✓", color: "var(--green)",  label: "Recovered",   tag: "tag-green" },
  unverified:  { icon: "—", color: "var(--muted)",  label: "Unverified",  tag: "" },
};

function ConnectorLine({ active }: { active: boolean }) {
  return (
    <div
      style={{
        width: 1,
        height: 26,
        background: active ? "var(--green)" : "var(--line-2)",
        marginLeft: 13,
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
  const cfg = STATUS_CONFIG[step.status] ?? { icon: "○", color: "var(--muted)", label: "Unknown", tag: "" };

  return (
    <div>
      <div
        className="row"
        style={{ alignItems: "flex-start", gap: 14, cursor: "pointer" }}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        aria-expanded={selected}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      >
        {/* Timeline marker */}
        <div
          style={{
            width: 27,
            height: 27,
            borderRadius: "50%",
            border: `1.5px solid ${cfg.color}`,
            background: "var(--card)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: cfg.color,
            fontWeight: 700,
            fontSize: 12,
            flexShrink: 0,
            marginTop: 1,
            transition: "all 0.2s",
          }}
        >
          {cfg.icon}
        </div>

        {/* Step body */}
        <div
          className="grow"
          style={{
            padding: selected ? "10px 16px 16px" : "6px 16px 16px",
            background: selected ? "var(--sunk)" : "transparent",
            borderRadius: "var(--radius)",
            border: "1px solid transparent",
            borderColor: selected ? "var(--line)" : "transparent",
            transition: "background 0.15s, border-color 0.15s",
            opacity: step.status === "pending" ? 0.65 : 1,
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 11, marginRight: 9 }}>
                {String(step.id).padStart(2, "0")}
              </span>
              {step.title}
            </span>
            <span className={`tag ${cfg.tag}`}>{cfg.label}</span>
          </div>

          <div style={{ color: "var(--text-2)", marginTop: 5, fontSize: 13.5, lineHeight: 1.6 }}>
            {step.description}
          </div>

          {selected && (
            <div className="stack stack-16" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div className="cols-2" style={{ gap: 20 }}>
                <div>
                  <div className="section-title">Risk</div>
                  <span className={`tag tag-${step.risk}`}>{step.risk}</span>
                </div>
                <div>
                  <div className="section-title">Expected impact</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--accent-ink)" }}>
                    {step.expectedImpact}
                  </div>
                </div>
              </div>

              <div>
                <div className="section-title">Files affected</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
                  {step.filesAffected.map((f) => (
                    <span key={f} className="chip">{f}</span>
                  ))}
                </div>
              </div>

              {step.testsDelta && (
                <div>
                  <div className="section-title">Test result</div>
                  <span
                    className="mono"
                    style={{ color: step.testsDelta.includes("✓") ? "var(--green)" : "var(--yellow)" }}
                  >
                    {step.testsDelta}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isLast && <ConnectorLine active={step.status === "passed" || step.status === "recovered"} />}
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
  const unverified = planSteps.filter((s) => s.status === "unverified").length;

  const counters = [
    { label: "Completed",   count: completed,  color: "var(--green)"  },
    { label: "In progress", count: inProgress, color: "var(--yellow)" },
    { label: "Pending",     count: pending,    color: "var(--muted)"  },
    ...(unverified > 0 ? [{ label: "Unverified", count: unverified, color: "var(--muted)" }] : []),
    { label: "Total steps", count: planSteps.length, color: "var(--text)" },
  ];

  return (
    <div className="stack stack-20">
      <div className="page-head">
        <div>
          <h1 className="page-title">Modernization plan</h1>
          <p className="page-sub">Ordered, incremental steps produced by the analysis. Select any step for detail.</p>
        </div>
      </div>

      {!planSteps.some((step) => step.operationId) && (
        <div className="note">
          <div className="note-title" style={{ color: "var(--muted)" }}>Execution not available</div>
          <div className="note-body">
            No approved controlled transformation was identified for this repository.
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
          gap: 20,
          padding: "20px 24px",
        }}
      >
        {counters.map(({ label, count, color }) => (
          <div key={label}>
            <div className="stat-value" style={{ color }}>{count}</div>
            <div className="stat-label" style={{ marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "24px 24px 8px" }}>
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
