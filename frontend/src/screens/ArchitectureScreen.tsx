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
          theme: "dark",
          themeVariables: {
            background: "#161b22",
            primaryColor: "#21262d",
            primaryTextColor: "#e6edf3",
            primaryBorderColor: "#58a6ff",
            lineColor: "#8b949e",
            fontSize: "13px",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Architecture</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>
          {repository.owner}/{repository.name} · {architecture.summary}
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="tag tag-low">{repository.language}</span>
          <span className="tag tag-low">{repository.framework}</span>
          <span className="tag tag-medium">{repository.runtime}</span>
          <span className="tag tag-low">{repository.files} source files · {repository.linesOfCode.toLocaleString()} LOC</span>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">Repository component map</div>
        {!architecture.available ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Architecture unavailable: source structure was not sufficient to derive a component map.</div>
        ) : error ? (
          <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>Diagram could not be rendered: {error}</div>
        ) : (
          <div ref={hostRef} data-testid="architecture-diagram" />
        )}
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 12 }}>
          Components come from detected source directories. Diagram connections represent repository containment, not inferred runtime dependencies.
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">Detected project structure</div>
        {repository.projectStructure.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Project structure not detected.</div>
        ) : repository.projectStructure.map((entry) => (
          <div key={entry.path} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span className="mono" style={{ color: "var(--accent)", minWidth: 200 }}>{entry.path}</span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {entry.kind === "directory" ? `${entry.files} source files` : "project manifest or documentation"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}