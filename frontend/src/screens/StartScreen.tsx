import { useState } from "react";

interface StartScreenProps {
  onStart: (repoUrl: string) => void;
}

const EXAMPLE_REPOS = [
  "https://github.com/codexmatrix/legacy-ecommerce-api",
  "https://github.com/example/legacy-express-app",
  "https://github.com/acme/old-node-monolith",
];

const WORKFLOW_PHASES = [
  { n: "01", label: "UNDERSTAND", desc: "Inspect repository structure, dependencies, and runtime" },
  { n: "02", label: "PROTECT",    desc: "Generate behavioral safety-net tests before any change" },
  { n: "03", label: "ASSESS",     desc: "Identify risk, blast radius, and modernization surface" },
  { n: "04", label: "PLAN",       desc: "Define incremental, ordered modernization steps" },
  { n: "05", label: "EXECUTE",    desc: "Apply one controlled change at a time" },
  { n: "06", label: "VERIFY",     desc: "Run the full safety net after every change" },
  { n: "07", label: "ROLLBACK",   desc: "Revert immediately when a regression is detected" },
  { n: "08", label: "RECOVER",    desc: "Restore known-good state; explain the failure" },
  { n: "09", label: "REPORT",     desc: "Produce a complete audit trail of changes and outcomes" },
];

const PROCESS_STEPS = [
  { label: "Protect behavior",   detail: "Safety net first" },
  { label: "Assess risk",        detail: "Blast radius mapped" },
  { label: "Change safely",      detail: "One step at a time" },
  { label: "Verify",             detail: "Tests after each change" },
  { label: "Recover if needed",  detail: "Auto rollback on regression" },
];

export default function StartScreen({ onStart }: StartScreenProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Repository URL is required.");
      return;
    }
    if (!trimmed.startsWith("https://github.com/") && !trimmed.startsWith("http://")) {
      setError("Enter a valid GitHub URL — https://github.com/owner/repo");
      return;
    }
    setError("");
    onStart(trimmed);
  }

  function useExample(repo: string) {
    setUrl(repo);
    setError("");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div
        style={{
          height: 48,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          gap: 10,
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--accent)", fontSize: 16, lineHeight: 1 }}>◈</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Legacy Code Whisperer</span>
        <span style={{ color: "var(--border)", margin: "0 6px" }}>/</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>New session</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--muted)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            IBM Bob Hackathon · Team Codexmatrix
          </span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              border: "1px solid #9e6a0344",
              borderRadius: 3,
              color: "var(--yellow)",
              fontWeight: 600,
            }}
          >
            demo
          </span>
        </div>
      </div>

      {/* ── Main two-column area ───────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 0,
          maxWidth: 1280,
          width: "100%",
          margin: "0 auto",
          padding: "48px 32px",
          alignItems: "start",
          boxSizing: "border-box",
        }}
        className="start-grid"
      >

        {/* ── LEFT: input + intro ───────────────────────────────── */}
        <div style={{ paddingRight: 56 }}>

          {/* Heading */}
          <div style={{ marginBottom: 32 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--text)",
                lineHeight: 1.25,
                marginBottom: 10,
                letterSpacing: "-0.02em",
              }}
            >
              Modernize legacy code{" "}
              <span style={{ color: "var(--accent)" }}>without breaking what works</span>
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7, maxWidth: 520 }}>
              Legacy Code Whisperer uses IBM Bob to inspect a legacy repository, generate a
              behavioral safety net, then apply incremental changes — rolling back automatically
              whenever a regression is detected.
            </p>
          </div>

          {/* ── Repository input ─────────────────────────────── */}
          <form onSubmit={handleSubmit}>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--muted)", fontSize: 13 }}>Repository to modernize</span>
              </div>
              <div style={{ padding: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 8,
                  }}
                >
                  GitHub repository URL
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={url}
                    autoFocus
                    onChange={(e) => { setUrl(e.target.value); setError(""); }}
                    placeholder="https://github.com/owner/legacy-repo"
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      background: "var(--bg)",
                      border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
                      borderRadius: 4,
                      color: "var(--text)",
                      fontSize: 14,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "9px 20px",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.01em",
                    }}
                  >
                    Analyze Repository →
                  </button>
                </div>
                {error && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginTop: 7 }}>{error}</div>
                )}

                {/* Examples */}
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>Try:</span>
                  {EXAMPLE_REPOS.map((repo) => {
                    const short = repo.replace("https://github.com/", "");
                    return (
                      <button
                        key={repo}
                        type="button"
                        onClick={() => useExample(repo)}
                        className="mono"
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: 3,
                          color: "var(--accent)",
                          fontSize: 11,
                          padding: "2px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </form>

          {/* Demo notice — inline, not a card */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: "var(--yellow)", fontSize: 11, fontWeight: 700, flexShrink: 0, paddingTop: 1 }}>
              DEMO
            </span>
            <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              No repository is cloned or analyzed. The dashboard loads mock data representing a
              realistic Node.js modernization session. Backend integration is not implemented in
              this milestone.
            </p>
          </div>

          {/* ── Process strip ─────────────────────────────────── */}
          <div style={{ marginTop: 48, borderTop: "1px solid var(--border)", paddingTop: 28 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
                marginBottom: 16,
              }}
            >
              How it works
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, flexWrap: "wrap" }}>
              {PROCESS_STEPS.map((s, i) => (
                <div key={s.label} style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.detail}</div>
                  </div>
                  {i < PROCESS_STEPS.length - 1 && (
                    <span style={{ color: "var(--border)", fontSize: 18, padding: "0 16px", marginTop: 1, flexShrink: 0 }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: workflow panel ─────────────────────────────── */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
            alignSelf: "start",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
              }}
            >
              Modernization workflow
            </span>
          </div>
          {WORKFLOW_PHASES.map((p, i) => (
            <div
              key={p.label}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "11px 16px",
                borderBottom: i < WORKFLOW_PHASES.length - 1 ? "1px solid var(--border)" : "none",
                background: i === 0 ? "var(--accent-dim)" : "transparent",
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: i === 0 ? "var(--accent)" : "var(--border)",
                  flexShrink: 0,
                  paddingTop: 2,
                  minWidth: 20,
                }}
              >
                {p.n}
              </span>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: i === 0 ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {p.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
                  {p.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
