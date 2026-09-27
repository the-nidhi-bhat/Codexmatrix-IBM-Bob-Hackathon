import { useEffect, useId, useRef, useState } from "react";
import { useWorkflow } from "../workflow/WorkflowContext";

export default function ArchitectureScreen() {
  const { state } = useWorkflow();
  const rawId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { architecture, repository } = state;
  const diagram = architecture.diagram;

  useEffect(() => {
    let cancelled = false;
    if (!architecture.available || !diagram) {
      if (hostRef.current) hostRef.current.replaceChildren();
      return () => { cancelled = true; };
    }

    const id = `repository-architecture-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
    void import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#ffffff",
            primaryColor: "#f4f2ec",
            primaryTextColor: "#1b1a17",
            primaryBorderColor: "#cfc9bd",
            secondaryColor: "#e4f0ee",
            tertiaryColor: "#faf9f6",
            lineColor: "#8b857a",
            textColor: "#1b1a17",
            fontSize: "13px",
            fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
          },
        });
        return mermaid.render(id, diagram);
      })
      .then(({ svg }) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        const element = hostRef.current.querySelector("svg");
        if (element) {
          element.style.maxWidth = "100%";
          element.style.height = "auto";
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : String(renderError));
      });

    return () => { cancelled = true; };
  }, [architecture.available, diagram, rawId]);

  return (
    <div className="stack stack-20">
      <div className="page-head">
        <div>
          <h1 className="page-title">Architecture</h1>
          <p className="page-sub">
            {repository.owner}/{repository.name} — {architecture.summary}
          </p>
        </div>
        <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
          <span className="tag tag-low">{repository.language}</span>
          <span className="tag tag-low">{repository.framework}</span>
          <span className="tag tag-accent">{repository.runtime}</span>
          <span className="tag">{repository.files} files · {repository.linesOfCode.toLocaleString()} LOC</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Repository component map</div>
        {!architecture.available ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Architecture unavailable — the source structure was not sufficient to derive a component map.
          </p>
        ) : error ? (
          <p className="mono" style={{ color: "var(--red)", fontSize: 12 }}>Diagram could not be rendered: {error}</p>
        ) : (
          <div ref={hostRef} data-testid="architecture-diagram" style={{ overflowX: "auto" }} />
        )}
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
          Components come from detected source directories. Connections represent repository
          containment, not inferred runtime dependencies.
        </p>
      </div>

      <div className="card">
        <div className="section-title">Detected project structure</div>
        {repository.projectStructure.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Project structure not detected.</p>
        ) : repository.projectStructure.map((entry) => (
          <div key={entry.path} className="list-row" style={{ alignItems: "baseline" }}>
            <span className="mono grow" style={{ color: "var(--accent)" }}>{entry.path}</span>
            <span style={{ color: "var(--muted)", fontSize: 12.5, textAlign: "right" }}>
              {entry.kind === "directory" ? `${entry.files} source files` : "manifest or documentation"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
