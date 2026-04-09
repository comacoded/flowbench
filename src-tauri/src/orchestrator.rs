// The orchestrator: plan-pass that decides what context flows on each edge.
//
// At graph start, we serialize the graph to a compact summary, ask Claude to
// produce a JSON Context Plan, and parse it back. The plan is then used by the
// JS run loop to inject upstream context into downstream prompts.

use crate::paths::claude_binary;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlanEntry {
    pub from: String,
    pub to: String,
    pub instruction: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ContextPlan {
    pub edges: Vec<PlanEntry>,
    pub raw: String, // for debugging in the Plan tab
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GraphNodeSummary {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub intent: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GraphEdgeSummary {
    pub from: String,
    pub to: String,
}

fn build_orchestrator_prompt(
    nodes: &[GraphNodeSummary],
    edges: &[GraphEdgeSummary],
) -> String {
    let nodes_json = serde_json::to_string_pretty(nodes).unwrap_or_default();
    let edges_json = serde_json::to_string_pretty(edges).unwrap_or_default();
    format!(
        r#"You are the orchestrator for a multi-step Claude workflow.

Below is a graph of nodes and edges. Each node will execute as its own Claude
subprocess. Your job is to decide, for each EDGE in the graph, what slice of
the upstream node's output should flow to the downstream node — written as a
short natural-language instruction the downstream node will read as context.

Rules:
- Be terse. One short sentence per edge.
- If the downstream node clearly does not need any upstream context, set the
  instruction to the literal string "none".
- Do NOT pass full transcripts. Pass the minimum useful slice.
- Output ONLY a JSON object matching this schema, with no commentary, no
  prose, no markdown fences:
  {{ "edges": [ {{ "from": "n1", "to": "n2", "instruction": "..." }} ] }}

NODES:
{nodes_json}

EDGES:
{edges_json}

Now produce the Context Plan as raw JSON."#,
    )
}

fn extract_json_object(text: &str) -> Option<&str> {
    // Find the first { and matching } accounting for nesting.
    let bytes = text.as_bytes();
    let start = bytes.iter().position(|&b| b == b'{')?;
    let mut depth = 0i32;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if b == b'{' {
            depth += 1;
        } else if b == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(&text[start..=i]);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn plan_graph(
    nodes: Vec<GraphNodeSummary>,
    edges: Vec<GraphEdgeSummary>,
    model: Option<String>,
) -> Result<ContextPlan, String> {
    if edges.is_empty() {
        return Ok(ContextPlan {
            edges: vec![],
            raw: "(no edges to plan)".into(),
        });
    }

    let prompt = build_orchestrator_prompt(&nodes, &edges);

    let claude = claude_binary().ok_or_else(|| "claude CLI not found.".to_string())?;
    let mut cmd = Command::new(&claude);
    cmd.arg("-p").arg(&prompt);
    if let Some(m) = model.as_ref() {
        if !m.is_empty() && m != "auto" {
            cmd.arg("--model").arg(m);
        }
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("orchestrator spawn failed: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.shutdown().await;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("orchestrator wait failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "orchestrator exited {}: {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    // Parse the first JSON object out of the response.
    let json_slice = extract_json_object(&stdout)
        .ok_or_else(|| format!("orchestrator returned no JSON object:\n{}", stdout))?;

    #[derive(Deserialize)]
    struct PlanResponse {
        edges: Vec<PlanEntry>,
    }

    let parsed: PlanResponse = serde_json::from_str(json_slice)
        .map_err(|e| format!("orchestrator JSON parse failed: {}\n---\n{}", e, json_slice))?;

    Ok(ContextPlan {
        edges: parsed.edges,
        raw: stdout,
    })
}
