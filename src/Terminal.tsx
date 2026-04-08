import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

interface NodeOutput {
  node_id: string;
  stream: "stdout" | "stderr";
  line: string;
}

interface NodeFinished {
  node_id: string;
  success: boolean;
  exit_code: number | null;
}

interface NodeStarted {
  node_id: string;
}

export function LiveTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 12,
      lineHeight: 1.4,
      theme: {
        background: "#FFFFFF",
        foreground: "#1A1A1A",
        cursor: "#1A1A1A",
        cursorAccent: "#FFFFFF",
        selectionBackground: "rgba(26, 26, 26, 0.15)",
        black: "#1A1A1A",
        red: "#DC2626",
        green: "#16A34A",
        yellow: "#D97706",
        blue: "#2563EB",
        brightBlack: "#6B6B6B",
        brightWhite: "#1A1A1A",
      },
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    term.writeln("\x1b[90m// Flowbench live terminal\x1b[0m");
    term.writeln("\x1b[90m// Click ▶ on a node to run it\x1b[0m");
    term.writeln("");

    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    // Subscribe to Tauri events
    let unlisteners: UnlistenFn[] = [];
    (async () => {
      unlisteners.push(
        await listen<NodeStarted>("node-started", (e) => {
          term.writeln("");
          term.writeln(
            `\x1b[1m▶ ${e.payload.node_id}\x1b[0m \x1b[90m· running…\x1b[0m`,
          );
        }),
      );
      unlisteners.push(
        await listen<NodeOutput>("node-output", (e) => {
          const { stream, line } = e.payload;
          if (stream === "stderr") {
            term.writeln(`\x1b[31m${line}\x1b[0m`);
          } else {
            term.writeln(line);
          }
        }),
      );
      unlisteners.push(
        await listen<NodeFinished>("node-finished", (e) => {
          const { success, exit_code } = e.payload;
          if (success) {
            term.writeln(`\x1b[32m✓ done\x1b[0m`);
          } else {
            term.writeln(`\x1b[31m✗ exit ${exit_code ?? "?"}\x1b[0m`);
          }
        }),
      );
    })();

    return () => {
      window.removeEventListener("resize", onResize);
      unlisteners.forEach((u) => u());
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="xterm-host" />;
}
