import { useState } from "react";
import type { RiskItem, RiskLevel } from "../mockData";
import { risks } from "../mockData";

const LEVEL_ORDER: RiskLevel[] = ["high", "medium", "low"];

function RiskCard({ item, expanded, onToggle }: {
  item: RiskItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        cursor: "pointer",
        border: `1px solid ${
          item.level === "high"
            ? "#da363355"
            : item.level === "medium"
            ? "#9e6a0355"
            : "#1f6feb55"
        }`,
        transition: "box-shadow 0.15s",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span className={`tag tag-${item.level}`} style={{ flexShrink: 0, marginTop: 2 }}>
          {item.level}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
          <div className="mono" style={{ color: "var(--muted)" }}>
            {item.file}
            {item.line && <span style={{ color: "var(--accent)" }}>:{item.line}</span>}
          </div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <div className="section-title">Why it's risky</div>
            <p style={{ color: "var(--text)", lineHeight: 1.7 }}>{item.reason}</p>
          </div>
          <div>
            <div className="section-title">Blast radius / Evidence</div>
            <div
              style={{
                padding: "10px 14px",
                background: "var(--red-dim)",
                border: "1px solid #da363333",
                borderRadius: "var(--radius)",
                color: "var(--muted)",
                lineHeight: 1.6,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>
                {item.blastRadius}
              </div>
              <div className="mono" style={{ fontSize: 11 }}>{item.evidence}</div>
            </div>
          </div>
          <div>
            <div className="section-title">Modernization opportunity</div>
            <div
              style={{
                padding: "10px 14px",
                background: "var(--accent-dim)",
                border: "1px solid #1f6feb44",
                borderRadius: "var(--radius)",
                color: "var(--accent)",
              }}
            >
              {item.opportunity}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountPill({ level, count }: { level: RiskLevel; count: number }) {
  const colors: Record<RiskLevel, { bg: string; color: string }> = {
    high: { bg: "var(--red-dim)", color: "var(--red)" },
    medium: { bg: "var(--yellow-dim)", color: "var(--yellow)" },
    low: { bg: "var(--accent-dim)", color: "var(--accent)" },
  };
  return (
    <div
      style={{
        flex: 1,
        padding: "16px",
        background: colors[level].bg,
        border: `1px solid ${colors[level].color}44`,
        borderRadius: "var(--radius)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 800, color: colors[level].color }}>{count}</div>
      <div style={{ color: "var(--muted)", textTransform: "capitalize", marginTop: 4 }}>{level} risk</div>
    </div>
  );
}

export default function RiskScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiskLevel | "all">("all");

  const counts = {
    high: risks.filter((r) => r.level === "high").length,
    medium: risks.filter((r) => r.level === "medium").length,
    low: risks.filter((r) => r.level === "low").length,
  };

  const filtered = filter === "all" ? risks : risks.filter((r) => r.level === filter);
  // Sort by severity within filtered
  const sorted = [...filtered].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Risk Assessment</h2>
        <p style={{ color: "var(--muted)" }}>
          IBM Bob scanned {risks.length} issues across the legacy codebase.
        </p>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 12 }}>
        <CountPill level="high" count={counts.high} />
        <CountPill level="medium" count={counts.medium} />
        <CountPill level="low" count={counts.low} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["all", "high", "medium", "low"] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              border: filter === lvl ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: filter === lvl ? "var(--accent-dim)" : "transparent",
              color: filter === lvl ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
              fontSize: 13,
              textTransform: "capitalize",
            }}
          >
            {lvl === "all" ? `All (${risks.length})` : `${lvl} (${counts[lvl]})`}
          </button>
        ))}
      </div>

      {/* Risk list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
