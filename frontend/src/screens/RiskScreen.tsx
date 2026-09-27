import { useState } from "react";
import type { RiskFinding, RiskLevel } from "../workflow/types";
import { useWorkflow } from "../workflow/WorkflowContext";

const LEVEL_ORDER: RiskLevel[] = ["high", "medium", "low"];

const LEVEL_COLOR: Record<RiskLevel, string> = {
  high: "var(--red)",
  medium: "var(--yellow)",
  low: "var(--text-blue)",
};

function RiskCard({ item, expanded, onToggle }: {
  item: RiskFinding;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = LEVEL_COLOR[item.level];

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      style={{
        cursor: "pointer",
        borderLeft: `3px solid ${color}`,
        boxShadow: expanded ? "var(--shadow-sm)" : "var(--shadow-xs)",
        transition: "box-shadow 0.15s",
      }}
    >
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <span className={`tag tag-${item.level}`} style={{ flexShrink: 0, marginTop: 2 }}>
          {item.level}
        </span>
        <div className="grow">
          <div style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>{item.title}</div>
          <div className="mono" style={{ color: "var(--muted)", marginTop: 3 }}>
            {item.file}
            {item.line && <span style={{ color: "var(--accent)" }}>:{item.line}</span>}
          </div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 11, flexShrink: 0, marginTop: 5 }}>
          {expanded ? "HIDE −" : "SHOW +"}
        </span>
      </div>

      {expanded && (
        <div
          className="stack stack-16"
          style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <div className="section-title">Why it is risky</div>
            <p style={{ lineHeight: 1.7 }}>{item.reason}</p>
          </div>

          <div>
            <div className="section-title">Blast radius / evidence</div>
            <div className="panel" style={{ padding: "13px 16px", background: "var(--red-soft)", borderColor: "var(--line-red)" }}>
              <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 5, fontSize: 13 }}>
                {item.blastRadius}
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--text-2)" }}>{item.evidence}</div>
            </div>
          </div>

          <div>
            <div className="section-title">Modernization opportunity</div>
            <div className="note note-accent" style={{ padding: "13px 16px", color: "var(--accent-ink)" }}>
              {item.opportunity}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountPill({ level, count }: { level: RiskLevel; count: number }) {
  return (
    <div className="stat" style={{ borderTop: `3px solid ${LEVEL_COLOR[level]}` }}>
      <div className="stat-value" style={{ color: LEVEL_COLOR[level] }}>{count}</div>
      <div className="stat-label">{level} risk</div>
    </div>
  );
}

export default function RiskScreen() {
  const { state } = useWorkflow();
  const risks = state.risks;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiskLevel | "all">("all");

  const counts = {
    high:   risks.filter((r) => r.level === "high").length,
    medium: risks.filter((r) => r.level === "medium").length,
    low:    risks.filter((r) => r.level === "low").length,
  };

  const filtered = filter === "all" ? risks : risks.filter((r) => r.level === filter);
  const sorted = [...filtered].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
  );

  return (
    <div className="stack stack-20">
      <div className="page-head">
        <div>
          <h1 className="page-title">Risk assessment</h1>
          <p className="page-sub">
            {risks.length} finding{risks.length === 1 ? "" : "s"} surfaced across the legacy codebase,
            ordered by severity.
          </p>
        </div>
      </div>

      <div className="cols-3">
        <CountPill level="high"   count={counts.high} />
        <CountPill level="medium" count={counts.medium} />
        <CountPill level="low"    count={counts.low} />
      </div>

      <div className="row" style={{ gap: 8 }}>
        {(["all", "high", "medium", "low"] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`btn ${filter === lvl ? "btn-solid" : "btn-quiet"}`}
            aria-pressed={filter === lvl}
          >
            {lvl === "all" ? `All · ${risks.length}` : `${lvl} · ${counts[lvl]}`}
          </button>
        ))}
      </div>

      <div className="stack stack-12">
        {sorted.length === 0 && (
          <div className="note">
            <div className="note-title" style={{ color: "var(--muted)" }}>Nothing to show</div>
            <div className="note-body">No findings match this filter.</div>
          </div>
        )}
        {sorted.map((item) => (
          <RiskCard
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
          />
        ))}
      </div>
    </div>
  );
}
