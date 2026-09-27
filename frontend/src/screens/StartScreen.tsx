import { useState } from "react";
import { DiffTexture } from "../Texture";
import "../App.css";

interface StartScreenProps {
  onStart: (repoUrl: string) => void;
  /** Optional way back to the public landing page. */
  onBack?: () => void;
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
  { n: "01", label: "Understand", desc: "Inspect repository structure, dependencies, and runtime" },
  { n: "02", label: "Protect",    desc: "Generate behavioural safety-net tests before any change" },
  { n: "03", label: "Assess",     desc: "Identify risk, blast radius, and modernization surface" },
  { n: "04", label: "Plan",       desc: "Define incremental, ordered modernization steps" },
  { n: "05", label: "Execute",    desc: "Apply one controlled change at a time" },
  { n: "06", label: "Verify",     desc: "Run the full safety net after every change" },
  { n: "07", label: "Rollback",   desc: "Revert immediately when a regression is detected" },
  { n: "08", label: "Recover",    desc: "Restore known-good state; explain the failure" },
  { n: "09", label: "Report",     desc: "Produce a complete audit trail of changes and outcomes" },
];

const PROCESS_STEPS = [
  { n: "01", label: "Protect behaviour", detail: "A safety net is captured before a single line is touched." },
  { n: "02", label: "Assess the risk",   detail: "Every finding carries evidence and a blast radius." },
  { n: "03", label: "Change in steps",   detail: "One approved, reviewable transformation at a time." },
  { n: "04", label: "Verify each step",  detail: "Tests run in an isolated container after every change." },
  { n: "05", label: "Recover on failure", detail: "A regression reverts itself and explains why." },
];

export default function StartScreen({
  onStart,
  onBack,
  loading = false,
  defaultUrl,
  repoUrl: analyzingUrl,
  errorMessage,
  errorCode,
}: StartScreenProps) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [localError, setLocalError] = useState("");
  const [trackedDefault, setTrackedDefault] = useState(defaultUrl);

  // Re-sync the field when a new defaultUrl arrives (e.g. after an error reset).
  if (defaultUrl !== undefined && defaultUrl !== trackedDefault) {
    setTrackedDefault(defaultUrl);
    setUrl(defaultUrl);
    setLocalError("");
  }

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
    <div className="start">
      <div className="start-top">
        <span className="brand-mark">L</span>
        <span className="brand-name">Legacy Code Whisperer</span>
        <span className="brand-rule" />
        <span className="crumb">New session</span>
        {onBack && (
          <button type="button" className="btn btn-quiet start-back" onClick={onBack}>
            ← Back
          </button>
        )}
        <div className="start-top-right">
          <span className="eyebrow">IBM Bob 2.0 · Team Codexmatrix</span>
          <span className="demo-chip">demo</span>
        </div>
      </div>

      <div className="start-body">
        <DiffTexture className="tex tex-diff" />

        <div className="start-grid">
          {/* ── LEFT ─────────────────────────────────────────── */}
          <div>
            <div className="start-eyebrow">Safety-first modernization</div>

            <h1 className="start-hero">
              Modernize legacy code <em>without breaking what works.</em>
            </h1>

            <p className="start-lede">
              Point it at a repository. It reads the code, builds a behavioural safety net,
              plans small changes, verifies each one in isolation — and reverts itself the
              moment a regression appears.
            </p>

            <form className="start-form" onSubmit={handleSubmit}>
              <div className="start-form-head">
                <label className="field-label" htmlFor="repo-url" style={{ margin: 0 }}>
                  Repository to modernize
                </label>
                {loading && <span className="running">cloning &amp; analysing</span>}
              </div>

              <div className="start-form-fields">
                <input
                  id="repo-url"
                  className="input"
                  type="text"
                  value={loading ? (analyzingUrl ?? url) : url}
                  autoFocus={!loading}
                  disabled={loading}
                  aria-invalid={Boolean(displayError)}
                  onChange={(e) => { setUrl(e.target.value); setLocalError(""); }}
                  placeholder="https://github.com/owner/legacy-repo"
                />
                <button type="submit" className="btn btn-solid btn-lg" disabled={loading}>
                  {loading ? "Analyzing…" : "Analyze repository"}
                </button>
              </div>

              {displayError && (
                <div className="field-error" role="alert">
                  <span aria-hidden="true">✕</span>
                  <span>
                    {displayError}
                    {errorCode && !localError && (
                      <span className="mono" style={{ marginLeft: 7, opacity: 0.75 }}>[{errorCode}]</span>
                    )}
                  </span>
                </div>
              )}

              {loading && !displayError && (
                <p className="start-hint">
                  Cloning the repository and running analysis — this can take up to 60 seconds
                  for a large codebase.
                </p>
              )}

              <div className="start-trust">
                <span>Shallow, read-only clone</span>
                <span>Isolated container verification</span>
                <span>Automatic rollback on regression</span>
              </div>
            </form>
          </div>

          {/* ── RIGHT ────────────────────────────────────────── */}
          <aside className="start-side">
            <div className="start-side-head">Modernization workflow</div>
            {WORKFLOW_PHASES.map((p, i) => (
              <div key={p.label} className={`phase-item${i === 0 ? " is-first" : ""}`}>
                <span className="phase-n">{p.n}</span>
                <div>
                  <div className="phase-name">{p.label}</div>
                  <div className="phase-desc">{p.desc}</div>
                </div>
              </div>
            ))}
          </aside>
        </div>

        {/* ── PROCESS STRIP ──────────────────────────────────── */}
        <section className="start-process">
          <div className="start-process-label">How it works</div>
          <div className="process-grid">
            {PROCESS_STEPS.map((s) => (
              <div key={s.n} className="process-step">
                <div className="process-n">{s.n}</div>
                <div className="process-title">{s.label}</div>
                <div className="process-detail">{s.detail}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="start-foot">
        <span>Legacy Code Whisperer — a safety-first workflow for modernizing legacy applications.</span>
        <span>IBM Bob 2.0 Hackathon</span>
      </footer>
    </div>
  );
}
