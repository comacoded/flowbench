// Per-node Claude CLI runner.
//
// For Phase 4 we use headless mode (`claude -p "<prompt>"`) and stream
// stdout/stderr line-by-line back to the UI via Tauri events. PTY-style
// interactive sessions land in Phase 5/6 when the Free terminal tab arrives.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Serialize, Clone)]
pub struct NodeResult {
    pub node_id: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub output: String,
}

#[tauri::command]
pub async fn run_node(
    app: AppHandle,
    node_id: String,
    prompt: String,
) -> Result<NodeResult, String> {
    // Notify UI that the node is starting.
    let _ = app.emit(
        "node-started",
        serde_json::json!({ "node_id": node_id }),
    );

    let mut child = Command::new("claude")
        .arg("-p")
        .arg(&prompt)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn claude: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "no stdout handle".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "no stderr handle".to_string())?;

    let app_out = app.clone();
    let id_out = node_id.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut collected = String::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_out.emit(
                "node-output",
                serde_json::json!({
                    "node_id": id_out,
                    "stream": "stdout",
                    "line": line,
                }),
            );
            collected.push_str(&line);
            collected.push('\n');
        }
        collected
    });

    let app_err = app.clone();
    let id_err = node_id.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_err.emit(
                "node-output",
                serde_json::json!({
                    "node_id": id_err,
                    "stream": "stderr",
                    "line": line,
                }),
            );
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait failed: {}", e))?;

    let collected = stdout_task.await.unwrap_or_default();
    let _ = stderr_task.await;

    let result = NodeResult {
        node_id: node_id.clone(),
        success: status.success(),
        exit_code: status.code(),
        output: collected,
    };

    let _ = app.emit("node-finished", &result);

    Ok(result)
}
