import { useEffect, useRef, useState } from "react";
import LandingScreen from "./screens/LandingScreen";
import ThemeToggle from "./ThemeToggle";
import StartScreen from "./screens/StartScreen";
import ArchitectureScreen from "./screens/ArchitectureScreen";
import OverviewScreen from "./screens/OverviewScreen";
import RiskScreen from "./screens/RiskScreen";
import PlanScreen from "./screens/PlanScreen";
import ExecutionScreen from "./screens/ExecutionScreen";
import VerificationScreen from "./screens/VerificationScreen";
import RollbackScreen from "./screens/RollbackScreen";
import ReportScreen from "./screens/ReportScreen";
import { WorkflowProvider, useWorkflow } from "./workflow/WorkflowContext";
import type { WorkflowState } from "./workflow/types";
import { analyzeRepository, getRun, startExecution, startVerification, WorkflowApiError } from "./api/workflowApi";
import { PipelineTexture } from "./Texture";
import "./App.css";

type Screen = "architecture" | "overview" | "risk" | "plan" | "execution" | "verification" | "rollback" | "report";

interface NavItem {
  id: Screen;
  label: string;
}

const NAV: NavItem[] = [
  { id: "architecture", label: "Architecture" },
  { id: "overview",     label: "Overview" },
  { id: "risk",         label: "Risk" },
  { id: "plan",         label: "Plan" },
  { id: "execution",    label: "Execution" },
  { id: "verification", label: "Verification" },
  { id: "rollback",     label: "Rollback" },
  { id: "report",       label: "Report" },
];

const PHASE_LABELS: Record<Screen, string> = {
  architecture: "Understand",
  overview:     "Understand · Protect",
  risk:         "Assess",
  plan:         "Plan",
  execution:    "Execute",
  verification: "Verify",
  rollback:     "Rollback · Recover",
  report:       "Report",
};

function safetyPillState(status?: string): { className: string; label: string } {
  switch (status) {
    case "running":
      return { className: "safety-pill is-run", label: "Safety net · running" };
    case "passed":
      return { className: "safety-pill is-ok", label: "Safety net · passing" };
    case "failed":
      return { className: "safety-pill is-fail", label: "Safety net · failing" };
    case "not_available":
      return { className: "safety-pill", label: "Safety net · not available" };
    default:
      return { className: "safety-pill", label: "Safety net · not run" };
  }
}

// ── Dashboard (rendered inside WorkflowProvider) ─────────────────────────────

