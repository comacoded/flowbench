// Connection-status check for the system `claude` CLI.
//
// Flowbench doesn't have its own auth — it shells out to whatever `claude`
// the user has installed and logged in via Claude Code. This module probes
// that install and reports a status the UI can show as a pill.

use crate::paths::claude_binary;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ClaudeStatusKind {
    Connected,
    NotInstalled,
    NotSignedIn,
    Unknown,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClaudeStatus {
    pub kind: ClaudeStatusKind,
    pub message: String,
}

#[tauri::command]
pub async fn claude_status() -> ClaudeStatus {
    let Some(claude) = claude_binary() else {
        return ClaudeStatus {
            kind: ClaudeStatusKind::NotInstalled,
            message: "claude CLI not found in any standard location.".into(),
        };
    };

    // Probe with a tiny prompt. Auth failures show up as a non-zero exit
    // or as stderr containing words like "login" / "auth".
    let probe = Command::new(&claude)
        .arg("-p")
        .arg("ok")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn();

    let child = match probe {
        Ok(c) => c,
        Err(e) => {
            return ClaudeStatus {
                kind: ClaudeStatusKind::Unknown,
                message: format!("Could not spawn claude: {}", e),
            }
        }
    };

    // 12-second timeout. A logged-in claude should respond well under this.
    let result = timeout(Duration::from_secs(12), child.wait_with_output()).await;

    match result {
        Ok(Ok(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
            if output.status.success() {
                return ClaudeStatus {
                    kind: ClaudeStatusKind::Connected,
                    message: "Connected to Claude".into(),
                };
            }
            if stderr.contains("login") || stderr.contains("auth") || stderr.contains("sign") {
                return ClaudeStatus {
                    kind: ClaudeStatusKind::NotSignedIn,
                    message: "Run `claude login` in a terminal, then refresh.".into(),
                };
            }
            ClaudeStatus {
                kind: ClaudeStatusKind::Unknown,
                message: format!(
                    "claude exited {} — {}",
                    output.status.code().unwrap_or(-1),
                    stderr.trim()
                ),
            }
        }
        Ok(Err(e)) => ClaudeStatus {
            kind: ClaudeStatusKind::Unknown,
            message: format!("claude wait failed: {}", e),
        },
        Err(_) => ClaudeStatus {
            kind: ClaudeStatusKind::Unknown,
            message: "Timed out probing claude. Is it hanging on auth?".into(),
        },
    }
}

/// Spawn `claude login`. The CLI opens a browser window for OAuth and exits
/// when the user completes the flow. Flowbench just kicks it off and waits.
#[tauri::command]
pub async fn claude_login(app: AppHandle) -> Result<String, String> {
    let _ = app.emit("auth-event", serde_json::json!({ "kind": "login_started" }));

    let claude = claude_binary()
        .ok_or_else(|| "claude CLI not found. Install Claude Code first.".to_string())?;

    let child = Command::new(&claude)
        .arg("login")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to start claude login: {}", e))?;

    // Don't block forever — give the user a generous window to finish in browser.
    let result = timeout(Duration::from_secs(300), child.wait_with_output()).await;

    match result {
        Ok(Ok(output)) => {
            let _ = app.emit("auth-event", serde_json::json!({ "kind": "login_finished" }));
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Ok(Err(e)) => Err(format!("login wait failed: {}", e)),
        Err(_) => Err("Login timed out after 5 minutes. Try again.".into()),
    }
}

/// Spawn `claude logout`. Removes credentials from the local CLI install.
#[tauri::command]
pub async fn claude_logout() -> Result<String, String> {
    let claude = claude_binary()
        .ok_or_else(|| "claude CLI not found.".to_string())?;
    let output = Command::new(&claude)
        .arg("logout")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| format!("failed to run claude logout: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
