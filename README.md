# Flowbench

A visual workbench for designing, running, and evolving agentic workflows on top of Claude Code.

**Status:** `0.1.0-mvp` — feature-complete for the initial scope, not production software. No code signing, no auto-update, no real-world stress testing.

## What it does

- Drag/drop visual canvas for chaining prompts, skills, sub-agents, and assessment branches
- Auto-discovers your installed skills from `~/.claude/skills/` and `~/.claude/commands/`
- Per-node modal editing with draft state
- Branching edges (sequential / on-success / on-failure / conditional) with inline branch picker
- Pre-flight modal lets you pick the orchestrator model and override per-node models for one run
- Orchestrator does a plan-pass before each run, producing a Context Plan visible in its own tab
- Frontier-based parallel run loop honors edge kinds and Assessment branch outcomes
- Per-node status pulses on the canvas and a Results page with per-node cards
- Output nodes that materialize Markdown / Word / PowerPoint / Figma / JSON files at the end of a run
- Native Sign in / Sign out via the Claude OAuth web flow — no terminal required, no credentials stored

## Requirements

- macOS (Apple Silicon or Intel — universal binary)
- [Claude Code CLI](https://claude.com/download) installed locally
- A Claude Max subscription (Flowbench piggybacks on the system `claude` install — no separate billing)

## Install

1. Download the latest `.dmg` from the [Releases](../../releases) page
2. Open it and drag **Flowbench.app** to **Applications**
3. First launch: right-click the app → **Open** → **Open** (one-time Gatekeeper bypass since the build is unsigned)
4. The status pill in the top bar tells you whether `claude` is found and signed in. Click it to sign in.

## Build from source

```bash
git clone https://github.com/boomerfreak1/flowbench.git
cd flowbench
npm install
npm run tauri dev                                       # development
npm run tauri build                                     # production app for current arch
npm run tauri build -- --target universal-apple-darwin  # universal
```

Requires Rust (`rustup`), Node ≥18, and Xcode Command Line Tools.

## Stack

- **Tauri 2** — Rust core + WebView UI
- **React 19** + **React Flow** — canvas
- **xterm.js** — live terminal pane
- **Charcoal** — design system (light minimal, Inter + JetBrains Mono)

## License

MIT