function Dashboard({ repoUrl, onChangeRepo }: { repoUrl: string; onChangeRepo: () => void }) {
  const { state, setState } = useWorkflow();
  const { repository, overallProgress } = state;

  const [active, setActive] = useState<Screen>("overview");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (state.operationStatus !== "running") return;
    const controller = new AbortController();
    let polling = false;
    const timer = setInterval(() => {
      if (polling || controller.signal.aborted) return;
      polling = true;
      void getRun(state.runId, controller.signal)
        .then(({ workflow }) => setState(workflow))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setActionError(error instanceof Error ? error.message : "Could not refresh workflow state.");
        })
        .finally(() => { polling = false; });
    }, 1200);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [state.runId, state.operationStatus, setState]);

  async function executeNextStep() {
    setActionError(null);
    try { setState(await startExecution(state.runId)); }
    catch (error: unknown) { setActionError(error instanceof Error ? error.message : "Execution request failed."); }
  }

  async function verifyRepository() {
    setActionError(null);
    try { setState(await startVerification(state.runId)); }
    catch (error: unknown) { setActionError(error instanceof Error ? error.message : "Verification request failed."); }
  }

  function navigate(screen: Screen) {
    setActive(screen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pill = safetyPillState(state.checkpointResult?.status);
  const detail = state.checkpointResult;
  const pillTitle =
    detail?.status === "passed" ? `Safety net · ${detail.passed}/${detail.total} passing`
    : detail?.status === "failed" ? `Safety net · ${detail.failed} failing`
    : pill.label;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <span className="brand-name">Legacy Code Whisperer</span>
          <span className="brand-rule" />
          <span className="eyebrow">IBM Bob 2.0 · Team Codexmatrix</span>
        </div>

        <div className="topbar-right">
          <span className="phase-chip">
            <span className="phase-key">Phase</span>
            <span className="phase-val">{PHASE_LABELS[active]}</span>
          </span>
          <span className={pill.className} title={pillTitle}>{pillTitle}</span>
          <ThemeToggle />
          <button className="btn btn-quiet" onClick={onChangeRepo}>← Change repo</button>
        </div>
      </header>

      <div className="shell">
        <aside className="rail">
          <div className="rail-label">Workflow</div>

          {NAV.map((item, index) => (
            <button
              key={item.id}
              className={`nav-item${active === item.id ? " is-active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={active === item.id ? "page" : undefined}
            >
              <span className="nav-step">{String(index + 1).padStart(2, "0")}</span>
              <span>{item.label}</span>
            </button>
          ))}

          <div className="rail-foot">
            <div className="rail-repo">{repository.name}</div>
            <div className="rail-meta">{repository.runtime}</div>
            <div className="rail-progress">
              <div className="progress">
                <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
              </div>
              <span>{overallProgress}%</span>
            </div>
            <div className="rail-url">{repoUrl}</div>
          </div>
        </aside>

        <main className="main">
          <PipelineTexture className="tex tex-pipe" />
          {actionError && (
            <div role="alert" className="alert">
              <span aria-hidden="true">✕</span>
              <span>Workflow request failed: {actionError}</span>
            </div>
          )}
          <div className="screen" key={active}>
            {active === "architecture" && <ArchitectureScreen />}
            {active === "overview"    && <OverviewScreen repoUrl={repoUrl} />}
            {active === "risk"        && <RiskScreen />}
            {active === "plan"        && <PlanScreen />}
            {active === "execution"   && (
              <ExecutionScreen
                onVerify={() => navigate("verification")}
                onRollback={() => navigate("rollback")}
                onExecute={executeNextStep}
                onRunVerification={verifyRepository}
              />
            )}
            {active === "verification" && <VerificationScreen onRollback={() => navigate("rollback")} onRunVerification={verifyRepository} />}
            {active === "rollback"     && <RollbackScreen />}
            {active === "report"       && <ReportScreen />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── App state machine ─────────────────────────────────────────────────────────

type AppPhase =
  | { kind: "landing" }
  | { kind: "start" }
  | { kind: "loading"; repoUrl: string }
  | { kind: "error"; repoUrl: string; message: string; code: string }
  | { kind: "dashboard"; repoUrl: string; workflowState: WorkflowState };

// ── Root App — entry gate + provider ─────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState<AppPhase>({ kind: "landing" });
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  function goToStart() {
    requestController.current?.abort();
    requestController.current = null;
    // Drop any lingering section anchor so the input screen opens at the top.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setPhase({ kind: "start" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function goToLanding() {
    requestController.current?.abort();
    requestController.current = null;
    setPhase({ kind: "landing" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function handleStart(repoUrl: string) {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setPhase({ kind: "loading", repoUrl });
    try {
      const { workflow } = await analyzeRepository(repoUrl, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setPhase({ kind: "dashboard", repoUrl, workflowState: workflow });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Repository analysis failed.";
      const code = err instanceof WorkflowApiError ? err.code : "ANALYSIS_FAILED";
      setPhase({ kind: "error", repoUrl, message, code });
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  }

  if (phase.kind === "landing") {
    return <LandingScreen onAnalyze={goToStart} />;
  }

  if (phase.kind === "start") {
    return <StartScreen onStart={handleStart} onBack={goToLanding} />;
  }

  if (phase.kind === "loading") {
    return <StartScreen onStart={handleStart} onBack={goToLanding} loading repoUrl={phase.repoUrl} />;
  }

  if (phase.kind === "error") {
    return (
      <StartScreen
        onStart={handleStart}
        onBack={goToLanding}
        errorMessage={phase.message}
        errorCode={phase.code}
        defaultUrl={phase.repoUrl}
      />
    );
  }

  // phase.kind === "dashboard"
  return (
    <WorkflowProvider state={phase.workflowState}>
      <Dashboard repoUrl={phase.repoUrl} onChangeRepo={goToStart} />
    </WorkflowProvider>
  );
}
