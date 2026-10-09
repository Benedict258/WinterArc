// WinterArc desktop: a native window around https://winterarc.benedictisaac.dev.
// The site does everything (login, offline cache, Drop); this shell adds a
// real app window, one running instance, and opens off-site links in the
// system browser instead of inside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::NewWindowResponse;
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const APP_URL: &str = "https://winterarc.benedictisaac.dev/";
const APP_HOST: &str = "winterarc.benedictisaac.dev";

/// Pages that belong inside the app window. Everything else (resource links,
/// Drop links, …) opens in the default browser.
fn is_internal(url: &Url) -> bool {
    match url.scheme() {
        "blob" | "data" | "about" => true, // Drop file downloads, blank frames
        "https" => url.host_str() == Some(APP_HOST),
        _ => false,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Launching again focuses the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let nav_handle = app.handle().clone();
            let popup_handle = app.handle().clone();

            // Open at 1280×820, or smaller on screens that can't fit that
            let (mut width, mut height) = (1280.0_f64, 820.0_f64);
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                width = width.min(size.width * 0.92);
                height = height.min(size.height * 0.88);
            }

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(APP_URL.parse().unwrap()))
                .title("WinterArc")
                .inner_size(width, height)
                .min_inner_size(380.0, 560.0)
                .center()
                .on_navigation(move |url| {
                    if is_internal(url) {
                        return true;
                    }
                    let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                // target="_blank" links (resources, Drop links) open in the
                // system browser rather than a bare extra window
                .on_new_window(move |url, _features| {
                    let _ = popup_handle.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WinterArc");
}
