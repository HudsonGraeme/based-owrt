use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[derive(Debug, Serialize)]
struct NetworkDevice {
    ip: String,
    mac: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HttpResponse {
    status: u16,
    data: String,
}

#[tauri::command]
async fn scan_network() -> Result<Vec<NetworkDevice>, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("arp")
            .arg("-a")
            .output()
    } else {
        Command::new("arp")
            .arg("-a")
            .output()
    }.map_err(|e| format!("Failed to execute arp: {}", e))?;

    if !output.status.success() {
        return Err("ARP command failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();

    for line in stdout.lines() {
        let (ip, mac) = if cfg!(target_os = "windows") {
            parse_windows_arp_line(line)
        } else {
            parse_unix_arp_line(line)
        };

        if let Some(ip) = ip {
            if is_private_ip(&ip) {
                devices.push(NetworkDevice { ip, mac });
            }
        }
    }

    devices.sort_by(|a, b| {
        let a_parts: Vec<u8> = a.ip.split('.').filter_map(|s| s.parse().ok()).collect();
        let b_parts: Vec<u8> = b.ip.split('.').filter_map(|s| s.parse().ok()).collect();
        a_parts.cmp(&b_parts)
    });

    Ok(devices)
}

fn parse_unix_arp_line(line: &str) -> (Option<String>, Option<String>) {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 4 {
        let ip = parts[1]
            .trim_start_matches('(')
            .trim_end_matches(')')
            .to_string();
        let mac = parts[3].to_string();
        if mac != "(incomplete)" && mac.contains(':') {
            return (Some(ip), Some(mac));
        }
        return (Some(ip), None);
    }
    (None, None)
}

fn parse_windows_arp_line(line: &str) -> (Option<String>, Option<String>) {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 2 {
        let ip = parts[0].to_string();
        if ip.contains('.') {
            let mac = if parts.len() >= 2 && parts[1].contains('-') {
                Some(parts[1].replace('-', ":"))
            } else {
                None
            };
            return (Some(ip), mac);
        }
    }
    (None, None)
}

fn is_private_ip(ip: &str) -> bool {
    use std::net::Ipv4Addr;
    if let Ok(addr) = ip.parse::<Ipv4Addr>() {
        addr.is_private()
    } else {
        false
    }
}

#[tauri::command]
async fn http_post(url: String, body: String) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    let data = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(HttpResponse { status, data })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_network, http_post])
        .setup(|app| {
            let handle = app.handle();

            let preferences = MenuItem::with_id(handle, "preferences", "Preferences...", true, Some("CmdOrCtrl+,"))?;

            let app_submenu = Submenu::with_items(
                handle,
                "Based Router Manager",
                true,
                &[
                    &PredefinedMenuItem::about(handle, Some("About Based Router Manager"), None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &preferences,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, Some("Quit Based Router Manager"))?,
                ],
            )?;

            let edit_submenu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            let window_submenu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::maximize(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;

            let menu = Menu::with_items(handle, &[&app_submenu, &edit_submenu, &window_submenu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "preferences" {
                if let Some(window) = app.get_webview_window("preferences") {
                    let _ = window.set_focus();
                } else {
                    let _ = WebviewWindowBuilder::new(
                        app,
                        "preferences",
                        WebviewUrl::App("preferences.html".into()),
                    )
                    .title("Preferences")
                    .inner_size(400.0, 320.0)
                    .resizable(false)
                    .minimizable(false)
                    .maximizable(false)
                    .build();
                }
            }
        });

    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
