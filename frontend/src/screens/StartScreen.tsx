import { useState, useEffect } from "react";

interface StartScreenProps {
  onStart: (repoUrl: string) => void;
  /** When true, the form is locked and a loading indicator is shown. */
  loading?: boolean;
  /** Pre-fill the URL input (e.g. when re-showing after an error). */
  defaultUrl?: string;
  /** The URL currently being analyzed (shown in the loading state). */
  repoUrl?: string;
  /** Backend error message to display (clears when user edits the input). */
  errorMessage?: string;
  /** Backend error code for display. */
  errorCode?: string;
}

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

// Simple CSS-in-JS dot animation — no keyframe injection needed
const DOT_FRAMES = ["Analyzing .", "Analyzing ..", "Analyzing ..."];

export default function StartScreen({
  onStart,
  loading = false,
  defaultUrl,
  repoUrl: analyzingUrl,
  errorMessage,
  errorCode,
}: StartScreenProps) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [localError, setLocalError] = useState("");
  const [dotFrame, setDotFrame] = useState(0);

  // Keep url in sync if a defaultUrl arrives (e.g. after error reset)
  useEffect(() => {
    if (defaultUrl !== undefined) setUrl(defaultUrl);
  }, [defaultUrl]);

  // Animate the loading dots
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setDotFrame((f) => (f + 1) % DOT_FRAMES.length), 500);
    return () => clearInterval(id);
  }, [loading]);

  const displayError = localError || errorMessage || "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = url.trim();
    if (!trimmed) {
      setLocalError("Repository URL is required.");
      return;
    }
    if (!trimmed.startsWith("https://github.com/") && !trimmed.startsWith("http://")) {
      setLocalError("Enter a valid GitHub URL — https://github.com/owner/repo");
      return;
    }
    setLocalError("");
    onStart(trimmed);
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
                border: `1px solid ${loading ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6,
                overflow: "hidden",
                marginBottom: 16,
                transition: "border-color 0.2s",
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
                {loading && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--accent)",
                      fontFamily: "monospace",
                    }}
                  >
                    {DOT_FRAMES[dotFrame]}
                  </span>
                )}
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
                    value={loading ? (analyzingUrl ?? url) : url}
                    autoFocus={!loading}
                    disabled={loading}
                    onChange={(e) => { setUrl(e.target.value); setLocalError(""); }}
                    placeholder="https://github.com/owner/legacy-repo"
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      background: loading ? "var(--surface-2)" : "var(--bg)",
                      border: `1px solid ${displayError ? "var(--red)" : "var(--border)"}`,
                      borderRadius: 4,
                      color: loading ? "var(--muted)" : "var(--text)",
                      fontSize: 14,
                      outline: "none",
                      fontFamily: "inherit",
                      cursor: loading ? "not-allowed" : "text",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: "9px 20px",
                      background: loading ? "var(--surface-2)" : "var(--accent)",
                      color: loading ? "var(--muted)" : "#fff",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.01em",
                      transition: "background 0.2s",
                    }}
                  >
                    {loading ? "Analyzing…" : "Analyze Repository →"}
                  </button>
                </div>

                {/* Error message — either local validation or backend error */}
                {displayError && (
                  <div
                    style={{
                      color: "var(--red)",
                      fontSize: 12,
                      marginTop: 7,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>✖</span>
                    <span>
                      {displayError}
                      {errorCode && !localError && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontFamily: "monospace",
                            fontSize: 11,
                            opacity: 0.7,
                          }}
                        >
                          [{errorCode}]
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Loading detail */}
                {loading && !displayError && (
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 7, lineHeight: 1.6 }}>
                    Cloning repository and running analysis — this may take up to 60 seconds for large repos.
                  </div>
                )}

              </div>
            </div>
          </form>

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
