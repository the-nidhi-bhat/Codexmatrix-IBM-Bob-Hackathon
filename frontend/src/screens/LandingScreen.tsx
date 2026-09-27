import { DiffTexture } from "../Texture";
import "../App.css";

interface LandingScreenProps {
  /** Opens the existing repository-input screen. */
  onAnalyze: () => void;
}

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#safety", label: "Safety" },
];

const CAPABILITIES = [
  {
    n: "01",
    title: "Understand the repository",
    detail: "Reads structure, stack, dependencies and runtime before anything is changed.",
  },
  {
    n: "02",
    title: "Identify modernization risks",
    detail: "Surfaces risky constructs with the evidence and blast radius behind each finding.",
  },
  {
    n: "03",
    title: "Create a modernization plan",
    detail: "Turns findings into small, ordered steps that can be reviewed one at a time.",
  },
  {
    n: "04",
    title: "Execute controlled changes",
    detail: "Applies a single approved transformation — never a blind rewrite of the codebase.",
  },
  {
    n: "05",
    title: "Verify the changes",
    detail: "Runs the safety net after every step to confirm expected behaviour is preserved.",
  },
  {
    n: "06",
    title: "Roll back and recover",
    detail: "Reverts to the last known-good commit and re-verifies when a regression appears.",
  },
];

const STAGES = [
  {
    n: "01",
    title: "Analyze",
    detail: "Understand the repository structure, technologies, dependencies and risks.",
  },
  {
    n: "02",
    title: "Modernize",
    detail: "Apply controlled modernization changes instead of blindly rewriting the codebase.",
  },
  {
    n: "03",
    title: "Verify",
    detail: "Check whether the changes preserve expected behavior using available verification mechanisms.",
  },
  {
    n: "04",
    title: "Recover",
    detail: "Return to a safe state when a regression is detected.",
  },
];

const SAFETY_POINTS = [
  {
    title: "Changes are controlled",
    detail: "Only approved, whitelisted transformations run — one step at a time, each one reviewable.",
  },
  {
    title: "Verification comes first",
    detail: "A change is only treated as successful after the safety net passes on the modified repository.",
  },
  {
    title: "Regressions trigger recovery",
    detail: "A failed checkpoint reverts the repository to its last known-good commit and re-runs verification.",
  },
  {
    title: "Nothing is modified blindly",
    detail: "The repository is read and analysed end to end before a single line is touched.",
  },
];

const FACTS = [
  "Read-only analysis",
  "Approved changes only",
  "Verification per step",
  "Automatic rollback",
];

export default function LandingScreen({ onAnalyze }: LandingScreenProps) {
  return (
    <div className="land">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="land-top">
        <div className="brand">
          <span className="brand-mark">L</span>
          <span className="brand-name">Legacy Code Whisperer</span>
        </div>

        <nav className="land-nav" aria-label="Page sections">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>

        <div className="land-top-right">
          <span className="eyebrow">IBM Bob 2.0 · Team Codexmatrix</span>
          <span className="demo-chip">demo</span>
          <button className="btn btn-solid" onClick={onAnalyze}>
            Analyze a repository
          </button>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="land-hero" id="top">
        <div className="land-wrap">
          <DiffTexture className="tex tex-diff" />

          <div className="land-hero-inner">
            <div className="start-eyebrow">Safety-first modernization</div>

            <h1 className="land-title">
              Modernize legacy code <em>without breaking what works.</em>
            </h1>

            <p className="land-lede">
              Legacy Code Whisperer analyzes an existing repository, identifies risks, plans
              controlled modernization changes, verifies the results, and provides recovery
              when something goes wrong.
            </p>

            <div className="land-cta">
              <button className="btn btn-solid btn-lg" onClick={onAnalyze}>
                Analyze a repository →
              </button>
              <a className="land-link" href="#how-it-works">See how it works →</a>
            </div>

            <div className="start-trust land-facts">
              {FACTS.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── What it does ───────────────────────────────────── */}
      <section className="land-band" id="product">
        <div className="land-section">
          <div className="land-head">
            <span className="land-index">01</span>
            <div>
              <h2 className="land-h2">What it does</h2>
              <p className="land-sub">
                Six capabilities that replace guesswork with an auditable, repeatable
                modernization workflow.
              </p>
            </div>
          </div>

          <div className="land-grid">
            {CAPABILITIES.map((c) => (
              <article key={c.n} className="card land-card">
                <div className="land-card-n">{c.n}</div>
                <h3 className="land-card-t">{c.title}</h3>
                <p className="land-card-d">{c.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="land-band" id="how-it-works">
        <div className="land-section">
          <div className="land-head">
            <span className="land-index">02</span>
            <div>
              <h2 className="land-h2">How it works</h2>
              <p className="land-sub">
                Four stages, always in this order — analyze first, recover last.
              </p>
            </div>
          </div>

          <div className="land-flow">
            {STAGES.map((s) => (
              <div key={s.n} className="land-stage">
                <div className="land-stage-n">{s.n}</div>
                <div className="land-stage-t">{s.title}</div>
                <p className="land-stage-d">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Safety ─────────────────────────────────────────── */}
      <section className="land-band" id="safety">
        <div className="land-section">
          <div className="land-head">
            <span className="land-index">03</span>
            <div>
              <h2 className="land-h2">Safety first, by construction</h2>
              <p className="land-sub">
                The product is built around one rule: protect existing behaviour before
                changing it.
              </p>
            </div>
          </div>

          <div className="land-safety">
            <div className="land-safety-lead">
              <p className="lede">
                Legacy modernization usually fails because changes are applied faster than
                they can be verified. Legacy Code Whisperer inverts that: every step is
                bounded, checked, and reversible.
              </p>
              <div className="note note-accent" style={{ marginTop: 22 }}>
                <div className="note-title" style={{ color: "var(--accent-ink)" }}>
                  The repository is never blindly modified.
                </div>
                <div className="note-body">
                  Analysis is read-only, execution is restricted to approved operations, and
                  verification decides whether a change is allowed to stand.
                </div>
              </div>
            </div>

            <ul className="land-checks">
              {SAFETY_POINTS.map((p) => (
                <li key={p.title} className="card land-check">
                  <span className="land-check-i" aria-hidden="true">✓</span>
                  <div>
                    <div className="land-check-t">{p.title}</div>
                    <p className="land-check-d">{p.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────── */}
      <section className="land-final">
        <div className="land-final-inner">
          <div>
            <h2 className="land-h2">See it on your own repository</h2>
            <p className="land-sub" style={{ marginTop: 10 }}>
              Paste a public GitHub URL and watch the workflow move through analysis,
              planning, execution, verification and recovery.
            </p>
          </div>
          <button className="btn btn-solid btn-lg" onClick={onAnalyze}>
            Analyze your repository →
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="land-foot">
        <div className="row" style={{ gap: 11, flexWrap: "wrap" }}>
          <span className="brand-mark">L</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>Legacy Code Whisperer</span>
          <span className="brand-rule" />
          <span>A safety-first workflow for modernizing legacy applications.</span>
        </div>
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          <span>Team Codexmatrix</span>
          <span>IBM Bob 2.0 Hackathon</span>
        </div>
      </footer>
    </div>
  );
}
