import type { CSSProperties } from "react";
import { useWorkflow } from "../workflow/WorkflowContext";
import type { ModernizationController } from "../workflow/useModernization";

/**
 * Verification — the real 18-test legacy suite, run by tools/checkpoint.js.
 *
 * This screen deliberately does NOT render a list of individual tests. The
 * engine reports COUNTS (passed/failed/skipped/total) and its raw harness output;
 * it does not emit a per-test record array, and it does not measure code
 * coverage. The old version of this screen required both — it derived a PASS/FAIL
 * from `v.tests.length` and printed `v.coverage` — so displaying a real engine
 * result through it would have required inventing 18 test entries and a coverage
 * percentage. Instead:
 *
 *   - the verdict is the engine's own `status`, verbatim;
 *   - the counts are the engine's own counts, verbatim;
 *   - the harness output is shown raw, in full, as the evidence it is.
 *
 * A blank list of invented green ticks would have looked more impressive and
 * proved nothing.
 */
export default function VerificationScreen({
  controller,
  onRollback,
}: {
  controller: ModernizationController;
  onRollback?: () => void;
}) {
  const { state } = useWorkflow();
  const { view, verify } = controller;
  const engine = view?.checkpoint ?? null;
  const status = view?.checkpointStatus ?? null;
  const validation = engine?.validationResult ?? null;
  const recovery = engine?.recoveryValidation ?? null;

  const passing = status === "VERIFIED" || status === "RECOVERY_VERIFIED";
  const resultColor = passing ? "var(--green)" : status ? "var(--red)" : "var(--muted)";
  const subject = state.execution.modernizationCommit;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Verification</h2>
          <p style={{ color: "var(--muted)" }}>
            {status ? `Safety Net: ${status}` : "Safety Net: not run"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={controller.runVerify}
            disabled={!controller.canVerify}
            style={{ ...btnStyle(passing ? "var(--green)" : "var(--accent)"), opacity: controller.canVerify ? 1 : 0.45 }}
          >
            {verify.phase === "busy"
              ? "Running the 18-test suite…"
              : status
                ? "Re-run checkpoint"
                : "Run checkpoint"}
          </button>
          {view?.checkpoint?.rollbackResult && onRollback && (
            <button onClick={onRollback} style={btnStyle("var(--yellow)")}>
              View Rollback →
            </button>
          )}
        </div>
      </div>

      {verify.phase === "busy" && (
        <div
          className="card"
          style={{ border: "1px solid #9e6a0355", background: "#9e6a0311", color: "var(--yellow)" }}
        >
          The checkpoint engine is running in a temporary worktree. It resolves a dependency tree and
          runs the legacy suite in Docker, so this takes a minute or two. The page will update when it
          finishes.
        </div>
      )}

      {verify.phase === "error" && verify.message && (
        <div className="card" style={{ border: "1px solid #da363366", color: "var(--red)" }}>
          {verify.message} <span className="mono">({verify.code})</span>
        </div>
      )}

      {view?.refusal && (
        <div className="card" style={{ border: "1px solid #da363366", color: "var(--red)" }}>
          <strong>Refused: {view.refusal.code}</strong>
          <div style={{ marginTop: 6 }}>{view.refusal.message}</div>
        </div>
      )}

      {view && !engine && !view.refusal && (
        <div className="card" style={{ color: "var(--muted)" }}>
          The checkpoint run finished with status <strong>{view.status}</strong> and produced no result
          file. {view.cleanupWarning ? `Cleanup: ${view.cleanupWarning}` : ""}
        </div>
      )}

      {engine && (
        <>
          {/* Verdict: the engine's own state, never a restatement of it. */}
          <div
            style={{
              padding: "16px 20px",
              background: passing ? "#23863622" : "var(--red-dim)",
              border: `2px solid ${passing ? "#23863666" : "#da363366"}`,
              borderRadius: "var(--radius)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span style={{ fontSize: 32, color: resultColor }}>{passing ? "✓" : "✗"}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: resultColor }}>
                {passing ? "VERIFIED — the change is safe" : `NOT VERIFIED — ${status}`}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                {engine.modernizationStep ?? "modernization step"} · subject {engine.modernizationCommit?.slice(0, 12) ?? subject?.slice(0, 12) ?? "—"}
                {engine.branch ? ` · run ref ${engine.branch}` : ""}
              </div>
            </div>
          </div>

          {/* Counts, exactly as the engine wrote them. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <CountPill label="Total" value={validation?.total} />
            <CountPill label="Passed" value={validation?.passed} color="var(--green)" />
            <CountPill label="Failed" value={validation?.failed} color="var(--red)" />
            <CountPill label="Skipped" value={validation?.skipped} color="var(--muted)" />
          </div>

          {recovery && (
            <div className="card">
              <div className="section-title">Recovery Validation</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                After the revert, the legacy suite was run again:{" "}
                <strong style={{ color: recovery.failed ? "var(--red)" : "var(--green)" }}>{recovery.status}</strong> ·{" "}
                {recovery.passed ?? "—"} passed, {recovery.failed ?? "—"} failed, {recovery.skipped ?? "—"} skipped
                {typeof recovery.total === "number" ? ` of ${recovery.total}` : ""}
              </div>
              {recovery.command && (
                <div className="mono" style={{ color: "var(--muted)", fontSize: 11, wordBreak: "break-all" }}>
                  {recovery.command}
                </div>
              )}
            </div>
          )}

          {/* The command that actually ran, and the harness output it produced. */}
          {validation?.command && (
            <div className="card">
              <div className="section-title">Command</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", wordBreak: "break-all" }}>
                {validation.command}
              </div>
            </div>
          )}

          {validation?.output && (
            <div className="card">
              <div className="section-title">Harness Output</div>
              <pre
                className="mono"
                style={{
                  background: "#0d1117",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 12,
                  maxHeight: 360,
                  overflow: "auto",
                  fontSize: 12,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {validation.output}
              </pre>
            </div>
          )}

          {engine.runtimeNote && (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{engine.runtimeNote}</div>
          )}
        </>
      )}

      {!view && !verify.phase.startsWith("busy") && (
        <div className="card" style={{ color: "var(--muted)" }}>
          {subject
            ? "A commit is recorded for this run. Running the checkpoint verifies that real commit against the 18-test legacy suite."
            : "No modernization commit has been applied yet. Run a step on the Execution screen first — a checkpoint verifies a real commit, not an intention."}
        </div>
      )}

      {view?.cleanupWarning && (
        <div style={{ color: "var(--yellow)", fontSize: 12 }}>Cleanup: {view.cleanupWarning}</div>
      )}
    </div>
  );
}

function CountPill({ label, value, color }: { label: string; value?: number; color?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? "var(--text)" }}>
        {/* An unreported count is shown as a dash, never as a zero. */}
        {value === undefined ? "—" : value}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

function btnStyle(borderColor: string): CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: "var(--radius)",
    border: `1px solid ${borderColor}`,
    background: "transparent",
    color: borderColor,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}
