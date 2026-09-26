import { useState } from "react";

interface StartScreenProps {
  onStart: (repoUrl: string) => void;
}

const EXAMPLE_REPOS = [
  "https://github.com/codexmatrix/legacy-ecommerce-api",
  "https://github.com/example/legacy-express-app",
  "https://github.com/acme/old-node-monolith",
];

export default function StartScreen({ onStart }: StartScreenProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a repository URL.");
      return;
    }
    if (!trimmed.startsWith("https://github.com/") && !trimmed.startsWith("http://")) {
      setError("Enter a valid GitHub URL (https://github.com/owner/repo).");
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "32px 16px",
      }}
    >
      {/* Logo + title */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 40, color: "var(--accent)", marginBottom: 12 }}>◈</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
          Legacy Code Whisperer
        </h1>
        <p style={{ color: "var(--muted)", maxWidth: 480, lineHeight: 1.7, margin: "0 auto" }}>
          AI-assisted legacy modernization — every change is{" "}
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>verified</span> before it lands.
          Existing behavior is protected by a behavioral safety net before anything is touched.
        </p>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 14,
            padding: "4px 12px",
            background: "var(--accent-dim)",
            border: "1px solid #1f6feb44",
            borderRadius: 20,
            fontSize: 11,
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          IBM Bob Hackathon · Team Codexmatrix
        </div>
      </div>

      {/* Workflow strip */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 36,
          maxWidth: 720,
          width: "100%",
          overflow: "hidden",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        {["Understand", "Protect", "Assess", "Plan", "Execute", "Verify", "Rollback", "Recover", "Report"].map(
          (phase, i, arr) => (
            <div
              key={phase}
              style={{
                flex: 1,
                padding: "6px 4px",
                textAlign: "center",
                fontSize: 10,
                fontWeight: 600,
                background: i === 0 ? "var(--accent-dim)" : "var(--surface)",
                color: i === 0 ? "var(--accent)" : "var(--muted)",
                borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
              }}
            >
              {phase}
            </div>
          )
        )}
      </div>

      {/* Input card */}
      <div
        className="card"
        style={{ width: "100%", maxWidth: 520 }}
      >
        <div className="section-title">Analyze a Legacy Repository</div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label
              style={{ display: "block", color: "var(--muted)", fontSize: 12, marginBottom: 6 }}
            >
              GitHub Repository URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              placeholder="https://github.com/owner/legacy-repo"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--surface-2)",
                border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                color: "var(--text)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {error && (
              <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>{error}</div>
            )}
          </div>

          {/* Examples */}
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>
              Examples — click to use:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {EXAMPLE_REPOS.map((repo) => (
                <button
                  key={repo}
                  type="button"
                  onClick={() => useExample(repo)}
                  className="mono"
                  style={{
                    textAlign: "left",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    color: "var(--accent)",
                    fontSize: 12,
                    padding: "5px 10px",
                    cursor: "pointer",
                  }}
                >
                  {repo}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            style={{
              padding: "11px 0",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            Analyze Repository →
          </button>
        </form>

        {/* Demo notice */}
        <div
          style={{
            marginTop: 16,
            padding: "10px 12px",
            background: "#9e6a0315",
            border: "1px solid #9e6a0333",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: "var(--yellow)", fontWeight: 600 }}>Demo mode: </span>
          No repository is cloned or analyzed. The dashboard shows mock data representing a
          realistic modernization session. Backend integration is not implemented in this milestone.
        </div>
      </div>

      {/* How it works */}
      <div style={{ marginTop: 40, maxWidth: 520, width: "100%" }}>
        <div className="section-title" style={{ textAlign: "center", marginBottom: 16 }}>
          How it works
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { icon: "1", text: "IBM Bob inspects the repository and generates a behavioral safety net (test suite) that captures existing behavior before any change." },
            { icon: "2", text: "Bob assesses modernization risk across the codebase — identifying deprecated patterns, unsafe APIs, and blast radius for each change." },
            { icon: "3", text: "Changes are applied one at a time. After each change, the full safety net runs. If a regression is detected, Bob rolls back and explains why." },
          ].map(({ icon, text }) => (
            <div
              key={icon}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "var(--accent-dim)",
                  border: "1px solid #1f6feb44",
                  color: "var(--accent)",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {icon}
              </div>
              <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
