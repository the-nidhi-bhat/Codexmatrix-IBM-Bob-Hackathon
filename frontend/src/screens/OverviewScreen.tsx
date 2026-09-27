import { useWorkflow } from "../workflow/WorkflowContext";
import type { VerificationRun } from "../workflow/types";

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 4, height: 8, overflow: "hidden" }}>
      <div
        style={{
          width: `${value}%`,
          height: "100%",
          background: "linear-gradient(90deg, var(--accent) 0%, var(--purple) 100%)",
          borderRadius: 4,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

function SafetyNetBadge({ result, note }: { result?: VerificationRun; note?: string }) {
  // No checkpoint result means no safety net has run for this repository. Counts
  // may only ever come from a real VerificationRun, never from the analyzer.
  if (!result || result.tests.length === 0) {
    return (
      <div className="card" style={{ color: "var(--muted)" }}>
        <div style={{ fontWeight: 700 }}>Safety Net: not run</div>
        {note && <div style={{ fontSize: 12, marginTop: 4 }}>{note}</div>}
      </div>
    );
  }
  const passing = result.tests.filter((test) => test.status === "passed").length;
  const failing = result.tests.filter((test) => test.status === "failed").length;
  const total = result.tests.length;
  const allPass = total > 0 && passing === total;
  const resultColor = allPass ? "var(--green)" : failing > 0 ? "var(--red)" : "var(--muted)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        background: allPass ? "#23863622" : failing > 0 ? "var(--red-dim)" : "var(--surface-2)",
        border: `1px solid ${allPass ? "#23863655" : failing > 0 ? "#da363355" : "var(--border)"}`,
        borderRadius: "var(--radius)",
      }}
    >
      <span style={{ fontSize: 24, color: resultColor }}>{allPass ? "✓" : failing > 0 ? "✗" : "—"}</span>
      <div>
        <div style={{ fontWeight: 700, color: resultColor, fontSize: 16 }}>
          {allPass ? "Safety Net passed" : failing > 0 ? "Safety Net failed" : "Safety Net result inconclusive"}: {passing}/{total} tests passing
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
          {result.suite} · {result.duration}
        </div>
      </div>
    </div>
  );
}

type StepMiniProps = { id: number; title: string; status: string; testsDelta?: string };

function StepMini({ id, title, status, testsDelta }: StepMiniProps) {
  const icons: Record<string, { symbol: string; color: string }> = {
    passed: { symbol: "✓", color: "var(--green)" },
    recovered: { symbol: "✓", color: "var(--green)" },
    running: { symbol: "⟳", color: "var(--yellow)" },
    failed: { symbol: "✗", color: "var(--red)" },
    rolled_back: { symbol: "✗", color: "var(--red)" },
    pending: { symbol: "○", color: "var(--muted)" },
  };
  const icon = icons[status] ?? { symbol: "○", color: "var(--muted)" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
        opacity: status === "pending" ? 0.55 : 1,
      }}
    >
      <span style={{ color: icon.color, fontSize: 14, width: 16, textAlign: "center", flexShrink: 0 }}>
        {icon.symbol}
      </span>
      <span style={{ flex: 1, color: status === "running" ? "var(--yellow)" : "var(--text)" }}>
        Step {id} — {title}
      </span>
      {testsDelta && (
        <span className="mono" style={{ color: status === "passed" ? "var(--green)" : "var(--muted)" }}>
          {testsDelta}
        </span>
      )}
    </div>
  );
}

export default function OverviewScreen({ repoUrl }: { repoUrl?: string | null }) {
  const { state } = useWorkflow();
  const { repository, overallProgress, plan } = state;

  const completed = plan.filter((s) => s.status === "passed").length;
  const executing = plan.find((s) => s.status === "running");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Project Overview</h2>
        <p style={{ color: "var(--muted)" }}>
          Live status of the Legacy Code Whisperer modernization session
        </p>
      </div>

      {/* Safety net — hero */}
      <SafetyNetBadge
      result={state.checkpointResult}
      note={state.checkpointResult ? undefined : state.safetyNet.generatedBy}
    />

      {/* Repo + Progress row */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(260px, 1fr)", gap: 16 }}>
        {/* Repo card */}
        <div className="card">
          <div className="section-title">Legacy Repository</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{repository.name}</div>
          {(repoUrl ?? repository.url) && (
            <div className="mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 10, wordBreak: "break-all" }}>
              {repoUrl ?? repository.url}
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {[
              ["Runtime",       repository.runtime],
              ["Framework",     repository.framework],
              ["Language",      repository.language],
              ["Last Commit",   repository.lastCommit],
              ["Files",         repository.files.toString()],
              ["Lines of Code", repository.linesOfCode.toLocaleString()],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 0", color: "var(--muted)", width: "40%" }}>{label}</td>
                <td style={{ padding: "6px 0", fontWeight: 500 }}>{value}</td>
              </tr>
            ))}
          </table>
        </div>

        {/* Progress card */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="section-title">Modernization Progress</div>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 52, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
              {overallProgress}%
            </div>
            <div style={{ color: "var(--muted)", marginTop: 8 }}>
              {completed} of {plan.length} steps complete
            </div>
          </div>
          <ProgressBar value={overallProgress} />
          {executing && (
            <div
              style={{
                padding: "10px 14px",
                background: "#9e6a0322",
                border: "1px solid #9e6a0355",
                borderRadius: "var(--radius)",
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--yellow)", fontWeight: 600 }}>Now executing: </span>
              {executing.title}
            </div>
          )}
        </div>
      </div>

      {/* Plan mini */}
      <div className="card">
        <div className="section-title">Modernization Steps</div>
        {plan.map((s) => (
          <StepMini key={s.id} id={s.id} title={s.title} status={s.status} testsDelta={s.testsDelta} />
        ))}
      </div>
    </div>
  );
}
