import { useWorkflow } from "../workflow/WorkflowContext";
import type { VerificationRun } from "../workflow/types";

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

function SafetyNetBadge({ result }: { result?: VerificationRun }) {
  if (!result || result.status === "not_run") {
    return (
      <div className="note">
        <div className="note-title" style={{ color: "var(--muted)" }}>Safety net · not run</div>
        <div className="note-body">No verification has been requested for this session yet.</div>
      </div>
    );
  }
  if (result.status === "not_available") {
    return (
      <div className="note">
        <div className="note-title" style={{ color: "var(--muted)" }}>Safety net · not available</div>
        <div className="note-body">{result.summary}</div>
      </div>
    );
  }
  if (result.status === "running") {
    return (
      <div className="note note-warn">
        <div className="note-title" style={{ color: "var(--yellow)" }}>Safety net · running</div>
        <div className="note-body">Verification is executing in an isolated container.</div>
      </div>
    );
  }

  const passing = result.passed;
  const failing = result.failed;
  const total = result.total;
  const allPass = result.status === "passed" && total > 0 && passing === total;
  const tone = allPass ? "note-ok" : failing > 0 ? "note-danger" : "";
  const color = allPass ? "var(--green)" : failing > 0 ? "var(--red)" : "var(--muted)";

  return (
    <div className={`note ${tone}`}>
      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <span style={{ fontSize: 22, lineHeight: 1.1, color }}>{allPass ? "✓" : failing > 0 ? "✕" : "—"}</span>
        <div className="grow">
          <div className="note-title" style={{ color }}>
            {allPass ? `Safety net passing — ${passing} of ${total}`
              : failing > 0 ? `Safety net failing — ${failing} test${failing === 1 ? "" : "s"}`
              : "Safety net result inconclusive"}
          </div>
          <div className="note-body">{result.summary} · {result.suite} · {result.duration}</div>
        </div>
      </div>
    </div>
  );
}

type StepMiniProps = { id: number; title: string; status: string; testsDelta?: string };

function StepMini({ id, title, status, testsDelta }: StepMiniProps) {
  const icons: Record<string, { symbol: string; color: string }> = {
    passed:     { symbol: "✓", color: "var(--green)" },
    recovered:  { symbol: "✓", color: "var(--green)" },
    running:    { symbol: "•", color: "var(--yellow)" },
    failed:     { symbol: "✕", color: "var(--red)" },
    rolled_back:{ symbol: "↺", color: "var(--yellow)" },
    pending:    { symbol: "○", color: "var(--muted)" },
  };
  const icon = icons[status] ?? { symbol: "○", color: "var(--muted)" };

  return (
    <div className="list-row" style={{ opacity: status === "pending" ? 0.6 : 1 }}>
      <span style={{ color: icon.color, width: 16, textAlign: "center", flexShrink: 0, fontWeight: 700 }}>
        {icon.symbol}
      </span>
      <span className="grow" style={{ color: status === "running" ? "var(--yellow)" : "var(--text)" }}>
        <span className="tnum" style={{ color: "var(--muted)", marginRight: 10, fontFamily: "var(--mono)", fontSize: 11 }}>
          {String(id).padStart(2, "0")}
        </span>
        {title}
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
    <div className="stack stack-28">
      <div className="page-head">
        <div>
          <h1 className="page-title">Project overview</h1>
          <p className="page-sub">Live status of this Legacy Code Whisperer modernization session.</p>
        </div>
        <span className="status status-muted">{repository.language}</span>
      </div>

      <SafetyNetBadge result={state.checkpointResult} />

      <div className="cols-2">
        {/* Repository */}
        <div className="card">
          <div className="section-title">Legacy repository</div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>{repository.name}</div>
          {(repoUrl ?? repository.url) && (
            <div className="mono" style={{ color: "var(--accent)", marginTop: 5, overflowWrap: "anywhere" }}>
              {repoUrl ?? repository.url}
            </div>
          )}
          <table className="meta-table" style={{ marginTop: 16 }}>
            <tbody>
              {[
                ["Runtime",       repository.runtime],
                ["Framework",     repository.framework],
                ["Language",      repository.language],
                ["Last commit",   repository.lastCommit],
                ["Files",         repository.files.toString()],
                ["Lines of code", repository.linesOfCode.toLocaleString()],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td style={{ fontWeight: 500 }} className="tnum">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Progress */}
        <div className="card stack stack-16">
          <div className="section-title" style={{ marginBottom: 0 }}>Modernization progress</div>
          <div style={{ textAlign: "center", padding: "18px 0 6px" }}>
            <div className="stat-value" style={{ fontSize: 56, letterSpacing: "-0.04em" }}>{overallProgress}%</div>
            <div style={{ color: "var(--muted)", marginTop: 8, fontSize: 13 }}>
              {completed} of {plan.length} steps complete
            </div>
          </div>
          <ProgressBar value={overallProgress} />
          {executing && (
            <div className="note note-warn" style={{ padding: "12px 15px" }}>
              <div className="note-body" style={{ marginTop: 0 }}>
                <strong style={{ color: "var(--yellow)" }}>Now executing — </strong>
                {executing.title}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="card">
        <div className="section-title">Modernization steps</div>
        {plan.map((s) => (
          <StepMini key={s.id} id={s.id} title={s.title} status={s.status} testsDelta={s.testsDelta} />
        ))}
      </div>
    </div>
  );
}
