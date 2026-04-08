import "./charcoal.css";

function App() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ch-bg)",
        gap: 24,
      }}
    >
      <div
        style={{
          fontFamily: "var(--ch-font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ch-text-tertiary)",
        }}
      >
        Phase 0 · Scaffold
      </div>

      <h1
        style={{
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: 0,
          color: "var(--ch-text)",
        }}
      >
        Flowbench
      </h1>

      <p
        style={{
          fontSize: 16,
          color: "var(--ch-text-secondary)",
          margin: 0,
          maxWidth: 480,
          textAlign: "center",
          lineHeight: 1.55,
        }}
      >
        A visual workbench for designing, running, and evolving agentic
        workflows on top of Claude Code.
      </p>

      <div
        style={{
          marginTop: 32,
          display: "flex",
          gap: 12,
          fontFamily: "var(--ch-font-mono)",
          fontSize: 11,
          color: "var(--ch-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <span>Tauri</span>
        <span style={{ color: "var(--ch-border-strong)" }}>·</span>
        <span>React</span>
        <span style={{ color: "var(--ch-border-strong)" }}>·</span>
        <span>Charcoal</span>
      </div>
    </div>
  );
}

export default App;
