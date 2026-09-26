import { useEffect, useId, useRef, useState } from "react";

// Diagram of the real Get24 application as it exists in this repository.
// Hand-maintained from the source: server/index.js, server/game/index.js,
// server/game/timer.js, public/js/SocketController.js, public/js/StageController.js.
// It is NOT generated at runtime by IBM Bob or by any AI.
const DIAGRAM = `flowchart LR
  subgraph client["Client - browser - public/"]
    HTML["index.html - app shell"]
    SC["SocketController.js - io.connect"]
    ST["StageController.js - KineticJS 4.6 canvas"]
    HTML --> SC
    HTML --> ST
  end

  subgraph server["Server - node index.js - port 4000"]
    ENTRY["index.js - npm start"]
    HTTP["server/index.js - Express 3 static + http.createServer + io.listen"]
    ACC["accept socket - maxConnections guard"]
    GAMES["gameList - room uuid v4, reused per player"]
    GAME["server/game/index.js - validate + evaluate expression"]
    TIMER["server/game/timer.js - 1s tick loop"]
    CONF["config.json + cards.json - maxPlayers, initialTimer, cutoffs"]
    ENTRY --> HTTP
    HTTP --> ACC
    ACC --> GAMES
    GAMES --> GAME
    GAME <--> TIMER
    CONF -.-> GAME
  end

  SC -->|"submitExpression"| HTTP
  HTTP -->|"connected, gameJoined, evaluatedExpr, invalidExpr, roundOver"| SC
  ST -.->|"reads game state"| SC`;

const EVENTS: Array<{ dir: "S→C" | "C→S"; name: string; payload: string }> = [
  { dir: "C→S", name: "submitExpression", payload: "{ expression }" },
  { dir: "S→C", name: "connected", payload: "{ numUsers }" },
  { dir: "S→C", name: "overCapacity", payload: "— (client is disconnected)" },
  { dir: "S→C", name: "gameJoined", payload: "{ room, card, numPlayers }" },
  { dir: "S→C", name: "playerJoined", payload: "{ numPlayers }" },
  { dir: "S→C", name: "playerQuit", payload: "{ numPlayers }" },
  { dir: "S→C", name: "evaluatedExpr", payload: "{ evaluated }" },
  { dir: "S→C", name: "invalidExpr", payload: "{ msg }" },
  { dir: "S→C", name: "timer", payload: "{ time }" },
  { dir: "S→C", name: "roundOver", payload: "{ type: win | loss | timer, card, expression? }" },
];

const SERVER_PARTS = [
  ["index.js", "npm start entry point; requires ./server"],
  ["server/index.js", "Express 3 static serving, Socket.IO 0.9 listener, connection capacity guard"],
  ["server/game/index.js", "Game state, expression validate() and evaluation, card selection"],
  ["server/game/timer.js", "One-second interval loop; emits timer and roundOver"],
  ["server/config.json", "port 4000, maxConnections 100"],
  ["server/game/config.json", "maxPlayers 4, initialTimer 300s, easy/medium cutoffs"],
  ["server/game/cards.json", "47 four-digit cards: 12 easy, 24 medium, 11 hard"],
];

const CLIENT_PARTS = [
  ["public/index.html", "App shell, loads the Socket.IO client and both controllers"],
  ["public/js/SocketController.js", "io.connect('/') and the full event contract"],
  ["public/js/StageController.js", "KineticJS 4.6 canvas rendering of cards and timer"],
  ["public/js/kinetic-v4.6.0.min.js", "Vendored 2013 canvas library"],
  ["public/css/styles.css", "Minimal layout"],
];

const MODERNIZATION = [
  ["F-11", "node-uuid → uuid 9.0.1", "done", "tag-green"],
  ["F-18", "validate() non-string type guard", "done", "tag-green"],
  ["Express 3 → 4/5", "app.configure, favicon, logger, errorHandler are gone", "not started", "tag-medium"],
  ["Socket.IO 0.9 → 4", "io.configure/origins and the served client build change", "not started", "tag-medium"],
  ["KineticJS", "vendored 2013 build, no maintained replacement in repo", "not started", "tag-medium"],
];

function EventTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)", textAlign: "left" }}>
            <th style={{ padding: "6px 8px", fontWeight: 600, width: 60 }}>Dir</th>
            <th style={{ padding: "6px 8px", fontWeight: 600 }}>Event</th>
            <th style={{ padding: "6px 8px", fontWeight: 600 }}>Payload</th>
          </tr>
        </thead>
        <tbody>
          {EVENTS.map((e) => (
            <tr key={e.dir + e.name} style={{ borderBottom: "1px solid var(--border)" }}>
              <td className="mono" style={{ padding: "5px 8px", color: "var(--muted)" }}>{e.dir}</td>
              <td className="mono" style={{ padding: "5px 8px", color: "var(--accent)" }}>{e.name}</td>
              <td className="mono" style={{ padding: "5px 8px", color: "var(--text)" }}>{e.payload}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PartList({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="section-title">{title}</div>
      {rows.map(([file, note]) => (
        <div key={file} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
          <span className="mono" style={{ color: "var(--accent)", minWidth: 190 }}>{file}</span>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{note}</span>
        </div>
      ))}
    </div>
  );
}

export default function ArchitectureScreen() {
  const rawId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = "get24-arch-" + rawId.replace(/[^a-zA-Z0-9]/g, "");

    // mermaid is loaded on demand so its ~600 kB of diagram engines stay out of
    // the initial bundle of the other seven screens.
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
        return mermaid.render(id, DIAGRAM);
      })
      .then(({ svg }) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        const el = hostRef.current.querySelector("svg");
        if (el) {
          el.style.maxWidth = "100%";
          el.style.height = "auto";
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [rawId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Architecture</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>
          The Understand stage: exactly what Legacy Code Whisperer protects. This is the real
          CoryG89/Get24 application in <span className="mono">legacy/get24-baseline</span> and at the
          repository root — a 2013 Node 0.8 / Express 3 / Socket.IO 0.9 multiplayer game.
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <span className="tag tag-low">20 source files</span>
          <span className="tag tag-low">MIT licensed upstream</span>
          <span className="tag tag-green">18 behavioral tests protect it</span>
          <span className="tag tag-medium">no database, no external services</span>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">Component map</div>
        {error ? (
          <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>
            Diagram could not be rendered: {error}
          </div>
        ) : (
          <div ref={hostRef} data-testid="architecture-diagram" />
        )}
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 12 }}>
          Hand-maintained from the source files listed below. It is not generated at runtime by
          IBM Bob or by any model.
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">Socket.IO 0.9 event contract</div>
        <EventTable />
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 10 }}>
          This is the contract the 18 behavioral tests assert. Renaming one of these events is
          exactly what a controlled regression does, and the safety net catches it.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <PartList title="Server" rows={SERVER_PARTS} />
        <PartList title="Client" rows={CLIENT_PARTS} />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">Modernization targets in this architecture</div>
        {MODERNIZATION.map(([id, title, status, cls]) => (
          <div
            key={id}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)" }}
          >
            <span className="mono" style={{ color: "var(--muted)", width: 130 }}>{id}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{title}</span>
            <span className={"tag " + cls}>{status}</span>
          </div>
        ))}
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 10 }}>
          Each of these must pass all 18 tests before it is kept, and is reverted automatically if
          it does not.
        </div>
      </div>
    </div>
  );
}
