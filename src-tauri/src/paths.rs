// Find the absolute path to the user's `claude` binary.
//
// GUI-launched macOS apps inherit only a minimal PATH and miss
// /usr/local/bin, /opt/homebrew/bin, ~/.local/bin etc., so a bare `which
// claude` fails for users who have claude installed via the standard
// per-user installer. Search known locations explicitly.

use std::path::PathBuf;
use std::sync::OnceLock;

static CLAUDE_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = Vec::new();

    if let Some(home) = home_dir() {
        v.push(home.join(".local/bin/claude"));
        v.push(home.join("bin/claude"));
        v.push(home.join(".claude/local/claude"));
    }

    v.push(PathBuf::from("/opt/homebrew/bin/claude"));
    v.push(PathBuf::from("/usr/local/bin/claude"));
    v.push(PathBuf::from("/usr/bin/claude"));

    v
}

/// Resolve the absolute path to the `claude` CLI, or None if it cannot be
/// found. Result is cached for the lifetime of the process.
pub fn claude_binary() -> Option<PathBuf> {
    CLAUDE_PATH
        .get_or_init(|| {
            for p in candidate_paths() {
                if p.exists() {
                    return Some(p);
                }
            }
            // Last resort — maybe it's on the GUI PATH after all.
            if let Ok(out) = std::process::Command::new("which").arg("claude").output() {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() {
                        return Some(PathBuf::from(s));
                    }
                }
            }
            None
        })
        .clone()
}
