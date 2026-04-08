mod orchestrator;
mod runner;

use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Clone)]
pub struct SkillEntry {
    kind: String, // "skill" or "command"
    name: String,
    description: String,
    path: String,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn read_first_nonempty_line(text: &str) -> String {
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .unwrap_or("")
        .chars()
        .take(140)
        .collect()
}

fn parse_skill_frontmatter(text: &str, fallback_name: &str) -> (String, String) {
    // Skills use YAML frontmatter delimited by ---
    let mut name = fallback_name.to_string();
    let mut description = String::new();

    if let Some(rest) = text.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let frontmatter = &rest[..end];
            let mut current_key: Option<&str> = None;
            let mut multiline_buf = String::new();

            for line in frontmatter.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let key = k.trim();
                    let val = v.trim();
                    if key == "name" {
                        if !val.is_empty() {
                            name = val.trim_matches('"').to_string();
                        }
                        current_key = Some("name");
                    } else if key == "description" {
                        if val == ">" || val.is_empty() {
                            current_key = Some("description");
                            multiline_buf.clear();
                        } else {
                            description = val.trim_matches('"').to_string();
                            current_key = None;
                        }
                    } else {
                        current_key = None;
                    }
                } else if current_key == Some("description") {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        if !multiline_buf.is_empty() {
                            multiline_buf.push(' ');
                        }
                        multiline_buf.push_str(trimmed);
                    }
                }
            }
            if description.is_empty() && !multiline_buf.is_empty() {
                description = multiline_buf;
            }
        }
    }

    if description.len() > 200 {
        description.truncate(197);
        description.push_str("...");
    }
    (name, description)
}

#[tauri::command]
fn list_skills() -> Vec<SkillEntry> {
    let mut entries: Vec<SkillEntry> = Vec::new();
    let Some(home) = home_dir() else { return entries };

    // Skills
    let skills_dir = home.join(".claude/skills");
    if let Ok(read) = fs::read_dir(&skills_dir) {
        for e in read.flatten() {
            let path = e.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if let Ok(text) = fs::read_to_string(&path) {
                let (name, description) = parse_skill_frontmatter(&text, &stem);
                entries.push(SkillEntry {
                    kind: "skill".into(),
                    name,
                    description,
                    path: path.to_string_lossy().into_owned(),
                });
            }
        }
    }

    // Commands
    let commands_dir = home.join(".claude/commands");
    if let Ok(read) = fs::read_dir(&commands_dir) {
        for e in read.flatten() {
            let path = e.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if let Ok(text) = fs::read_to_string(&path) {
                let description = read_first_nonempty_line(&text);
                entries.push(SkillEntry {
                    kind: "command".into(),
                    name: stem,
                    description,
                    path: path.to_string_lossy().into_owned(),
                });
            }
        }
    }

    entries.sort_by(|a, b| a.kind.cmp(&b.kind).then(a.name.cmp(&b.name)));
    entries
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            list_skills,
            runner::run_node,
            orchestrator::plan_graph
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
