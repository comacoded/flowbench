import "./charcoal.css";
import "reactflow/dist/style.css";
import { ReactFlow, Background, Controls, BackgroundVariant } from "reactflow";
import { useState } from "react";

type TerminalTab = "live" | "free" | "logs";

function App() {
  const [tab, setTab] = useState<TerminalTab>("live");

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Library />
        <Canvas />
        <Terminal tab={tab} setTab={setTab} />
      </div>
      <Inspector />
    </div>
  );
}

/* ─────────────── Top bar ─────────────── */
function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="logo">Flowbench</div>
        <div className="divider" />
        <button className="btn btn-primary">▶ Run</button>
        <button className="btn">▶| Step</button>
        <button className="btn">⏸ Pause</button>
      </div>
      <div className="topbar-right">
        <span className="flow-name">untitled.flow.json</span>
      </div>
    </header>
  );
}

/* ─────────────── Library ─────────────── */
function Library() {
  return (
    <aside className="panel library">
      <SectionLabel>Node types</SectionLabel>
      <LibraryItem name="Prompt" hint="Free-form instruction" />
      <LibraryItem name="Skill" hint="Run a saved skill" />
      <LibraryItem name="Sub-agent" hint="Isolated task" />
      <LibraryItem name="Assessment" hint="Branch on a check" />

      <SectionLabel>Skills</SectionLabel>
      <div className="empty">Auto-discovered in Phase 3</div>

      <SectionLabel>Super-nodes</SectionLabel>
      <div className="empty">Coming in v2</div>
    </aside>
  );
}

function LibraryItem({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="lib-item">
      <div className="lib-item-name">{name}</div>
      <div className="lib-item-hint">{hint}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label">{children}</div>;
}

/* ─────────────── Canvas ─────────────── */
function Canvas() {
  return (
    <main className="panel canvas">
      <ReactFlow
        nodes={[]}
        edges={[]}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#E5E5E7"
        />
        <Controls
          showInteractive={false}
          style={{
            background: "var(--ch-bg)",
            border: "1px solid var(--ch-border)",
            borderRadius: "var(--ch-radius-md)",
            boxShadow: "var(--ch-shadow)",
          }}
        />
      </ReactFlow>
    </main>
  );
}

/* ─────────────── Terminal ─────────────── */
function Terminal({
  tab,
  setTab,
}: {
  tab: TerminalTab;
  setTab: (t: TerminalTab) => void;
}) {
  return (
    <aside className="panel terminal">
      <div className="tabs">
        <Tab active={tab === "live"} onClick={() => setTab("live")}>
          Live
        </Tab>
        <Tab active={tab === "free"} onClick={() => setTab("free")}>
          Free
        </Tab>
        <Tab active={tab === "logs"} onClick={() => setTab("logs")}>
          Logs
        </Tab>
      </div>
      <div className="terminal-body">
        {tab === "live" && (
          <div className="empty">No node running. Click Run to start.</div>
        )}
        {tab === "free" && <div className="empty">Free CC session — v2</div>}
        {tab === "logs" && <div className="empty">Pipeline logs — v2</div>}
      </div>
    </aside>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`tab ${active ? "tab-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

/* ─────────────── Inspector ─────────────── */
function Inspector() {
  return (
    <footer className="panel inspector">
      <div className="section-label">Inspector</div>
      <div className="empty">Select a node to inspect its properties.</div>
    </footer>
  );
}

export default App;
