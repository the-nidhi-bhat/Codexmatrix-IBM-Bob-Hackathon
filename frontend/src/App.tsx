import { useState } from "react";
import StartScreen from "./screens/StartScreen";
import OverviewScreen from "./screens/OverviewScreen";
import RiskScreen from "./screens/RiskScreen";
import PlanScreen from "./screens/PlanScreen";
import ExecutionScreen from "./screens/ExecutionScreen";
import VerificationScreen from "./screens/VerificationScreen";
import RollbackScreen from "./screens/RollbackScreen";
import ReportScreen from "./screens/ReportScreen";
import "./App.css";

type Screen = "overview" | "risk" | "plan" | "execution" | "verification" | "rollback" | "report";

interface NavItem {
  id: Screen;
  label: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
}

const NAV: NavItem[] = [
  { id: "overview",      label: "Overview",      icon: "◈" },
  { id: "risk",          label: "Risk",           icon: "⚠", badge: "2 high", badgeColor: "var(--red)" },
  { id: "plan",          label: "Plan",           icon: "☰", badge: "3→",     badgeColor: "var(--yellow)" },
  { id: "execution",     label: "Execution",      icon: "▶", badge: "live",   badgeColor: "var(--green)" },
  { id: "verification",  label: "Verification",   icon: "✔" },
  { id: "rollback",      label: "Rollback",       icon: "↺" },
  { id: "report",        label: "Report",         icon: "📋" },
];

const PHASE_LABELS: Record<Screen, string> = {
  overview:     "Understand · Protect",
  risk:         "Assess",
  plan:         "Plan",
  execution:    "Execute",
  verification: "Verify",
  rollback:     "Rollback · Recover",
  report:       "Report",
};

export default function App() {
  const [active, setActive] = useState<Screen>("overview");
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  function navigate(screen: Screen) {
    setActive(screen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStart(url: string) {
    setRepoUrl(url);
    setActive("overview");
  }

  // Entry gate: show start screen until a repo is provided
  if (!repoUrl) {
    return <StartScreen onStart={handleStart} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 56,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, color: "var(--accent)" }}>◈</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Legacy Code Whisperer</span>
          <span
            style={{
              padding: "2px 8px",
              background: "var(--accent-dim)",
              border: "1px solid #1f6feb44",
              borderRadius: 4,
              fontSize: 11,
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            IBM Bob Hackathon
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Workflow phase label */}
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            Phase:{" "}
            <span style={{ color: "var(--text)", fontWeight: 600 }}>
              {PHASE_LABELS[active]}
            </span>
          </span>
          {/* Safety net badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "#23863622",
              border: "1px solid #23863644",
              borderRadius: 20,
            }}
          >
            <span style={{ color: "var(--green)", fontSize: 10 }}>●</span>
            <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }}>
              27/27 tests passing
            </span>
          </div>
          {/* Change repo */}
          <button
            onClick={() => setRepoUrl(null)}
            style={{
              padding: "4px 10px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← Change repo
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <aside
          style={{
            width: 200,
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
            padding: "16px 0",
            position: "sticky",
            top: 56,
            height: "calc(100vh - 56px)",
            overflowY: "auto",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Workflow label */}
          <div
            style={{
              padding: "0 14px 10px",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--muted)",
            }}
          >
            Workflow
          </div>
          {/* Nav items */}
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 14px",
                background: active === item.id ? "var(--accent-dim)" : "transparent",
                border: "none",
                borderLeft: `2px solid ${active === item.id ? "var(--accent)" : "transparent"}`,
                color: active === item.id ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 10,
                    background: item.badgeColor ? `${item.badgeColor}22` : "var(--surface-2)",
                    color: item.badgeColor ?? "var(--muted)",
                    border: `1px solid ${item.badgeColor ? `${item.badgeColor}44` : "var(--border)"}`,
                    fontWeight: 600,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}

          {/* Repo info at bottom */}
          <div
            style={{
              padding: "14px 14px 0",
              borderTop: "1px solid var(--border)",
              marginTop: "auto",
            }}
          >
            <div style={{ color: "var(--muted)", fontSize: 10, lineHeight: 1.9, wordBreak: "break-all" }}>
              <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 2 }}>
                legacy-ecommerce-api
              </div>
              <div>Node.js 12 → 18 LTS</div>
              <div style={{ color: "var(--green)" }}>45% complete</div>
              <div style={{ color: "var(--muted)", marginTop: 4, fontSize: 9, opacity: 0.7 }}>
                {repoUrl}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "28px 32px", maxWidth: 880, minWidth: 0 }}>
          {active === "overview"     && <OverviewScreen repoUrl={repoUrl} />}
          {active === "risk"         && <RiskScreen />}
          {active === "plan"         && <PlanScreen />}
          {active === "execution"    && (
            <ExecutionScreen
              onVerify={() => navigate("verification")}
              onRollback={() => navigate("rollback")}
            />
          )}
          {active === "verification" && <VerificationScreen onRollback={() => navigate("rollback")} />}
          {active === "rollback"     && <RollbackScreen />}
          {active === "report"       && <ReportScreen />}
        </main>
      </div>
    </div>
  );
}
