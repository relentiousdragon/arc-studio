#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::ffi::CString;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_updater::UpdaterExt;
use tokio::io::AsyncReadExt;
use tokio::sync::Notify;

const UPDATE_REPOSITORY: &str = match option_env!("ARC_UPDATE_REPOSITORY") {
    Some(repository) => repository,
    None => "relentiousdragon/arc-studio",
};

fn build_release_channel() -> &'static str {
    option_env!("ARC_RELEASE_CHANNEL")
        .filter(|channel| *channel == "nightly" || *channel == "stable")
        .unwrap_or_else(|| {
            if option_env!("CARGO_PKG_VERSION")
                .and_then(|version| version.split_once('-').map(|(_, prerelease)| prerelease))
                .is_some_and(|prerelease| !prerelease.starts_with("stable."))
            {
                "nightly"
            } else {
                "stable"
            }
        })
}

fn arc_version_label(version: &str) -> String {
    let (version_without_build, build) = version
        .split_once('+')
        .map_or((version, String::new()), |(version, build)| {
            (version, format!("+{build}"))
        });
    if let Some((core, prerelease)) = version_without_build.split_once('-') {
        if let Some(patch) = prerelease.strip_prefix("stable.") {
            if !patch.is_empty() && patch.bytes().all(|byte| byte.is_ascii_digit()) {
                return format!("{core}.{patch}{build}");
            }
        }
    }
    format!("{version_without_build}{build}")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientBuildInfo {
    version: String,
    platform: &'static str,
    architecture: &'static str,
}

#[tauri::command]
fn get_client_build_info() -> ClientBuildInfo {
    ClientBuildInfo {
        version: arc_version_label(env!("CARGO_PKG_VERSION")),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
    }
}

fn updater_endpoint(channel: &str) -> Result<url::Url, String> {
    if channel != build_release_channel() {
        return Err(format!("This ARC Studio build is locked to the {} update channel.", build_release_channel()));
    }
    let endpoint = match channel {
        "stable" => format!("https://github.com/{UPDATE_REPOSITORY}/releases/latest/download/latest.json"),
        "nightly" => format!("https://github.com/{UPDATE_REPOSITORY}/releases/download/nightly/latest.json"),
        _ => return Err("Choose the stable or nightly update channel.".to_string()),
    };
    endpoint.parse().map_err(|error| format!("Invalid updater endpoint: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelUpdateMetadata {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StagedUpdateStatus {
    version: String,
    staged: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDownloadProgress {
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    percent: Option<u8>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedUpdateMetadata {
    channel: String,
    version: String,
    raw_json: serde_json::Value,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRollbackMetadata {
    source: PathBuf,
    backup: PathBuf,
    launch_relative_path: PathBuf,
    backup_launch_path: PathBuf,
    startup_marker: PathBuf,
    health_marker: PathBuf,
    unit_kind: String,
}

fn rollback_metadata_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let directory = app.path().app_local_data_dir().map_err(|error| format!("Could not access ARC Studio local data: {error}"))?.join("updates");
    Ok(directory.join("rollback.json"))
}

#[cfg(not(target_os = "macos"))]
fn update_install_unit() -> Result<(PathBuf, PathBuf, String), String> {
    let executable = std::env::current_exe().map_err(|error| format!("Could not locate the installed ARC Studio app: {error}"))?;
    #[cfg(target_os = "macos")]
    {
        let app_bundle = executable.ancestors().find(|path| path.extension().is_some_and(|extension| extension == "app"))
            .ok_or_else(|| "Could not locate the ARC Studio app bundle for update recovery.".to_string())?.to_path_buf();
        let relative = executable.strip_prefix(&app_bundle).map_err(|_| "Could not locate the ARC Studio executable inside its app bundle.".to_string())?.to_path_buf();
        return Ok((app_bundle, relative, "directory".to_string()));
    }
    #[cfg(target_os = "windows")]
    {
        let directory = executable.parent().ok_or_else(|| "Could not locate the ARC Studio install folder.".to_string())?.to_path_buf();
        let relative = executable.strip_prefix(&directory).map_err(|_| "Could not locate ARC Studio inside its install folder.".to_string())?.to_path_buf();
        return Ok((directory, relative, "directory".to_string()));
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(appimage) = std::env::var_os("APPIMAGE").filter(|path| !path.is_empty()) {
            let image = PathBuf::from(appimage);
            return Ok((image.clone(), image.file_name().map(PathBuf::from).unwrap_or_default(), "file".to_string()));
        }
        return Ok((executable.clone(), executable.file_name().map(PathBuf::from).unwrap_or_default(), "file".to_string()));
    }
    #[allow(unreachable_code)]
    Err("Update recovery is not supported on this platform.".to_string())
}

fn copy_install_unit(source: &Path, destination: &Path, unit_kind: &str) -> Result<(), String> {
    if unit_kind == "file" {
        fs::copy(source, destination).map_err(|error| format!("Could not copy the current ARC Studio app for recovery: {error}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    let result = Command::new("/usr/bin/ditto").arg(source).arg(destination).status();
    #[cfg(target_os = "windows")]
    let result = Command::new("robocopy").arg(source).arg(destination).arg("/MIR").arg("/NFL").arg("/NDL").arg("/NJH").arg("/NJS").arg("/NP").status();
    #[cfg(target_os = "linux")]
    let result = Command::new("cp").arg("-a").arg(source).arg(destination).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let result: io::Result<std::process::ExitStatus> = Err(io::Error::new(io::ErrorKind::Unsupported, "unsupported platform"));
    let status = result.map_err(|error| format!("Could not copy the ARC Studio install for recovery: {error}"))?;
    #[cfg(target_os = "windows")]
    let succeeded = status.code().is_some_and(|code| code <= 7);
    #[cfg(not(target_os = "windows"))]
    let succeeded = status.success();
    if !succeeded { return Err(format!("Could not copy the ARC Studio install for recovery (copy tool exited with {}).", status)); }
    Ok(())
}

fn cleanup_rollback_copy(metadata: &UpdateRollbackMetadata) {
    #[cfg(target_os = "windows")]
    {
        let escaped_path = metadata.backup.to_string_lossy().replace('\'', "''");
        let script = format!("Start-Sleep -Seconds 2; Remove-Item -LiteralPath '{escaped_path}' -Recurse -Force -ErrorAction SilentlyContinue");
        let mut command = Command::new("powershell.exe");
        command.args(["-NoProfile", "-NonInteractive", "-Command", &script]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000 | 0x00000008);
        let _ = command.spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = if metadata.backup.is_dir() { fs::remove_dir_all(&metadata.backup) } else { fs::remove_file(&metadata.backup) };
    }
}

#[cfg(not(target_os = "macos"))]
fn prepare_update_rollback<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let (source, launch_relative_path, unit_kind) = update_install_unit()?;
    if !source.exists() { return Err("The installed ARC Studio app could not be found for update recovery.".to_string()); }
    let metadata_path = rollback_metadata_path(app)?;
    let update_directory = metadata_path.parent().ok_or_else(|| "Could not prepare update recovery storage.".to_string())?;
    fs::create_dir_all(update_directory).map_err(|error| format!("Could not prepare update recovery storage: {error}"))?;
    let backup = update_directory.join("rollback-previous");
    if backup.exists() {
        if backup.is_dir() { fs::remove_dir_all(&backup) } else { fs::remove_file(&backup) }
            .map_err(|error| format!("Could not clear an old update recovery copy: {error}"))?;
    }
    copy_install_unit(&source, &backup, &unit_kind)?;
    let startup_marker = update_directory.join("rollback-startup-heartbeat");
    let health_marker = update_directory.join("rollback-launched");
    let _ = fs::remove_file(&startup_marker);
    let _ = fs::remove_file(&health_marker);
    let backup_launch_path = if unit_kind == "file" { backup.clone() } else { backup.join(&launch_relative_path) };
    let metadata = UpdateRollbackMetadata { source, backup, launch_relative_path, backup_launch_path, startup_marker, health_marker, unit_kind };
    fs::write(&metadata_path, serde_json::to_vec(&metadata).map_err(|error| format!("Could not save update recovery details: {error}"))?)
        .map_err(|error| format!("Could not save update recovery details: {error}"))?;
    Ok(metadata_path)
}

#[cfg(not(target_os = "macos"))]
fn discard_update_rollback(metadata_path: &Path) {
    let Ok(bytes) = fs::read(metadata_path) else { return; };
    let Ok(metadata) = serde_json::from_slice::<UpdateRollbackMetadata>(&bytes) else { return; };
    cleanup_rollback_copy(&metadata);
    let _ = fs::remove_file(&metadata.startup_marker);
    let _ = fs::remove_file(&metadata.health_marker);
    let _ = fs::remove_file(metadata_path);
}

#[cfg(not(target_os = "macos"))]
fn arm_update_rollback(metadata_path: &Path) -> Result<(), String> {
    let metadata: UpdateRollbackMetadata = serde_json::from_slice(&fs::read(metadata_path).map_err(|error| format!("Could not read update recovery details: {error}"))?)
        .map_err(|error| format!("Update recovery details are invalid: {error}"))?;
    if !metadata.backup_launch_path.is_file() { return Err("The previous ARC Studio build is missing; update recovery could not be armed.".to_string()); }
    let mut command = Command::new(&metadata.backup_launch_path);
    command.arg("--arc-update-watchdog").arg(metadata_path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000 | 0x00000008);
    }
    if let Err(error) = command.spawn() {
        cleanup_rollback_copy(&metadata);
        let _ = fs::remove_file(metadata.startup_marker);
        let _ = fs::remove_file(metadata.health_marker);
        let _ = fs::remove_file(metadata_path);
        return Err(format!("Could not start the update recovery monitor: {error}"));
    }
    Ok(())
}

fn restore_previous_update(metadata_path: &Path, metadata: UpdateRollbackMetadata) {
    eprintln!("ARC Studio did not finish launching after an update. Restoring the previous build.");
    if metadata.source.exists() {
        let removed = if metadata.source.is_dir() { fs::remove_dir_all(&metadata.source) } else { fs::remove_file(&metadata.source) };
        if let Err(error) = removed { eprintln!("Could not remove the failed ARC Studio update: {error}"); return; }
    }
    if let Some(parent) = metadata.source.parent() {
        if fs::create_dir_all(parent).is_err() { return; }
    }
    if let Err(error) = copy_install_unit(&metadata.backup, &metadata.source, &metadata.unit_kind) {
        eprintln!("Could not restore the previous ARC Studio build: {error}");
        return;
    }
    #[cfg(target_os = "macos")]
    let launch = Command::new("/usr/bin/open").arg(&metadata.source).spawn();
    #[cfg(target_os = "windows")]
    let launch = Command::new(metadata.source.join(&metadata.launch_relative_path)).spawn();
    #[cfg(target_os = "linux")]
    let launch = Command::new(&metadata.source).spawn();
    if let Err(error) = launch { eprintln!("Previous ARC Studio build restored. Reopen it manually: {error}"); }
    cleanup_rollback_copy(&metadata);
    let _ = fs::remove_file(&metadata.startup_marker);
    let _ = fs::remove_file(&metadata.health_marker);
    let _ = fs::remove_file(metadata_path);
}

fn run_update_watchdog(metadata_path: &Path) {
    let Ok(bytes) = fs::read(metadata_path) else { return; };
    let Ok(metadata) = serde_json::from_slice::<UpdateRollbackMetadata>(&bytes) else { return; };
    let startup_deadline = Instant::now() + Duration::from_secs(45);
    let mut healthy_ui_deadline = None;
    loop {
        if metadata.health_marker.exists() {
            thread::sleep(Duration::from_secs(300));
            cleanup_rollback_copy(&metadata);
            let _ = fs::remove_file(&metadata.startup_marker);
            let _ = fs::remove_file(&metadata.health_marker);
            let _ = fs::remove_file(metadata_path);
            return;
        }
        if let Ok(heartbeat) = fs::read_to_string(&metadata.startup_marker) {
            let ui_deadline = *healthy_ui_deadline.get_or_insert_with(|| Instant::now() + Duration::from_secs(90));
            let heartbeat_at = heartbeat.trim().parse::<u128>().unwrap_or(0);
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_millis()).unwrap_or(0);
            if heartbeat_at == 0 || now.saturating_sub(heartbeat_at) > 4_000 || Instant::now() >= ui_deadline {
                restore_previous_update(metadata_path, metadata);
                return;
            }
        } else if Instant::now() >= startup_deadline {
            restore_previous_update(metadata_path, metadata);
            return;
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn mark_update_starting<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Ok(metadata_path) = rollback_metadata_path(app) else { return; };
    let Ok(bytes) = fs::read(&metadata_path) else { return; };
    let Ok(metadata) = serde_json::from_slice::<UpdateRollbackMetadata>(&bytes) else { return; };
    let heartbeat_path = metadata.startup_marker;
    let health_path = metadata.health_marker;
    let heartbeat = || std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_millis()).unwrap_or(0).to_string();
    let _ = fs::write(&heartbeat_path, heartbeat());
    thread::spawn(move || {
        while !health_path.exists() {
            if fs::write(&heartbeat_path, heartbeat()).is_err() { break; }
            thread::sleep(Duration::from_secs(1));
        }
    });
}

#[tauri::command]
fn mark_update_healthy(app: tauri::AppHandle) -> Result<(), String> {
    let metadata_path = rollback_metadata_path(&app)?;
    if !metadata_path.is_file() { return Ok(()); }
    let metadata: UpdateRollbackMetadata = serde_json::from_slice(&fs::read(&metadata_path).map_err(|error| format!("Could not read update recovery details: {error}"))?)
        .map_err(|error| format!("Update recovery details are invalid: {error}"))?;
    fs::write(metadata.health_marker, b"launched").map_err(|error| format!("Could not confirm ARC Studio launched: {error}"))
}

fn staged_update_paths<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(PathBuf, PathBuf), String> {
    let directory = app.path().app_config_dir().map_err(|error| format!("Could not access ARC Studio settings: {error}"))?.join("updates");
    Ok((directory.join("pending-update.json"), directory.join("pending-update.bin")))
}

#[tauri::command]
async fn check_channel_update(webview: Webview, channel: String) -> Result<Option<ChannelUpdateMetadata>, String> {
    let endpoint = updater_endpoint(&channel)?;
    let updater = webview.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| format!("Could not configure update check: {error}"))?
        .build()
        .map_err(|error| format!("Could not start update check: {error}"))?;
    let Some(update) = updater.check().await.map_err(|error| format!("Update check failed: {error}"))? else { return Ok(None); };
    let metadata = ChannelUpdateMetadata {
        rid: webview.resources_table().add(update.clone()),
        current_version: arc_version_label(&update.current_version.to_string()),
        version: arc_version_label(&update.version.to_string()),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
    };
    Ok(Some(metadata))
}

#[tauri::command]
async fn install_channel_update<R: tauri::Runtime>(app: tauri::AppHandle<R>, webview: Webview<R>, rid: tauri::ResourceId, channel: String) -> Result<(), String> {
    let _ = updater_endpoint(&channel)?;
    let update = webview.resources_table().get::<tauri_plugin_updater::Update>(rid)
        .map_err(|error| format!("The selected update is no longer available: {error}"))?;
    let mut downloaded_bytes = 0_u64;
    let mut last_progress_at = Instant::now();
    let mut last_percent = None;
    let app_handle = app.clone();
    let bytes = update.download(|chunk_length, total_bytes| {
        downloaded_bytes = downloaded_bytes.saturating_add(chunk_length as u64);
        let percent = total_bytes.filter(|total| *total > 0).map(|total| ((downloaded_bytes.saturating_mul(100) / total).min(99)) as u8);
        let should_emit = percent != last_percent || last_progress_at.elapsed() >= Duration::from_millis(120);
        if should_emit {
            let _ = app_handle.emit("arc-studio-update-download-progress", UpdateDownloadProgress { downloaded_bytes, total_bytes, percent });
            last_progress_at = Instant::now();
            last_percent = percent;
        }
    }, || {}).await.map_err(|error| format!("Could not download the ARC Studio update: {error}"))?;
    stage_update_package(&app, &channel, &update.version, &update.raw_json, &bytes)?;
    Ok(())
}

fn stage_update_package<R: tauri::Runtime>(app: &tauri::AppHandle<R>, channel: &str, version: &str, raw_json: &serde_json::Value, bytes: &[u8]) -> Result<(), String> {
    let (metadata_path, package_path) = staged_update_paths(app)?;
    let directory = metadata_path.parent().ok_or_else(|| "Could not prepare update storage.".to_string())?;
    fs::create_dir_all(directory).map_err(|error| format!("Could not prepare update storage: {error}"))?;
    let metadata = StagedUpdateMetadata { channel: channel.to_string(), version: version.to_string(), raw_json: raw_json.clone() };
    let metadata_temp = metadata_path.with_extension("json.tmp");
    let package_temp = package_path.with_extension("bin.tmp");
    fs::write(&package_temp, bytes).map_err(|error| format!("Could not save the downloaded update: {error}"))?;
    fs::write(&metadata_temp, serde_json::to_vec(&metadata).map_err(|error| format!("Could not save update details: {error}"))?)
        .map_err(|error| format!("Could not save update details: {error}"))?;
    fs::rename(&package_temp, &package_path).map_err(|error| format!("Could not stage the update package: {error}"))?;
    fs::rename(&metadata_temp, &metadata_path).map_err(|error| format!("Could not stage update details: {error}"))?;
    Ok(())
}

#[tauri::command]
fn install_staged_update<R: tauri::Runtime>(app: tauri::AppHandle<R>, channel: String) -> Result<bool, String> {
    let (metadata_path, package_path) = staged_update_paths(&app)?;
    if !metadata_path.is_file() || !package_path.is_file() { return Ok(false); }
    let metadata: StagedUpdateMetadata = serde_json::from_slice(&fs::read(&metadata_path).map_err(|error| format!("Could not read staged update details: {error}"))?)
        .map_err(|error| format!("Staged update details are invalid: {error}"))?;
    if metadata.channel != channel {
        let _ = fs::remove_file(metadata_path);
        let _ = fs::remove_file(package_path);
        return Ok(false);
    }
    let endpoint = updater_endpoint(&channel)?;
    let updater = app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| format!("Could not configure update installation: {error}"))?
        .build()
        .map_err(|error| format!("Could not prepare update installation: {error}"))?;
    let Some(update) = updater.restore_update(metadata.raw_json).map_err(|error| format!("Could not verify staged update: {error}"))? else {
        let _ = fs::remove_file(metadata_path);
        let _ = fs::remove_file(package_path);
        return Ok(false);
    };
    if update.version != metadata.version {
        let _ = fs::remove_file(metadata_path);
        let _ = fs::remove_file(package_path);
        return Ok(false);
    }
    let bytes = fs::read(&package_path).map_err(|error| format!("Could not read staged update package: {error}"))?;
    update.verify(&bytes).map_err(|error| format!("The ARC Studio update signature could not be verified: {error}"))?;
    #[cfg(not(target_os = "macos"))]
    let rollback_path = {
        prepare_update_rollback(&app)?
    };
    if let Err(error) = update.install(&bytes) {
        #[cfg(not(target_os = "macos"))]
        discard_update_rollback(&rollback_path);
        let message = error.to_string();
        #[cfg(target_os = "macos")]
        if matches!(&error, tauri_plugin_updater::Error::Io(io_error) if io_error.kind() == io::ErrorKind::PermissionDenied) {
            return Err(format!("ARC_UPDATE_LOCATION_PERMISSION_REQUIRED:{message}"));
        }
        return Err(format!("Could not install ARC Studio update: {message}"));
    }
    #[cfg(not(target_os = "macos"))]
    if let Err(error) = arm_update_rollback(&rollback_path) {
        eprintln!("Could not start the update recovery monitor: {error}");
    }
    let _ = fs::remove_file(metadata_path);
    let _ = fs::remove_file(package_path);
    app.restart();
}

#[tauri::command]
fn get_staged_update_status<R: tauri::Runtime>(app: tauri::AppHandle<R>, channel: String) -> Result<Option<StagedUpdateStatus>, String> {
    let _ = updater_endpoint(&channel)?;
    let (metadata_path, package_path) = staged_update_paths(&app)?;
    if !metadata_path.is_file() || !package_path.is_file() { return Ok(None); }
    let metadata: StagedUpdateMetadata = serde_json::from_slice(&fs::read(&metadata_path).map_err(|error| format!("Could not read staged update details: {error}"))?)
        .map_err(|error| format!("Staged update details are invalid: {error}"))?;
    if metadata.channel != channel { return Ok(None); }
    Ok(Some(StagedUpdateStatus { version: arc_version_label(&metadata.version), staged: true }))
}

#[tauri::command]
fn read_arc_project_file(path: String) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(path);
    if !is_arc_project_path(&path) {
        return Err("Choose an .arcproject file.".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not read the project file: {error}"))?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 * 1024 {
        return Err("The project file is too large to open.".to_string());
    }
    fs::read(path).map_err(|error| format!("Could not read the project file: {error}"))
}

fn is_arc_graph_path(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()).is_some_and(|name| {
        let name = name.to_ascii_lowercase();
        name.ends_with(".arcgraph")
    })
}

#[tauri::command]
fn read_arc_graph_file(path: String) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(path);
    if !is_arc_graph_path(&path) {
        return Err("Choose an .arcgraph file.".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not read the graph file: {error}"))?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 * 1024 {
        return Err("The graph file is too large to open.".to_string());
    }
    fs::read(path).map_err(|error| format!("Could not read the graph file: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectExportReceipt {
    path: String,
    revealed: bool,
}

struct GraphExportUpload {
    temporary_path: PathBuf,
    directory: PathBuf,
    filename: String,
    file: fs::File,
}

static GRAPH_EXPORT_UPLOADS: OnceLock<Mutex<HashMap<String, GraphExportUpload>>> = OnceLock::new();

fn graph_export_uploads() -> &'static Mutex<HashMap<String, GraphExportUpload>> {
    GRAPH_EXPORT_UPLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn safe_graph_export_filename(filename: &str) -> Result<String, String> {
    let safe_name = filename
        .chars()
        .filter(|character| !character.is_control() && !matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim_matches(|character| character == ' ' || character == '.')
        .to_string();
    let stem = if safe_name.to_ascii_lowercase().ends_with(".arcgraph") {
        &safe_name[..safe_name.len() - ".arcgraph".len()]
    } else {
        &safe_name
    };
    if stem.trim().is_empty() || stem == "." || stem == ".." {
        return Err("Choose a valid graph name before exporting.".to_string());
    }
    Ok(format!("{stem}.arcgraph"))
}

#[tauri::command]
fn begin_graph_export<R: tauri::Runtime>(app: tauri::AppHandle<R>, filename: String) -> Result<String, String> {
    let filename = safe_graph_export_filename(&filename)?;
    let directory = app.path().download_dir()
        .map_err(|error| format!("Could not locate your Downloads folder: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("Could not access your Downloads folder: {error}"))?;
    let export_id = uuid::Uuid::new_v4().to_string();
    let temporary_path = directory.join(format!(".arc-graph-export-{export_id}.partial"));
    let file = OpenOptions::new().write(true).create_new(true).open(&temporary_path)
        .map_err(|error| format!("Could not prepare the graph export: {error}"))?;
    #[cfg(unix)]
    if let Err(error) = file.set_permissions(fs::Permissions::from_mode(0o600)) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Could not secure the graph export: {error}"));
    }
    let upload = GraphExportUpload { temporary_path: temporary_path.clone(), directory, filename, file };
    match graph_export_uploads().lock() {
        Ok(mut uploads) => { uploads.insert(export_id.clone(), upload); }
        Err(_) => {
            let _ = fs::remove_file(temporary_path);
            return Err("Could not prepare the graph export.".to_string());
        }
    }
    Ok(export_id)
}

#[tauri::command]
fn write_graph_export_chunk(export_id: String, contents: Vec<u8>) -> Result<(), String> {
    if uuid::Uuid::parse_str(&export_id).is_err() || contents.len() > 1024 * 1024 {
        return Err("The graph export chunk is invalid.".to_string());
    }
    let mut uploads = graph_export_uploads().lock().map_err(|_| "Could not continue the graph export.".to_string())?;
    let upload = uploads.get_mut(&export_id).ok_or_else(|| "The graph export is no longer active.".to_string())?;
    if let Err(error) = upload.file.write_all(&contents) {
        let temporary_path = upload.temporary_path.clone();
        uploads.remove(&export_id);
        let _ = fs::remove_file(temporary_path);
        return Err(format!("Could not write the graph export: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn cancel_graph_export(export_id: String) -> Result<(), String> {
    if uuid::Uuid::parse_str(&export_id).is_err() { return Ok(()); }
    let upload = graph_export_uploads().lock()
        .map_err(|_| "Could not cancel the graph export.".to_string())?
        .remove(&export_id);
    if let Some(upload) = upload { fs::remove_file(upload.temporary_path).map_err(|error| format!("Could not remove the partial graph export: {error}"))?; }
    Ok(())
}

#[tauri::command]
fn finish_graph_export(export_id: String) -> Result<ProjectExportReceipt, String> {
    if uuid::Uuid::parse_str(&export_id).is_err() { return Err("The graph export is invalid.".to_string()); }
    let upload = graph_export_uploads().lock()
        .map_err(|_| "Could not finish the graph export.".to_string())?
        .remove(&export_id)
        .ok_or_else(|| "The graph export is no longer active.".to_string())?;
    if let Err(error) = upload.file.sync_all() {
        drop(upload.file);
        let _ = fs::remove_file(&upload.temporary_path);
        return Err(format!("Could not finish writing the graph export: {error}"));
    }
    drop(upload.file);

    let stem = upload.filename.strip_suffix(".arcgraph").unwrap_or(&upload.filename);
    let path_result = (|| -> Result<PathBuf, String> {
        let mut suffix = 0u32;
        loop {
            let name = if suffix == 0 { upload.filename.clone() } else { format!("{stem} ({suffix}).arcgraph") };
            let path = upload.directory.join(name);
            match fs::hard_link(&upload.temporary_path, &path) {
                Ok(()) => {
                    if let Err(error) = fs::remove_file(&upload.temporary_path) {
                        eprintln!("Graph export saved at {}, but its temporary file could not be removed: {error}", path.display());
                    }
                    return Ok(path);
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
                Err(_) => match OpenOptions::new().write(true).create_new(true).open(&path) {
                    Ok(mut destination) => {
                        #[cfg(unix)]
                        if let Err(error) = destination.set_permissions(fs::Permissions::from_mode(0o600)) {
                            let _ = fs::remove_file(&path);
                            return Err(format!("Could not secure the graph export: {error}"));
                        }
                        let mut source = match fs::File::open(&upload.temporary_path) {
                            Ok(source) => source,
                            Err(error) => {
                                let _ = fs::remove_file(&path);
                                return Err(format!("Could not open the completed graph export: {error}"));
                            }
                        };
                        if let Err(error) = io::copy(&mut source, &mut destination).and_then(|_| destination.sync_all()) {
                            let _ = fs::remove_file(&path);
                            return Err(format!("Could not save the graph export: {error}"));
                        }
                        if let Err(error) = fs::remove_file(&upload.temporary_path) {
                            eprintln!("Graph export saved at {}, but its temporary file could not be removed: {error}", path.display());
                        }
                        return Ok(path);
                    }
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
                    Err(error) => return Err(format!("Could not save the graph export: {error}")),
                },
            }
        }
    })();
    let path = match path_result {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_file(&upload.temporary_path);
            return Err(error);
        }
    };

    #[cfg(target_os = "macos")]
    let reveal = Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let reveal = Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let reveal = Command::new("xdg-open").arg(&upload.directory).spawn();
    let revealed = reveal.is_ok();
    if let Err(error) = reveal { eprintln!("Graph export saved at {}, but its folder could not be opened: {error}", path.display()); }
    Ok(ProjectExportReceipt { path: path.to_string_lossy().into_owned(), revealed })
}

#[tauri::command]
fn save_project_export<R: tauri::Runtime>(app: tauri::AppHandle<R>, filename: String, contents: Vec<u8>) -> Result<ProjectExportReceipt, String> {
    let safe_name = filename
        .chars()
        .filter(|character| !character.is_control() && !matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim_matches(|character| character == ' ' || character == '.')
        .to_string();
    let stem = safe_name.strip_suffix(".arcproject").unwrap_or(&safe_name);
    if stem.trim().is_empty() || stem == "." || stem == ".." {
        return Err("Choose a valid project name before exporting.".to_string());
    }

    let directory = app.path().download_dir()
        .map_err(|error| format!("Could not locate your Downloads folder: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("Could not access your Downloads folder: {error}"))?;
    let mut suffix = 0u32;
    let path = loop {
        let name = if suffix == 0 { format!("{stem}.arcproject") } else { format!("{stem} ({suffix}).arcproject") };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                #[cfg(unix)]
                file.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|error| format!("Could not secure the project export: {error}"))?;
                file.write_all(&contents).map_err(|error| {
                    let _ = fs::remove_file(&path);
                    format!("Could not write the project export: {error}")
                })?;
                break path;
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
            Err(error) => return Err(format!("Could not save the project export: {error}")),
        }
    };

    #[cfg(target_os = "macos")]
    let reveal = Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let reveal = Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let reveal = Command::new("xdg-open").arg(&directory).spawn();
    let revealed = reveal.is_ok();
    if let Err(error) = reveal {
        eprintln!("Project export saved at {}, but its folder could not be opened: {error}", path.display());
    }
    Ok(ProjectExportReceipt { path: path.to_string_lossy().into_owned(), revealed })
}

#[tauri::command]
async fn download_project_export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    endpoint: String,
    token: String,
    filename: String,
    password: String,
    include_secrets: bool,
) -> Result<ProjectExportReceipt, String> {
    let endpoint = url::Url::parse(&endpoint).map_err(|_| "Could not locate the project export endpoint.".to_string())?;
    let host = endpoint.host_str().unwrap_or_default();
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if (endpoint.scheme() != "https" && !(endpoint.scheme() == "http" && loopback))
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || !endpoint.path().contains("/api/projects/")
        || !endpoint.path().ends_with("/export/archive")
        || token.is_empty()
        || token.len() > 4096
        || token.chars().any(char::is_control)
    {
        return Err("The project export request is invalid.".to_string());
    }

    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not prepare the project download: {error}"))?;
    let mut response = client
        .post(endpoint)
        .header("x-arc-token", token)
        .json(&serde_json::json!({ "password": password, "includeSecrets": include_secrets }))
        .send()
        .await
        .map_err(|error| format!("Could not start the project download: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let mut error_bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Project export failed with HTTP {status}: {error}"))?
        {
            if error_bytes.len() + chunk.len() > 64 * 1024 {
                break;
            }
            error_bytes.extend_from_slice(&chunk);
        }
        let message = serde_json::from_slice::<serde_json::Value>(&error_bytes)
            .ok()
            .and_then(|value| value.get("error").and_then(serde_json::Value::as_str).map(str::to_owned))
            .unwrap_or_else(|| format!("Project export failed with HTTP {status}."));
        return Err(message);
    }

    let safe_name = filename
        .chars()
        .filter(|character| !character.is_control() && !matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim_matches(|character| character == ' ' || character == '.')
        .to_string();
    let stem = safe_name.strip_suffix(".arcproject").unwrap_or(&safe_name);
    if stem.trim().is_empty() || stem == "." || stem == ".." {
        return Err("Choose a valid project name before exporting.".to_string());
    }

    let directory = app.path().download_dir()
        .map_err(|error| format!("Could not locate your Downloads folder: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("Could not access your Downloads folder: {error}"))?;
    let mut suffix = 0u32;
    let (path, mut file) = loop {
        let name = if suffix == 0 { format!("{stem}.arcproject") } else { format!("{stem} ({suffix}).arcproject") };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => break (path, file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
            Err(error) => return Err(format!("Could not save the project export: {error}")),
        }
    };
    #[cfg(unix)]
    if let Err(error) = file.set_permissions(fs::Permissions::from_mode(0o600)) {
        let _ = fs::remove_file(&path);
        return Err(format!("Could not secure the project export: {error}"));
    }

    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                let _ = fs::remove_file(&path);
                return Err(format!("The project download stopped early: {error}"));
            }
        };
        if let Err(error) = file.write_all(&chunk) {
            let _ = fs::remove_file(&path);
            return Err(format!("Could not write the project export: {error}"));
        }
    }
    if let Err(error) = file.sync_all() {
        let _ = fs::remove_file(&path);
        return Err(format!("Could not finish writing the project export: {error}"));
    }
    drop(file);

    #[cfg(target_os = "macos")]
    let reveal = Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let reveal = Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let reveal = Command::new("xdg-open").arg(&directory).spawn();
    let revealed = reveal.is_ok();
    if let Err(error) = reveal {
        eprintln!("ARC Studio project export saved at {}, but its folder could not be opened: {error}", path.display());
    }
    Ok(ProjectExportReceipt { path: path.to_string_lossy().into_owned(), revealed })
}

#[tauri::command]
async fn download_bot_export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    endpoint: String,
    token: String,
    project_id: String,
    export_id: String,
    include_crypto_secret: bool,
    include_bot_token: bool,
) -> Result<ProjectExportReceipt, String> {
    let endpoint = url::Url::parse(&endpoint).map_err(|_| "Could not locate the bot export endpoint.".to_string())?;
    let host = endpoint.host_str().unwrap_or_default();
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if (endpoint.scheme() != "https" && !(endpoint.scheme() == "http" && loopback))
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || !endpoint.path().ends_with("/api/graphs/export/bot.zip")
        || token.is_empty()
        || token.len() > 4096
        || token.chars().any(char::is_control)
        || project_id.len() > 100
        || project_id.chars().any(char::is_control)
        || export_id.len() > 100
        || export_id.chars().any(char::is_control)
    {
        return Err("The bot export request is invalid.".to_string());
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not prepare the bot download: {error}"))?;
    let request = serde_json::json!({
        "projectId": project_id,
        "exportId": export_id,
        "includeCryptoSecret": include_crypto_secret,
        "includeBotToken": include_bot_token
    });
    let mut response = client.post(endpoint)
        .header("x-arc-token", token)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("Could not start the bot download: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let mut error_bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|error| format!("Bot export failed with HTTP {status}: {error}"))? {
            if error_bytes.len().saturating_add(chunk.len()) > 64 * 1024 { break; }
            error_bytes.extend_from_slice(&chunk);
        }
        return Err(serde_json::from_slice::<serde_json::Value>(&error_bytes)
            .ok()
            .and_then(|value| value.get("error").and_then(serde_json::Value::as_str).map(str::to_owned))
            .unwrap_or_else(|| format!("Bot export failed with HTTP {status}.")));
    }
    let directory = app.path().download_dir().map_err(|error| format!("Could not locate your Downloads folder: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("Could not access your Downloads folder: {error}"))?;
    let mut suffix = 0u32;
    let (path, mut file) = loop {
        let name = if suffix == 0 { "arc-bot-export.zip".to_string() } else { format!("arc-bot-export ({suffix}).zip") };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => break (path, file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
            Err(error) => return Err(format!("Could not save the bot export: {error}")),
        }
    };
    #[cfg(unix)]
    if let Err(error) = file.set_permissions(fs::Permissions::from_mode(0o600)) {
        let _ = fs::remove_file(&path);
        return Err(format!("Could not secure the bot export: {error}"));
    }
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                let _ = fs::remove_file(&path);
                return Err(format!("The bot download stopped early: {error}"));
            }
        };
        if let Err(error) = file.write_all(&chunk) {
            let _ = fs::remove_file(&path);
            return Err(format!("Could not write the bot export: {error}"));
        }
    }
    if let Err(error) = file.sync_all() {
        let _ = fs::remove_file(&path);
        return Err(format!("Could not finish writing the bot export: {error}"));
    }
    drop(file);
    #[cfg(target_os = "macos")]
    let reveal = Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let reveal = Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let reveal = Command::new("xdg-open").arg(&directory).spawn();
    let revealed = reveal.is_ok();
    if let Err(error) = reveal { eprintln!("ARC Studio bot export saved at {}, but its folder could not be opened: {error}", path.display()); }
    Ok(ProjectExportReceipt { path: path.to_string_lossy().into_owned(), revealed })
}

struct ProjectImportUploadControl {
    cancelled: AtomicBool,
    notify: Notify,
}

static PROJECT_IMPORT_UPLOADS: OnceLock<Mutex<HashMap<String, Arc<ProjectImportUploadControl>>>> = OnceLock::new();

fn project_import_uploads() -> &'static Mutex<HashMap<String, Arc<ProjectImportUploadControl>>> {
    PROJECT_IMPORT_UPLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
async fn upload_project_import_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    endpoint: String,
    token: String,
    path: String,
    upload_id: String,
    session_id: String,
) -> Result<serde_json::Value, String> {
    if !upload_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        || upload_id.len() < 8
        || !session_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        || session_id.len() < 8
        || token.is_empty()
        || token.len() > 4096
        || token.chars().any(char::is_control)
    {
        return Err("The project import request is invalid.".to_string());
    }
    let endpoint = url::Url::parse(&endpoint).map_err(|_| "Could not locate the project import endpoint.".to_string())?;
    let host = endpoint.host_str().unwrap_or_default();
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if (endpoint.scheme() != "https" && !(endpoint.scheme() == "http" && loopback))
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || !endpoint.path().ends_with("/api/projects/import")
    {
        return Err("The project import endpoint is invalid.".to_string());
    }
    let source = PathBuf::from(path);
    let metadata = fs::metadata(&source).map_err(|error| format!("Could not read the project file: {error}"))?;
    if !metadata.is_file() {
        return Err("Choose a regular project file to import.".to_string());
    }
    let total = metadata.len();
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("Could not prepare the project upload: {error}"))?;
    let control = {
        let mut uploads = project_import_uploads().lock().map_err(|_| "Could not prepare the project upload.".to_string())?;
        uploads.entry(upload_id.clone()).or_insert_with(|| Arc::new(ProjectImportUploadControl {
            cancelled: AtomicBool::new(false),
            notify: Notify::new(),
        })).clone()
    };
    if control.cancelled.load(Ordering::Acquire) {
        if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
        return Err("The project upload was cancelled.".to_string());
    }
    let file = match tokio::fs::File::open(&source).await {
        Ok(file) => file,
        Err(error) => {
            if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
            return Err(format!("Could not open the project file: {error}"));
        }
    };
    if control.cancelled.load(Ordering::Acquire) {
        if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
        return Err("The project upload was cancelled.".to_string());
    }

    let upload_app = app.clone();
    let progress_id = upload_id.clone();
    let progress_control = control.clone();
    let stream = futures_util::stream::try_unfold((file, 0u64, 0u64), move |(mut file, mut loaded, mut last_reported)| {
        let app = upload_app.clone();
        let upload_id = progress_id.clone();
        let control = progress_control.clone();
        async move {
            if control.cancelled.load(Ordering::Acquire) {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "Project upload cancelled."));
            }
            let mut buffer = vec![0; 1024 * 1024];
            let count = file.read(&mut buffer).await?;
            if count == 0 { return Ok(None); }
            buffer.truncate(count);
            loaded = loaded.saturating_add(count as u64);
            if loaded.saturating_sub(last_reported) >= 64 * 1024 * 1024 || loaded >= total {
                last_reported = loaded;
                let _ = app.emit("arc-project-import-upload", serde_json::json!({ "uploadId": upload_id, "loaded": loaded, "total": total }));
            }
            Ok(Some((bytes::Bytes::from(buffer), (file, loaded, last_reported))))
        }
    });

    let request = client.post(endpoint)
        .header("x-arc-token", token)
        .header("x-arc-import-session-create", session_id)
        .header("content-type", "application/vnd.arc-studio.project+zip")
        .header("content-length", total.to_string())
        .body(reqwest::Body::wrap_stream(stream));
    let send_future = Box::pin(request.send());
    let cancel_future = Box::pin(control.notify.notified());
    let response_result = match futures_util::future::select(send_future, cancel_future).await {
        futures_util::future::Either::Left((response, _)) => response.map_err(|error| format!("Could not upload the project file: {error}")),
        futures_util::future::Either::Right((_, _)) => Err("The project upload was cancelled.".to_string()),
    };
    let mut response = match response_result {
        Ok(response) => response,
        Err(error) => {
            if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
            return Err(error);
        }
    };
    let status = response.status().as_u16();
    let mut response_bytes = Vec::new();
    loop {
        if control.cancelled.load(Ordering::Acquire) {
            if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
            return Err("The project upload was cancelled.".to_string());
        }
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
                return Err(format!("Could not read the project upload response: {error}"));
            }
        };
        if response_bytes.len().saturating_add(chunk.len()) > 64 * 1024 {
            if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
            return Err("The server returned an oversized project upload response.".to_string());
        }
        response_bytes.extend_from_slice(&chunk);
    }
    if let Ok(mut uploads) = project_import_uploads().lock() { uploads.remove(&upload_id); }
    let data = serde_json::from_slice(&response_bytes).unwrap_or_else(|_| serde_json::json!({}));
    Ok(serde_json::json!({ "status": status, "data": data }))
}

#[tauri::command]
fn cancel_project_import_upload(upload_id: String) -> Result<(), String> {
    if upload_id.len() < 8 || !upload_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')) {
        return Err("The project upload ID is invalid.".to_string());
    }
    let mut uploads = project_import_uploads().lock().map_err(|_| "Could not cancel the project upload.".to_string())?;
    let control = uploads.entry(upload_id).or_insert_with(|| Arc::new(ProjectImportUploadControl {
        cancelled: AtomicBool::new(false),
        notify: Notify::new(),
    })).clone();
    control.cancelled.store(true, Ordering::Release);
    control.notify.notify_one();
    Ok(())
}

#[tauri::command]
fn open_project_window<R: tauri::Runtime>(app: AppHandle<R>, project_id: String, api_base_url: String) -> Result<(), String> {
    let valid_id = project_id.strip_prefix("project_").is_some_and(|uuid| {
        uuid.len() == 36 && uuid.chars().enumerate().all(|(index, character)| {
            if [8, 13, 18, 23].contains(&index) { character == '-' }
            else { character.is_ascii_hexdigit() }
        })
    });
    if !valid_id { return Err("That project ID is not valid.".to_string()); }
    let api_url = url::Url::parse(&api_base_url).map_err(|_| "Could not locate the Local Workspace service.".to_string())?;
    let loopback = matches!(api_url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if !loopback || api_url.scheme() != "http" || !api_url.username().is_empty() || api_url.password().is_some()
        || !matches!(api_url.path(), "" | "/") || api_url.query().is_some() || api_url.fragment().is_some()
    {
        return Err("Project windows are available only in the Local Workspace.".to_string());
    }
    let label = format!("project{}", project_id.strip_prefix("project_").unwrap_or_default().replace('-', ""));
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    let mut window_config = app.config().app.windows.first().cloned()
        .ok_or_else(|| "ARC Studio window configuration is missing.".to_string())?;
    window_config.label = label;
    window_config.create = false;
    let platform = if cfg!(target_os = "macos") { "macos" } else if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "linux") { "linux" } else { "other" };
    let desktop_target = option_env!("ARC_DESKTOP_TARGET")
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS));
    let init_script = format!(
        "window.__ARC_STUDIO_CONFIG__ = Object.freeze({{ desktop: true, platform: {}, target: {}, releaseChannel: {}, localUsername: {}, apiBaseUrl: {}, startupError: null, startupProjectId: {} }}); window.__ARC_STUDIO_OPEN_FILES__ = []; window.__ARC_STUDIO_MENU_ACTION__ = null;",
        js_string_literal(platform),
        js_string_literal(&desktop_target),
        js_string_literal(build_release_channel()),
        js_string_literal(&os_login_name()),
        js_string_literal(api_url.origin().ascii_serialization().as_str()),
        js_string_literal(&project_id)
    );
    let window = WebviewWindowBuilder::from_config(&app, &window_config)
        .map_err(|error| format!("Could not prepare the project window: {error}"))?
        .initialization_script(init_script)
        .background_color(tauri::webview::Color(20, 23, 27, 255))
        .build()
        .map_err(|error| format!("Could not open the project in a new window: {error}"))?;
    let window_app = app.clone();
    let window_label = window.label().to_string();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            close_desktop_prompt_sessions(&window_app, Some(&window_label));
        }
    });
    let _ = window.set_focus();
    Ok(())
}

struct DesktopPromptSession {
    request_id: String,
    parent_label: String,
    payload: serde_json::Value,
    blocking: bool,
    dismiss_on_parent_focus: bool,
    blocked_window_labels: Vec<String>,
}

#[derive(Default)]
struct DesktopPromptManager {
    sessions: Mutex<HashMap<String, DesktopPromptSession>>,
}

const DESKTOP_PROMPT_GUARD_SCRIPT: &str = r#"(() => {
  if (window.__ARC_STUDIO_PROMPT_GUARD__) return;
  const guard = document.createElement('div');
  guard.id = 'arc-studio-native-prompt-guard';
  guard.setAttribute('aria-hidden', 'true');
  Object.assign(guard.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: 'rgba(0, 0, 0, .18)', pointerEvents: 'auto', cursor: 'default' });
  const blockInput = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const blockedEvents = ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'dragstart'];
  window.__ARC_STUDIO_PROMPT_BLOCKED__ = true;
  window.__ARC_STUDIO_PROMPT_GUARD__ = { guard, blockInput, blockedEvents };
  document.activeElement?.blur?.();
  for (const eventName of blockedEvents) document.addEventListener(eventName, blockInput, { capture: true, passive: false });
  document.documentElement.appendChild(guard);
})()"#;

const DESKTOP_PROMPT_UNGUARD_SCRIPT: &str = r#"(() => {
  const current = window.__ARC_STUDIO_PROMPT_GUARD__;
  if (!current) return;
  for (const eventName of current.blockedEvents || []) document.removeEventListener(eventName, current.blockInput, true);
  current.guard?.remove();
  delete window.__ARC_STUDIO_PROMPT_GUARD__;
  delete window.__ARC_STUDIO_PROMPT_BLOCKED__;
})()"#;

fn restore_prompt_windows<R: tauri::Runtime>(app: &AppHandle<R>, labels: &[String]) {
    for label in labels {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.eval(DESKTOP_PROMPT_UNGUARD_SCRIPT);
        }
    }
}

fn clear_desktop_prompt<R: tauri::Runtime>(app: &AppHandle<R>, label: &str, response: serde_json::Value, close_window: bool) {
    let session = app.state::<DesktopPromptManager>().sessions.lock().ok().and_then(|mut sessions| sessions.remove(label));
    let Some(session) = session else { return; };
    let _ = app.emit_to(&session.parent_label, "arc:desktop-prompt-response", serde_json::json!({
        "requestId": session.request_id,
        "response": response,
    }));
    if close_window {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.hide();
            let _ = window.close();
        }
    }
    restore_prompt_windows(app, &session.blocked_window_labels);
    if session.blocking {
        if let Some(parent) = app.get_webview_window(&session.parent_label) {
            let _ = parent.set_focus();
        }
    }
}

fn close_desktop_prompt_sessions<R: tauri::Runtime>(app: &AppHandle<R>, parent_label: Option<&str>) {
    let labels = app.state::<DesktopPromptManager>().sessions.lock().ok().map(|sessions| {
        sessions.iter()
            .filter(|(_, session)| parent_label.map_or(true, |parent| session.parent_label == parent))
            .map(|(label, _)| label.clone())
            .collect::<Vec<_>>()
    }).unwrap_or_default();
    for label in labels {
        let session = app.state::<DesktopPromptManager>().sessions.lock().ok().and_then(|mut sessions| sessions.remove(&label));
        let Some(session) = session else { continue; };
        let _ = app.emit_to(&session.parent_label, "arc:desktop-prompt-response", serde_json::json!({
            "requestId": session.request_id,
            "response": serde_json::Value::Null,
        }));
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.hide();
            let _ = window.close();
        }
        restore_prompt_windows(app, &session.blocked_window_labels);
    }
}

fn discard_desktop_prompt<R: tauri::Runtime>(app: &AppHandle<R>, label: &str) {
    let session = app.state::<DesktopPromptManager>().sessions.lock().ok().and_then(|mut sessions| sessions.remove(label));
    if let Some(session) = session {
        restore_prompt_windows(app, &session.blocked_window_labels);
    }
}

fn dismiss_desktop_prompt_when_parent_focused<R: tauri::Runtime>(app: AppHandle<R>, prompt_label: String, parent_label: String) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(80));
        let main_thread_app = app.clone();
        let _ = app.run_on_main_thread(move || {
            let parent_focused = main_thread_app.get_webview_window(&parent_label)
                .and_then(|parent| parent.is_focused().ok())
                .unwrap_or(false);
            if !parent_focused { return; }
            let dismissible = main_thread_app.state::<DesktopPromptManager>().sessions.lock().ok()
                .and_then(|sessions| sessions.get(&prompt_label).map(|session| {
                    session.dismiss_on_parent_focus && session.parent_label == parent_label
                }))
                .unwrap_or(false);
            if dismissible {
                clear_desktop_prompt(&main_thread_app, &prompt_label, serde_json::Value::Null, true);
            }
        });
    });
}

#[tauri::command]
fn open_desktop_prompt(
    app: AppHandle,
    parent: WebviewWindow,
    state: State<'_, DesktopPromptManager>,
    request_id: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    let request_uuid = uuid::Uuid::parse_str(&request_id).map_err(|_| "That prompt request is not valid.".to_string())?;
    let request_id = request_uuid.to_string();
    let kind = payload.get("kind").and_then(serde_json::Value::as_str).unwrap_or_default();
    if !["text", "text-confirm", "project-export", "bot-export", "editor-settings", "app-settings", "shortcuts-help", "template-syntax-help", "template-inputs-help", "create-project", "deployment-review", "command-browser", "plugin-action", "canvas-section", "graph-name", "graph-close", "graph-validation", "team-access"].contains(&kind) {
        return Err("That prompt type is not supported.".to_string());
    }
    if serde_json::to_vec(&payload).map_err(|_| "The prompt could not be prepared.".to_string())?.len() > 512 * 1024 {
        return Err("The prompt contains too much data to display.".to_string());
    }

    let blocking = payload.get("blocking").and_then(serde_json::Value::as_bool).unwrap_or(true);
    let dismiss_on_parent_focus = matches!(kind, "editor-settings" | "app-settings" | "command-browser" | "graph-validation");
    if !blocking && matches!(kind, "editor-settings" | "shortcuts-help" | "template-syntax-help") {
        let existing_label = {
            let sessions = state.sessions.lock().map_err(|_| "A desktop prompt could not be opened.".to_string())?;
            sessions.iter().find_map(|(existing_label, session)| {
                let existing_kind = session.payload.get("kind").and_then(serde_json::Value::as_str).unwrap_or_default();
                (!session.blocking && session.parent_label == parent.label() && existing_kind == kind).then(|| existing_label.clone())
            })
        };
        if let Some(existing_label) = existing_label {
            if let Some(existing_window) = app.get_webview_window(&existing_label) {
                let _ = existing_window.show();
                let _ = existing_window.set_focus();
                let _ = app.emit_to(parent.label(), "arc:desktop-prompt-response", serde_json::json!({ "requestId": request_id, "response": null }));
                return Ok(());
            }
        }
    }
    let label = {
        let mut sessions = state.sessions.lock().map_err(|_| "A desktop prompt could not be opened.".to_string())?;
        if blocking && sessions.values().any(|session| session.blocking) {
            return Err("Another blocking desktop prompt is already open.".to_string());
        }
        let label = format!("arc-prompt-{request_id}");
        if sessions.contains_key(&label) {
            return Err("Another desktop prompt is already open.".to_string());
        }
        sessions.insert(label.clone(), DesktopPromptSession {
            request_id: request_id.clone(),
            parent_label: parent.label().to_string(),
            payload: payload.clone(),
            blocking,
            dismiss_on_parent_focus,
            blocked_window_labels: Vec::new(),
        });
        label
    };

    let mut blocked_window_labels = Vec::new();
    if blocking {
        for (window_label, window) in app.webview_windows() {
            if window_label == label { continue; }
            if let Err(error) = window.eval(DESKTOP_PROMPT_GUARD_SCRIPT) {
                discard_desktop_prompt(&app, &label);
                restore_prompt_windows(&app, &blocked_window_labels);
                return Err(format!("Could not prepare the prompt window: {error}"));
            }
            blocked_window_labels.push(window_label);
        }
    }
    if let Ok(mut sessions) = state.sessions.lock() {
        if let Some(session) = sessions.get_mut(&label) {
            session.blocked_window_labels = blocked_window_labels.clone();
        }
    }

    let about_only = payload.get("aboutOnly").and_then(serde_json::Value::as_bool).unwrap_or(false);
    let title = payload.get("title").and_then(serde_json::Value::as_str).unwrap_or("ARC Studio");
    let title = title.chars().filter(|character| !character.is_control()).take(80).collect::<String>();
    let height = match kind {
        "text" | "graph-name" => 250.0,
        "graph-close" => 300.0,
        "text-confirm" => 320.0,
        "bot-export" => 640.0,
        "project-export" => 520.0,
        "editor-settings" if about_only => 660.0,
        "editor-settings" => 700.0,
        "app-settings" => 720.0,
        "deployment-review" => 720.0,
        "command-browser" => 700.0,
        "plugin-action" => 700.0,
        "team-access" => 760.0,
        "canvas-section" => 620.0,
        "shortcuts-help" | "template-syntax-help" => 660.0,
        "template-inputs-help" => 600.0,
        "create-project" => 620.0,
        _ => 320.0,
    };
    let minimum_height = match kind {
        "text" | "graph-name" => 220.0,
        "graph-close" => 260.0,
        "text-confirm" => 280.0,
        _ => 320.0,
    };
    let width = match kind {
        "editor-settings" if about_only => 620.0,
        "editor-settings" => 720.0,
        "app-settings" => 700.0,
        "deployment-review" | "command-browser" | "plugin-action" => 680.0,
        "team-access" => 800.0,
        "canvas-section" => 560.0,
        "shortcuts-help" | "template-syntax-help" => 640.0,
        "create-project" => 580.0,
        "graph-close" => 520.0,
        _ => 480.0,
    };
    let theme = payload.get("theme").and_then(serde_json::Value::as_str).filter(|theme| *theme == "light" || *theme == "dark").unwrap_or("dark");
    let release_channel = payload.get("releaseChannel").and_then(serde_json::Value::as_str).filter(|channel| *channel == "stable" || *channel == "nightly").unwrap_or(build_release_channel());
    let (background_color, background_css) = if theme == "light" {
        (tauri::webview::Color(233, 235, 238, 255), "#e9ebee")
    } else {
        (tauri::webview::Color(20, 23, 27, 255), "#14171b")
    };
    let theme_choice = payload.get("themeChoice").and_then(serde_json::Value::as_str).unwrap_or("system");
    let native_theme = match theme_choice {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    let initialization_script = format!(
        "document.documentElement.dataset.theme = {}; document.documentElement.dataset.releaseChannel = {}; document.documentElement.style.backgroundColor = {};",
        js_string_literal(theme),
        js_string_literal(release_channel),
        js_string_literal(background_css),
    );
    let prompt = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("prompt.html".into()))
        .title(if title.is_empty() { "ARC Studio" } else { &title })
        .inner_size(width, height)
        .theme(native_theme)
        .background_color(background_color)
        .initialization_script(initialization_script)
        .min_inner_size(width, minimum_height)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(true)
        .decorations(true)
        .always_on_top(payload.get("alwaysOnTop").and_then(serde_json::Value::as_bool).unwrap_or(false))
        .focused(true)
        .visible(false)
        .parent(&parent)
        .map_err(|error| {
            discard_desktop_prompt(&app, &label);
            format!("Could not prepare the prompt window: {error}")
        })?
        .build()
        .map_err(|error| {
            discard_desktop_prompt(&app, &label);
            format!("Could not create the prompt window: {error}")
        })?;

    let close_label = label.clone();
    let close_app = app.clone();
    let close_parent_label = parent.label().to_string();
    prompt.on_window_event(move |event| {
        match event {
            WindowEvent::Focused(false) if dismiss_on_parent_focus => {
                dismiss_desktop_prompt_when_parent_focused(close_app.clone(), close_label.clone(), close_parent_label.clone());
            }
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                clear_desktop_prompt(&close_app, &close_label, serde_json::Value::Null, false);
            }
            _ => {}
        }
    });
    Ok(())
}

#[tauri::command]
fn show_desktop_prompt_window(window: WebviewWindow, state: State<'_, DesktopPromptManager>) -> Result<(), String> {
    let label = window.label();
    if !label.starts_with("arc-prompt-") {
        return Err("Only a desktop prompt window can be shown this way.".to_string());
    }
    if !state.sessions.lock().map_err(|_| "This desktop prompt is unavailable.".to_string())?.contains_key(label) {
        return Err("This desktop prompt is no longer active.".to_string());
    }
    window.show().map_err(|error| format!("Could not show the desktop prompt: {error}"))?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn take_desktop_prompt_data(window: WebviewWindow, state: State<'_, DesktopPromptManager>) -> Result<serde_json::Value, String> {
    let label = window.label();
    if !label.starts_with("arc-prompt-") {
        return Err("Prompt data is only available in a prompt window.".to_string());
    }
    let sessions = state.sessions.lock().map_err(|_| "The prompt data is unavailable.".to_string())?;
    let Some(session) = sessions.get(label) else { return Err("This prompt is no longer active.".to_string()); };
    let mut payload = session.payload.clone();
    if let Some(object) = payload.as_object_mut() {
        object.insert("_desktopPrompt".to_string(), serde_json::json!({
            "requestId": session.request_id,
            "parentLabel": session.parent_label,
            "windowLabel": label,
            "blocking": session.blocking,
        }));
    }
    Ok(payload)
}

#[tauri::command]
fn dispatch_desktop_prompt_action(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, DesktopPromptManager>,
    action_id: String,
    action: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let label = window.label();
    if !label.starts_with("arc-prompt-") { return Err("Only a prompt window can send desktop actions.".to_string()); }
    let action_id = uuid::Uuid::parse_str(&action_id).map_err(|_| "That desktop action is not valid.".to_string())?.to_string();
    if serde_json::to_vec(&value).map_err(|_| "That desktop action could not be prepared.".to_string())?.len() > 256 * 1024 {
        return Err("That desktop action contains too much data.".to_string());
    }
    let (parent_label, kind) = {
        let sessions = state.sessions.lock().map_err(|_| "The prompt action is unavailable.".to_string())?;
        sessions.get(label).map(|session| (session.parent_label.clone(), session.payload.get("kind").and_then(serde_json::Value::as_str).unwrap_or_default().to_string())).ok_or_else(|| "This prompt is no longer active.".to_string())?
    };
    let allowed = match kind.as_str() {
        "editor-settings" => matches!(action.as_str(), "settings-update" | "settings-theme" | "settings-auto-layout" | "settings-export-graph" | "settings-reset-local-data" | "settings-open-studio-update" | "settings-check-for-updates" | "settings-idle-disconnect"),
        "create-project" => action == "projects-create-from-template",
        "app-settings" => matches!(action.as_str(), "app-settings-profile" | "app-settings-view-commands"),
        "deployment-review" => matches!(action.as_str(), "commands-deploy" | "commands-review-options" | "command-open-graph" | "command-open-node"),
        "command-browser" => action == "command-open-graph",
        "plugin-action" => action == "plugin-confirm",
        "team-access" => action == "team-current-user-updated",
        "graph-name" => action == "graph-name-submit",
        "graph-validation" => action == "validation-open-node",
        _ => false,
    };
    if !allowed { return Err("This desktop prompt cannot perform that action.".to_string()); }
    app.emit_to(&parent_label, "arc:desktop-window-action", serde_json::json!({
        "actionId": action_id,
        "action": action,
        "value": value,
        "promptLabel": label,
    })).map_err(|error| format!("Could not send the desktop action: {error}"))
}

#[tauri::command]
fn complete_desktop_prompt(window: WebviewWindow, app: AppHandle, response: serde_json::Value) -> Result<(), String> {
    let label = window.label().to_string();
    if !label.starts_with("arc-prompt-") {
        return Err("Only a prompt window can complete a desktop prompt.".to_string());
    }
    if !app.state::<DesktopPromptManager>().sessions.lock().map_err(|_| "The prompt could not be completed.".to_string())?.contains_key(&label) {
        return Err("This prompt is no longer active.".to_string());
    }
    clear_desktop_prompt(&app, &label, response, true);
    Ok(())
}

#[tauri::command]
fn close_desktop_prompts(app: AppHandle) -> Result<(), String> {
    close_desktop_prompt_sessions(&app, None);
    Ok(())
}

fn is_arc_project_path(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()).is_some_and(|name| {
        let name = name.to_ascii_lowercase();
        name.ends_with(".arcproject")
    })
}

fn notify_project_file_opened<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: &Path) {
    if !is_arc_project_path(path) && !is_arc_graph_path(path) { return; }
    let path = path.to_string_lossy().into_owned();
    let pending = app.state::<PendingProjectFiles>();
    if !pending.main_window_ready.load(Ordering::SeqCst) {
        let Ok(mut paths) = pending.paths.lock() else { return; };
        if !pending.main_window_ready.load(Ordering::SeqCst) {
            paths.push(path);
            return;
        }
    }
    let Some(window) = app.get_webview_window("main") else {
        if let Ok(mut paths) = pending.paths.lock() { paths.push(path); }
        return;
    };
    let path = js_string_literal(&path);
    let script = format!(
        "window.__ARC_STUDIO_OPEN_FILES__ ||= []; window.__ARC_STUDIO_OPEN_FILES__.push({path}); window.dispatchEvent(new CustomEvent('arc:desktop-file-opened', {{ detail: {path} }}));"
    );
    let _ = window.eval(&script);
}

#[tauri::command]
fn get_workspace_password(origin: String) -> Result<Option<String>, String> {
    let entry = workspace_credential_entry(&origin)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the saved workspace credential: {error}")),
    }
}

#[tauri::command]
fn save_workspace_password(origin: String, password: String) -> Result<(), String> {
    workspace_credential_entry(&origin)?
        .set_password(&password)
        .map_err(|error| format!("Could not save the workspace credential: {error}"))
}

#[tauri::command]
fn delete_workspace_password(origin: String) -> Result<(), String> {
    let entry = workspace_credential_entry(&origin)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the saved workspace credential: {error}")),
    }
}

fn local_session_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("studio.arc.desktop", "local-workspace-session")
        .map_err(|error| format!("Could not access the system credential store: {error}"))
}

#[tauri::command]
fn get_local_session_token() -> Result<Option<String>, String> {
    match local_session_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the saved Local Workspace session: {error}")),
    }
}

#[tauri::command]
fn save_local_session_token(token: String) -> Result<(), String> {
    if token.is_empty() || token.len() > 4096 {
        return Err("The Local Workspace session token is invalid.".to_string());
    }
    local_session_entry()?.set_password(&token)
        .map_err(|error| format!("Could not save the Local Workspace session: {error}"))
}

#[tauri::command]
fn delete_local_session_token() -> Result<(), String> {
    match local_session_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the saved Local Workspace session: {error}")),
    }
}

fn bot_token_encryption_key() -> Result<String, String> {
    let entry = keyring::Entry::new("studio.arc.desktop", "bot-token-encryption-key")
        .map_err(|_| "Could not access the system credential store for bot-token encryption.".to_string())?;
    match entry.get_password() {
        Ok(key) if key.len() >= 64 => Ok(key),
        Ok(_) => Err("The saved bot-token encryption key is invalid.".to_string()),
        Err(keyring::Error::NoEntry) => {
            let key = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
            entry.set_password(&key)
                .map_err(|_| "Could not save the bot-token encryption key in the system credential store.".to_string())?;
            Ok(key)
        }
        Err(_) => Err("Could not read the bot-token encryption key from the system credential store.".to_string()),
    }
}

#[tauri::command]
fn set_release_channel_icon<R: tauri::Runtime>(app: tauri::AppHandle<R>, icon_png: Vec<u8>) -> Result<(), String> {
    if icon_png.len() > 2 * 1024 * 1024 || !icon_png.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("The release channel icon is not a valid PNG image.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = sender.send(unsafe { set_macos_dock_icon(&icon_png) });
        }).map_err(|error| format!("Could not schedule the Dock icon update: {error}"))?;
        receiver.recv_timeout(Duration::from_secs(5)).map_err(|_| "The Dock icon update timed out.".to_string())??;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, icon_png);
    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn set_macos_dock_icon(icon_png: &[u8]) -> Result<(), String> {
    use std::ffi::c_void;
    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, selector: *mut c_void, ...) -> *mut c_void;
    }

    let class_name = CString::new("NSData").unwrap();
    let data_class = objc_getClass(class_name.as_ptr());
    let data_selector_name = CString::new("dataWithBytes:length:").unwrap();
    let data_selector = sel_registerName(data_selector_name.as_ptr());
    let data = objc_msgSend(data_class, data_selector, icon_png.as_ptr(), icon_png.len());
    if data.is_null() { return Err("macOS could not load the Dock icon data.".to_string()); }

    let image_class_name = CString::new("NSImage").unwrap();
    let image_class = objc_getClass(image_class_name.as_ptr());
    let alloc_selector_name = CString::new("alloc").unwrap();
    let alloc_selector = sel_registerName(alloc_selector_name.as_ptr());
    let image = objc_msgSend(image_class, alloc_selector);
    let init_selector_name = CString::new("initWithData:").unwrap();
    let init_selector = sel_registerName(init_selector_name.as_ptr());
    let image = objc_msgSend(image, init_selector, data);
    if image.is_null() { return Err("macOS could not decode the Dock icon.".to_string()); }

    let app_class_name = CString::new("NSApplication").unwrap();
    let app_class = objc_getClass(app_class_name.as_ptr());
    let shared_selector_name = CString::new("sharedApplication").unwrap();
    let shared_selector = sel_registerName(shared_selector_name.as_ptr());
    let application = objc_msgSend(app_class, shared_selector);
    let set_selector_name = CString::new("setApplicationIconImage:").unwrap();
    let set_selector = sel_registerName(set_selector_name.as_ptr());
    objc_msgSend(application, set_selector, image);
    Ok(())
}

#[cfg(target_os = "macos")]
static MACOS_DOCK_MENU_APP: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();

#[cfg(target_os = "macos")]
unsafe extern "C" fn arc_application_dock_menu(_this: *mut std::ffi::c_void, _selector: *mut std::ffi::c_void, _application: *mut std::ffi::c_void) -> *mut std::ffi::c_void {
    use std::ffi::c_void;
    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, selector: *mut c_void, ...) -> *mut c_void;
    }

    let class_name = CString::new("NSMenu").unwrap();
    let menu_class = objc_getClass(class_name.as_ptr());
    let alloc_name = CString::new("alloc").unwrap();
    let alloc = objc_msgSend(menu_class, sel_registerName(alloc_name.as_ptr()));
    let title_name = CString::new("ARC Studio").unwrap();
    let title = objc_msgSend(objc_getClass(CString::new("NSString").unwrap().as_ptr()), sel_registerName(CString::new("stringWithUTF8String:").unwrap().as_ptr()), title_name.as_ptr());
    let menu = objc_msgSend(alloc, sel_registerName(CString::new("initWithTitle:").unwrap().as_ptr()), title);
    if menu.is_null() { return std::ptr::null_mut(); }
    let action_selector = sel_registerName(CString::new("arcDockMenuAction:").unwrap().as_ptr());
    let item_class = objc_getClass(CString::new("NSMenuItem").unwrap().as_ptr());
    let autorelease = sel_registerName(CString::new("autorelease").unwrap().as_ptr());
    let add_item = sel_registerName(CString::new("addItem:").unwrap().as_ptr());
    let set_target = sel_registerName(CString::new("setTarget:").unwrap().as_ptr());
    let set_represented_object = sel_registerName(CString::new("setRepresentedObject:").unwrap().as_ptr());
    let string_class = objc_getClass(CString::new("NSString").unwrap().as_ptr());
    let string_from_utf8 = sel_registerName(CString::new("stringWithUTF8String:").unwrap().as_ptr());
    for (label, action) in [
        ("New Graph", "file.new-graph"),
        ("Import Project File…", "file.open-project"),
        ("Editor Settings…", "view.settings"),
        ("Keyboard Shortcuts", "help.shortcuts"),
    ] {
        let label = CString::new(label).unwrap();
        let action_value = CString::new(action).unwrap();
        let label_object = objc_msgSend(string_class, string_from_utf8, label.as_ptr());
        let item = objc_msgSend(
            objc_msgSend(item_class, sel_registerName(CString::new("alloc").unwrap().as_ptr())),
            sel_registerName(CString::new("initWithTitle:action:keyEquivalent:").unwrap().as_ptr()),
            label_object,
            action_selector,
            objc_msgSend(string_class, string_from_utf8, CString::new("").unwrap().as_ptr()),
        );
        if item.is_null() { continue; }
        objc_msgSend(item, set_target, _this);
        let represented = objc_msgSend(string_class, string_from_utf8, action_value.as_ptr());
        objc_msgSend(item, set_represented_object, represented);
        objc_msgSend(menu, add_item, objc_msgSend(item, autorelease));
    }
    objc_msgSend(menu, autorelease)
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn arc_dock_menu_action(_this: *mut std::ffi::c_void, _selector: *mut std::ffi::c_void, sender: *mut std::ffi::c_void) {
    use std::ffi::{c_void, CStr};
    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}
    #[link(name = "objc")]
    extern "C" {
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, selector: *mut c_void, ...) -> *mut c_void;
    }
    let Some(state) = MACOS_DOCK_MENU_APP.get() else { return; };
    let Ok(app_slot) = state.lock() else { return; };
    let Some(app) = app_slot.as_ref() else { return; };
    let represented = objc_msgSend(sender, sel_registerName(CString::new("representedObject").unwrap().as_ptr()));
    let bytes = objc_msgSend(represented, sel_registerName(CString::new("UTF8String").unwrap().as_ptr())) as *const std::ffi::c_char;
    if bytes.is_null() { return; }
    let action = CStr::from_ptr(bytes).to_string_lossy().into_owned();
    dispatch_desktop_menu_action(app, action);
}

#[cfg(target_os = "macos")]
fn install_macos_dock_menu(app: &AppHandle) -> Result<(), String> {
    use std::ffi::{c_void, CString};
    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn object_getClass(object: *mut c_void) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, selector: *mut c_void, ...) -> *mut c_void;
        fn class_addMethod(class: *mut c_void, selector: *mut c_void, implementation: unsafe extern "C" fn(), types: *const std::ffi::c_char) -> i8;
        fn class_replaceMethod(class: *mut c_void, selector: *mut c_void, implementation: unsafe extern "C" fn(), types: *const std::ffi::c_char) -> *mut c_void;
    }

    let slot = MACOS_DOCK_MENU_APP.get_or_init(|| Mutex::new(None));
    *slot.lock().map_err(|_| "The Dock menu state is unavailable.".to_string())? = Some(app.clone());
    unsafe {
        let application_class = objc_getClass(CString::new("NSApplication").unwrap().as_ptr());
        let application = objc_msgSend(application_class, sel_registerName(CString::new("sharedApplication").unwrap().as_ptr()));
        let delegate = objc_msgSend(application, sel_registerName(CString::new("delegate").unwrap().as_ptr()));
        if delegate.is_null() { return Err("macOS did not provide an application delegate.".to_string()); }
        let delegate_class = object_getClass(delegate);
        let dock_selector = sel_registerName(CString::new("applicationDockMenu:").unwrap().as_ptr());
        let dock_types = CString::new("@@:@").unwrap();
        let dock_imp: unsafe extern "C" fn() = std::mem::transmute(arc_application_dock_menu as *const ());
        if class_addMethod(delegate_class, dock_selector, dock_imp, dock_types.as_ptr()) == 0 {
            if class_replaceMethod(delegate_class, dock_selector, dock_imp, dock_types.as_ptr()).is_null() {
                return Err("macOS could not register the Dock menu handler.".to_string());
            }
        }
        let action_selector = sel_registerName(CString::new("arcDockMenuAction:").unwrap().as_ptr());
        let action_types = CString::new("v@:@").unwrap();
        let action_imp: unsafe extern "C" fn() = std::mem::transmute(arc_dock_menu_action as *const ());
        if class_addMethod(delegate_class, action_selector, action_imp, action_types.as_ptr()) == 0 {
            if class_replaceMethod(delegate_class, action_selector, action_imp, action_types.as_ptr()).is_null() {
                return Err("macOS could not register the Dock menu action handler.".to_string());
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn reset_local_data<R: tauri::Runtime>(app: tauri::AppHandle<R>, server: State<'_, StudioServer>, username: String, password: String, server_port: Option<u16>) -> Result<(), String> {
    let is_dev = cfg!(debug_assertions);
    let managed_port = *server.port.lock().map_err(|_| "ARC Studio server state is unavailable.".to_string())?;
    let port = match (managed_port, server_port) {
        (Some(managed), Some(requested)) if managed != requested => return Err("The local workspace server changed. Restart ARC Studio and try again.".to_string()),
        (Some(managed), _) => managed,
        (None, Some(requested)) if requested > 0 => requested,
        (None, _) => return Err("The local workspace server is unavailable. Restart ARC Studio and try again.".to_string()),
    };
    verify_local_reset_password(port, &username, &password)?;
    let _ = delete_local_session_token();

    if is_dev { reset_local_workspace_in_dev(port, &username, &password)?; }

    if !is_dev { stop_studio_server(&app); }
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    clear_local_directory(&data_dir).map_err(|error| format!("Could not remove local workspace data: {error}"))?;
    if config_dir != data_dir {
        clear_local_directory(&config_dir).map_err(|error| format!("Could not remove local app settings: {error}"))?;
    }

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(if is_dev { 1800 } else { 500 }));
        app.request_restart();
    });
    Ok(())
}

fn clear_local_directory(directory: &Path) -> io::Result<()> {
    if !directory.exists() { return Ok(()); }
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_name() == "updates" && entry.file_type()?.is_dir() { continue; }
        let file_type = entry.file_type()?;
        if file_type.is_dir() { fs::remove_dir_all(entry.path())?; }
        else { fs::remove_file(entry.path())?; }
    }
    Ok(())
}

fn reset_local_workspace_in_dev(port: u16, username: &str, password: &str) -> Result<(), String> {
    let body = format!("{{\"username\":{},\"password\":{}}}", js_string_literal(username), js_string_literal(password));
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map_err(|_| "Could not reach the Tauri development workspace service. Keep `tauri dev` running and try again.".to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(8))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    let request = format!(
        "POST /api/auth/desktop-reset-data HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(), body
    );
    stream.write_all(request.as_bytes()).map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|error| error.to_string())?;
    let response = String::from_utf8_lossy(&response);
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") { Ok(()) }
    else if response.starts_with("HTTP/1.1 401") || response.starts_with("HTTP/1.0 401") { Err("Only the local owner can reset this workspace. Check the owner password and try again.".to_string()) }
    else if response.starts_with("HTTP/1.1 404") || response.starts_with("HTTP/1.0 404") { Err("The Tauri development server does not support workspace reset. Restart `tauri dev` after updating ARC Studio.".to_string()) }
    else { Err("The development server could not reset the workspace data.".to_string()) }
}

fn verify_local_reset_password(port: u16, username: &str, password: &str) -> Result<(), String> {
    let body = format!("{{\"username\":{},\"password\":{}}}", js_string_literal(username), js_string_literal(password));
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map_err(|_| "Could not reach the local workspace to verify your password.".to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    let request = format!(
        "POST /api/auth/desktop-reset-check HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(), body
    );
    stream.write_all(request.as_bytes()).map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|error| error.to_string())?;
    let response = String::from_utf8_lossy(&response);
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") { Ok(()) }
    else if response.starts_with("HTTP/1.1 401") || response.starts_with("HTTP/1.0 401") { Err("The ARC Studio password is incorrect.".to_string()) }
    else {
        let status = response.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("unknown");
        if status == "429" { Err("Too many password checks. Wait a few minutes and try again.".to_string()) }
        else if status == "404" { Err("This ARC Studio server does not support local data reset. Update ARC Studio and try again.".to_string()) }
        else { Err(format!("Could not verify your ARC Studio password (local server returned HTTP {status}).")) }
    }
}

fn workspace_credential_entry(origin: &str) -> Result<keyring::Entry, String> {
    let url = url::Url::parse(origin).map_err(|_| "Invalid workspace origin.".to_string())?;
    let local_http = url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !local_http)
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Invalid workspace origin.".to_string());
    }
    keyring::Entry::new("studio.arc.desktop", origin)
        .map_err(|error| format!("Could not access the system credential store: {error}"))
}

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

struct StudioServer {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    shutting_down: AtomicBool,
}
#[derive(Default)]
struct PendingProjectFiles {
    paths: Mutex<Vec<String>>,
    main_window_ready: AtomicBool,
}

#[derive(Default)]
struct PendingDesktopMenuActions(Mutex<Vec<String>>);
struct DiscordPresence {
    client: Mutex<Option<DiscordIpcClient>>,
    started_at_ms: Mutex<Option<i64>>,
}
struct AppState {
    surface: Mutex<String>,
}
impl AppState {
    fn new() -> Self {
        AppState { surface: Mutex::new("splash".to_string()) }
    }
    fn set_surface(&self, surface: String) {
        *self.surface.lock().unwrap() = surface;
    }
    fn surface(&self) -> String {
        self.surface.lock().unwrap().clone()
    }}
struct WindowSizeState(Arc<Mutex<WindowDimensions>>);
#[derive(Clone, Copy)]
struct WindowDimensions { width: f64, height: f64, maximized: bool }
struct MainWindowLaunch {
    window_config: tauri::utils::config::WindowConfig,
    window_size: WindowDimensions,
    window_size_path: PathBuf,
    local_username: String,
    desktop_target: String,
    release_channel: &'static str,
    startup_project_files: String,
    startup_project_id: String,
    startup_menu_action: Option<String>,
}
const DISCORD_APPLICATION_ID: &str = "1559947417699360821";
const ARC_GITHUB_URL: &str = "https://github.com/relentiousdragon/arc-studio";
const NIGHTLY_RPC_ICON_URL: &str = "https://raw.githubusercontent.com/relentiousdragon/arc-studio/main/packages/studio-desktop/src-tauri/icons/nightly-icon.png";

#[tauri::command]
fn update_discord_presence(
    presence: State<'_, DiscordPresence>,
    details: String,
    state_text: String,
    activity_type: u8,
    button_label: String,
) -> Result<(), String> {
    let details = presence_text(&details);
    let state_text = presence_text(&state_text);
    let button_label = presence_text(&button_label);
    let activity_type = match activity_type {
        0 => activity::ActivityType::Playing,
        2 => activity::ActivityType::Listening,
        3 => activity::ActivityType::Watching,
        5 => activity::ActivityType::Competing,
        _ => return Err("Choose a supported Discord activity type.".to_string()),
    };
    let started_at_ms = {
        let mut started_at = presence.started_at_ms.lock().map_err(|_| "Discord presence is unavailable.".to_string())?;
        *started_at.get_or_insert_with(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64
        })
    };
    let mut connection = presence.client.lock().map_err(|_| "Discord presence is unavailable.".to_string())?;
    if connection.is_none() {
        let mut client = DiscordIpcClient::new(DISCORD_APPLICATION_ID);
        client.connect().map_err(|_| "Discord is not running or its local RPC connection is unavailable.".to_string())?;
        *connection = Some(client);
    }
    let client = connection.as_mut().expect("connection was initialized");
    let mut activity = activity::Activity::new()
        .name(if build_release_channel() == "nightly" { "ARC Studio Nightly" } else { "ARC Studio" })
        .activity_type(activity_type)
        .details(details)
        .state(state_text)
        .timestamps(activity::Timestamps::new().start(started_at_ms));
    if !button_label.is_empty() {
        activity = activity.buttons(vec![activity::Button::new(button_label, ARC_GITHUB_URL)]);
    }
    if build_release_channel() == "nightly" {
        activity = activity.assets(
            activity::Assets::new()
                .large_image(NIGHTLY_RPC_ICON_URL)
                .large_text("ARC Studio Nightly"),
        );
    }
    if client.set_activity(activity).is_err() {
        if let Some(mut client) = connection.take() {
            let _ = client.close();
        }
        return Err("Discord closed the Rich Presence connection. ARC Studio will retry.".to_string());
    }
    Ok(())
}

#[tauri::command]
fn clear_discord_presence(presence: State<'_, DiscordPresence>) {
    clear_discord_presence_inner(&presence);
}

#[tauri::command]
fn restart_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    app.restart()
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Invalid external URL.".to_string())?;
    if parsed.scheme() != "https"
        || !matches!(parsed.host_str(), Some("github.com" | "www.github.com"))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only ARC Studio GitHub links can be opened here.".to_string());
    }

    let mut command = if cfg!(target_os = "macos") {
        Command::new("open")
    } else if cfg!(target_os = "windows") {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    } else {
        Command::new("xdg-open")
    };
    command.arg(parsed.as_str());
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the external link: {error}"))
}

#[tauri::command]
fn open_passkey_auth_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Invalid workspace URL.".to_string())?;
    let local_http = parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if (parsed.scheme() != "https" && !local_http)
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Passkey sign in can only open an HTTPS workspace URL.".to_string());
    }

    let mut command = if cfg!(target_os = "macos") {
        Command::new("open")
    } else if cfg!(target_os = "windows") {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    } else {
        Command::new("xdg-open")
    };
    command.arg(parsed.as_str());
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the workspace sign in page: {error}"))
}

#[tauri::command]
fn set_menu_context(app: tauri::AppHandle, surface: String) -> Result<(), String> {
    app.state::<AppState>().set_surface(surface.clone());
    let menu = build_menu(&app, &surface).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_application_theme(app: AppHandle, choice: String) -> Result<Option<String>, String> {
    let theme = match choice.as_str() {
        "system" => None,
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => return Err("Choose the system, light, or dark theme.".to_string()),
    };
    app.set_theme(theme);
    #[cfg(target_os = "macos")]
    if choice == "system" {
        let output = Command::new("/usr/bin/defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output()
            .ok();
        if let Some(output) = output {
            let system_theme = if output.status.success()
                && String::from_utf8_lossy(&output.stdout).trim().eq_ignore_ascii_case("dark")
            { "dark" } else { "light" };
            return Ok(Some(system_theme.to_string()));
        }
    }
    Ok(None)
}

fn dispatch_desktop_menu_action<R: tauri::Runtime>(app: &AppHandle<R>, action: String) {
    if app.try_state::<DesktopPromptManager>()
        .and_then(|manager| manager.sessions.lock().ok().map(|sessions| sessions.values().any(|session| session.blocking)))
        .unwrap_or(false)
    {
        return;
    }
    if app.get_webview_window("main").is_none() {
        if let Some(pending) = app.try_state::<PendingDesktopMenuActions>() {
            if let Ok(mut actions) = pending.0.lock() { actions.push(action); }
        }
        return;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
            let script = format!(
                "window.__ARC_STUDIO_MENU_ACTION__ = {}; window.dispatchEvent(new CustomEvent('arc:desktop-menu-action', {{ detail: window.__ARC_STUDIO_MENU_ACTION__ }}));",
                js_string_literal(&action)
            );
            let _ = window.eval(&script);
        }
    });
}

fn desktop_menu_action_argument(argument: &std::ffi::OsStr) -> Option<String> {
    argument.to_str()?.strip_prefix("--arc-menu-action=").map(str::to_owned)
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
struct WindowsGuid { data1: u32, data2: u16, data3: u16, data4: [u8; 8] }

#[cfg(target_os = "windows")]
#[repr(C)]
union WindowsPropVariantValue {
    string: *mut u16,
    #[cfg(target_pointer_width = "64")]
    words64: [u64; 2],
    #[cfg(target_pointer_width = "32")]
    words32: [u32; 4],
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct WindowsPropVariant { kind: u16, reserved1: u16, reserved2: u16, reserved3: u16, value: WindowsPropVariantValue }

#[cfg(target_os = "windows")]
unsafe fn windows_com_release(object: *mut std::ffi::c_void) {
    if object.is_null() { return; }
    let vtable = *(object as *mut *mut usize);
    let release: unsafe extern "system" fn(*mut std::ffi::c_void) -> u32 = std::mem::transmute(*vtable.add(2));
    release(object);
}

#[cfg(target_os = "windows")]
unsafe fn windows_shell_link_title(link: *mut std::ffi::c_void, title: &[u16]) -> Result<(), String> {
    use std::ffi::c_void;
    #[link(name = "ole32")]
    unsafe extern "system" { fn PropVariantClear(value: *mut WindowsPropVariant) -> i32; }
    const IID_PROPERTY_STORE: WindowsGuid = WindowsGuid { data1: 0x886d8eeb, data2: 0x8cf2, data3: 0x4446, data4: [0x8d, 0x02, 0xcd, 0xba, 0x1d, 0xbd, 0xcf, 0x99] };
    const PKEY_TITLE: WindowsGuid = WindowsGuid { data1: 0xf29f85e0, data2: 0x4ff9, data3: 0x1068, data4: [0xab, 0x91, 0x08, 0x00, 0x2b, 0x27, 0xb3, 0xd9] };
    #[repr(C)]
    struct PropertyKey { format: WindowsGuid, id: u32 }
    let vtable = *(link as *mut *mut usize);
    let query_interface: unsafe extern "system" fn(*mut c_void, *const WindowsGuid, *mut *mut c_void) -> i32 = std::mem::transmute(*vtable);
    let mut store = std::ptr::null_mut();
    let result = query_interface(link, &IID_PROPERTY_STORE, &mut store);
    if result < 0 { return Err(format!("Could not create a Windows task label (0x{:08X}).", result as u32)); }
    let store_vtable = *(store as *mut *mut usize);
    let set_value: unsafe extern "system" fn(*mut c_void, *const PropertyKey, *const WindowsPropVariant) -> i32 = std::mem::transmute(*store_vtable.add(6));
    let commit: unsafe extern "system" fn(*mut c_void) -> i32 = std::mem::transmute(*store_vtable.add(7));
    let property_key = PropertyKey { format: PKEY_TITLE, id: 2 };
    let mut variant = WindowsPropVariant {
        kind: 31,
        reserved1: 0,
        reserved2: 0,
        reserved3: 0,
        value: WindowsPropVariantValue { string: title.as_ptr() as *mut u16 },
    };
    let set_result = set_value(store, &property_key, &variant);
    let result = if set_result < 0 { set_result } else { commit(store) };
    variant.value.string = std::ptr::null_mut();
    let _ = PropVariantClear(&mut variant);
    windows_com_release(store);
    if result < 0 { Err(format!("Could not save a Windows task label (0x{:08X}).", result as u32)) } else { Ok(()) }
}

#[cfg(target_os = "windows")]
unsafe fn install_windows_jump_list_inner() -> Result<(), String> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    const CLSID_DESTINATION_LIST: WindowsGuid = WindowsGuid { data1: 0x77f10cf0, data2: 0x3db5, data3: 0x4966, data4: [0xb5, 0x20, 0xb7, 0xc5, 0x4f, 0xd3, 0x5e, 0xd6] };
    const IID_CUSTOM_DESTINATION_LIST: WindowsGuid = WindowsGuid { data1: 0x6332debf, data2: 0x87b5, data3: 0x4670, data4: [0x90, 0xc0, 0x5e, 0x57, 0xb4, 0x08, 0xa4, 0x9e] };
    const CLSID_OBJECT_COLLECTION: WindowsGuid = WindowsGuid { data1: 0x2d3468c1, data2: 0x36a7, data3: 0x43b6, data4: [0xac, 0x24, 0xd3, 0xf0, 0x2f, 0xd9, 0x60, 0x7a] };
    const IID_OBJECT_COLLECTION: WindowsGuid = WindowsGuid { data1: 0x5632b1a4, data2: 0xe38a, data3: 0x400a, data4: [0x92, 0x8a, 0xd4, 0xcd, 0x63, 0x23, 0x02, 0x95] };
    const IID_OBJECT_ARRAY: WindowsGuid = WindowsGuid { data1: 0x92ca9dcd, data2: 0x5622, data3: 0x4bba, data4: [0xa8, 0x05, 0x5e, 0x9f, 0x54, 0x1b, 0xd8, 0xc9] };
    const CLSID_SHELL_LINK: WindowsGuid = WindowsGuid { data1: 0x00021401, data2: 0x0000, data3: 0x0000, data4: [0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46] };
    const IID_SHELL_LINK_W: WindowsGuid = WindowsGuid { data1: 0x000214f9, data2: 0x0000, data3: 0x0000, data4: [0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46] };
    const CLSCTX_INPROC_SERVER: u32 = 1;
    #[link(name = "ole32")]
    unsafe extern "system" { fn CoCreateInstance(class_id: *const WindowsGuid, outer: *mut c_void, context: u32, interface_id: *const WindowsGuid, result: *mut *mut c_void) -> i32; }
    let executable = std::env::current_exe().map_err(|error| format!("Could not locate ARC Studio for the Windows taskbar menu: {error}"))?;
    let executable_wide = executable.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let mut destination_list = std::ptr::null_mut();
    let result = CoCreateInstance(&CLSID_DESTINATION_LIST, std::ptr::null_mut(), CLSCTX_INPROC_SERVER, &IID_CUSTOM_DESTINATION_LIST, &mut destination_list);
    if result < 0 { return Err(format!("Windows did not create the ARC Studio taskbar menu (0x{:08X}).", result as u32)); }
    let mut maximum_slots = 0u32;
    let mut removed_items = std::ptr::null_mut();
    let destination_vtable = *(destination_list as *mut *mut usize);
    let begin_list: unsafe extern "system" fn(*mut c_void, *mut u32, *const WindowsGuid, *mut *mut c_void) -> i32 = std::mem::transmute(*destination_vtable.add(4));
    let result = begin_list(destination_list, &mut maximum_slots, &IID_OBJECT_ARRAY, &mut removed_items);
    if !removed_items.is_null() { windows_com_release(removed_items); }
    if result < 0 {
        windows_com_release(destination_list);
        return Err(format!("Windows could not start the ARC Studio taskbar menu (0x{:08X}).", result as u32));
    }
    let mut collection = std::ptr::null_mut();
    let result = CoCreateInstance(&CLSID_OBJECT_COLLECTION, std::ptr::null_mut(), CLSCTX_INPROC_SERVER, &IID_OBJECT_COLLECTION, &mut collection);
    if result < 0 {
        let abort: unsafe extern "system" fn(*mut c_void) -> i32 = std::mem::transmute(*destination_vtable.add(11));
        let _ = abort(destination_list);
        windows_com_release(destination_list);
        return Err(format!("Windows could not create the ARC Studio task list (0x{:08X}).", result as u32));
    }
    let collection_vtable = *(collection as *mut *mut usize);
    let add_object: unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32 = std::mem::transmute(*collection_vtable.add(5));
    let set_path_at = 20usize;
    let set_arguments_at = 11usize;
    let set_description_at = 7usize;
    let set_icon_at = 17usize;
    let tasks = [
        ("New Graph", "file.new-graph", "Create a graph in ARC Studio"),
        ("Import Project File", "file.open-project", "Import an ARC Studio project"),
        ("Editor Settings", "view.settings", "Open ARC Studio settings"),
    ];
    let mut task_error = None;
    for (title, action, description) in tasks {
        let mut link = std::ptr::null_mut();
        let result = CoCreateInstance(&CLSID_SHELL_LINK, std::ptr::null_mut(), CLSCTX_INPROC_SERVER, &IID_SHELL_LINK_W, &mut link);
        if result < 0 { task_error = Some(format!("Windows could not create the {title} task (0x{:08X}).", result as u32)); break; }
        let shell_vtable = *(link as *mut *mut usize);
        let set_path: unsafe extern "system" fn(*mut c_void, *const u16) -> i32 = std::mem::transmute(*shell_vtable.add(set_path_at));
        let set_arguments: unsafe extern "system" fn(*mut c_void, *const u16) -> i32 = std::mem::transmute(*shell_vtable.add(set_arguments_at));
        let set_description: unsafe extern "system" fn(*mut c_void, *const u16) -> i32 = std::mem::transmute(*shell_vtable.add(set_description_at));
        let set_icon: unsafe extern "system" fn(*mut c_void, *const u16, i32) -> i32 = std::mem::transmute(*shell_vtable.add(set_icon_at));
        let arguments = format!("--arc-menu-action={action}").encode_utf16().chain(Some(0)).collect::<Vec<_>>();
        let title_wide = title.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
        let description_wide = description.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
        let result = set_path(link, executable_wide.as_ptr());
        let result = if result < 0 { result } else { set_arguments(link, arguments.as_ptr()) };
        let result = if result < 0 { result } else { set_description(link, description_wide.as_ptr()) };
        let result = if result < 0 { result } else { set_icon(link, executable_wide.as_ptr(), 0) };
        let result = if result < 0 { result } else { windows_shell_link_title(link, &title_wide).map_or_else(|_| -1, |_| 0) };
        if result < 0 { task_error = Some(format!("Windows could not configure the {title} task (0x{:08X}).", result as u32)); windows_com_release(link); break; }
        let result = add_object(collection, link);
        windows_com_release(link);
        if result < 0 { task_error = Some(format!("Windows could not add the {title} task (0x{:08X}).", result as u32)); break; }
    }
    if let Some(error) = task_error {
        let abort: unsafe extern "system" fn(*mut c_void) -> i32 = std::mem::transmute(*destination_vtable.add(11));
        let _ = abort(destination_list);
        windows_com_release(collection);
        windows_com_release(destination_list);
        return Err(error);
    }
    let add_user_tasks: unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32 = std::mem::transmute(*destination_vtable.add(7));
    let commit: unsafe extern "system" fn(*mut c_void) -> i32 = std::mem::transmute(*destination_vtable.add(8));
    let result = add_user_tasks(destination_list, collection);
    let result = if result < 0 { result } else { commit(destination_list) };
    if result < 0 {
        let abort: unsafe extern "system" fn(*mut c_void) -> i32 = std::mem::transmute(*destination_vtable.add(11));
        let _ = abort(destination_list);
    }
    windows_com_release(collection);
    windows_com_release(destination_list);
    if result < 0 { Err(format!("Windows could not publish the ARC Studio taskbar menu (0x{:08X}).", result as u32)) } else { Ok(()) }
}

#[cfg(target_os = "windows")]
fn install_windows_jump_list() -> Result<(), String> {
    use std::ptr::null_mut;
    #[link(name = "ole32")]
    unsafe extern "system" { fn CoInitializeEx(reserved: *mut std::ffi::c_void, apartment: u32) -> i32; fn CoUninitialize(); }
    let initialized = unsafe { CoInitializeEx(null_mut(), 2) };
    if initialized < 0 { return Err(format!("Windows could not initialize the taskbar menu (0x{:08X}).", initialized as u32)); }
    let result = unsafe { install_windows_jump_list_inner() };
    unsafe { CoUninitialize(); }
    result
}

#[tauri::command]
fn open_macos_files_folders_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let settings_urls = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_FilesAndFolders",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension",
        ];
        for settings_url in settings_urls {
            match Command::new("open").arg(settings_url).status() {
                Ok(status) if status.success() => return Ok(()),
                _ => continue,
            }
        }
        return Err("Could not open macOS Privacy & Security settings.".to_string());
    }
    #[cfg(not(target_os = "macos"))]
    Err("Files and Folders settings are only available on macOS.".to_string())
}

fn clear_discord_presence_inner(presence: &DiscordPresence) {
    if let Ok(mut connection) = presence.client.lock() {
        if let Some(mut client) = connection.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }
    if let Ok(mut started_at) = presence.started_at_ms.lock() {
        *started_at = None;
    }
}

fn presence_text(value: &str) -> String {
    value.chars().filter(|character| !character.is_control()).take(128).collect()
}


fn build_menu<R: tauri::Runtime>(handle: &tauri::AppHandle<R>, surface: &str) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
    let in_editor = surface == "workspace";
    let new_graph = MenuItemBuilder::with_id("file.new-graph", "New Graph").accelerator("CmdOrCtrl+T").enabled(in_editor).build(handle)?;
    let new_blank_graph = MenuItemBuilder::with_id("file.new-blank-graph", "New Blank Graph").accelerator("CmdOrCtrl+Shift+T").enabled(in_editor).build(handle)?;
    let open_graph = MenuItemBuilder::with_id("file.open-graph", "Open Graph File…").accelerator("CmdOrCtrl+O").build(handle)?;
    let open_project = MenuItemBuilder::with_id("file.open-project", "Import Project File…").build(handle)?;
    let save_graph = MenuItemBuilder::with_id("file.save-graph", "Save Graph").accelerator("CmdOrCtrl+S").enabled(in_editor).build(handle)?;
    let export_graph = MenuItemBuilder::with_id("file.export-graph", "Export Graph…").enabled(in_editor).build(handle)?;
    let export_project = MenuItemBuilder::with_id("file.export-project", "Export Project…").enabled(in_editor).build(handle)?;
    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_graph).item(&new_blank_graph).separator().item(&open_graph).item(&open_project)
        .separator().item(&save_graph).item(&export_graph).item(&export_project).build()?;

    let undo = MenuItemBuilder::with_id("edit.undo", "Undo").accelerator("CmdOrCtrl+Z").enabled(in_editor).build(handle)?;
    let redo_accelerator = if cfg!(target_os = "macos") { "CmdOrCtrl+Shift+Z" } else { "CmdOrCtrl+Y" };
    let redo = MenuItemBuilder::with_id("edit.redo", "Redo").accelerator(redo_accelerator).enabled(in_editor).build(handle)?;
    let cut = PredefinedMenuItem::cut(handle, None)?;
    let copy = PredefinedMenuItem::copy(handle, None)?;
    let paste = PredefinedMenuItem::paste(handle, None)?;
    let select_all = PredefinedMenuItem::select_all(handle, None)?;
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&undo).item(&redo).separator().item(&cut).item(&copy).item(&paste).separator().item(&select_all).build()?;

    let library = MenuItemBuilder::with_id("view.library", "Toggle Library").accelerator("Shift+L").enabled(in_editor).build(handle)?;
    let console = MenuItemBuilder::with_id("view.console", "Open Console").accelerator("CmdOrCtrl+Shift+J").build(handle)?;
    let settings = MenuItemBuilder::with_id("view.settings", "Editor Settings…").build(handle)?;
    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&library).item(&console).separator().item(&settings).build()?;

    let minimize = PredefinedMenuItem::minimize(handle, None)?;
    let maximize = PredefinedMenuItem::maximize(handle, None)?;
    let close = PredefinedMenuItem::close_window(handle, None)?;
    let window_menu = SubmenuBuilder::new(handle, "Window")
        .item(&minimize).item(&maximize).item(&close).build()?;

    let help_shortcuts = MenuItemBuilder::with_id("help.shortcuts", "Keyboard Shortcuts").build(handle)?;
    let github = MenuItemBuilder::with_id("help.github", "ARC Studio on GitHub").build(handle)?;
    let discord = MenuItemBuilder::with_id("help.discord", "ARC Studio Discord Server").build(handle)?;
    let help_menu = SubmenuBuilder::new(handle, "Help").item(&help_shortcuts).separator().item(&github).item(&discord).build()?;
    let menu_builder = MenuBuilder::new(handle);
    #[cfg(target_os = "macos")]
    let menu_builder = {
        let about = MenuItemBuilder::with_id("help.about", "About ARC Studio").build(handle)?;
        let hide = PredefinedMenuItem::hide(handle, None)?;
        let hide_others = PredefinedMenuItem::hide_others(handle, None)?;
        let quit = PredefinedMenuItem::quit(handle, None)?;
        let app_menu = SubmenuBuilder::new(handle, "ARC Studio")
            .item(&about).separator().item(&hide).item(&hide_others).separator().item(&quit).build()?;
        menu_builder.item(&app_menu)
    };
    let menu = menu_builder.item(&file_menu).item(&edit_menu).item(&view_menu).item(&window_menu).item(&help_menu).build()?;
    Ok(menu)
}

fn main() {
    let startup_args = std::env::args_os().skip(1).collect::<Vec<_>>();
    if startup_args.first().is_some_and(|arg| arg == "--arc-update-watchdog") {
        if let Some(metadata_path) = startup_args.get(1) { run_update_watchdog(Path::new(metadata_path)); }
        return;
    }
    #[cfg(target_os = "windows")]
    if !windows_10_or_newer() {
        show_windows_10_required_message();
        return;
    }
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for argument in argv.iter().skip(1) {
                if let Some(action) = desktop_menu_action_argument(std::ffi::OsStr::new(argument.as_str())) {
                    dispatch_desktop_menu_action(app, action);
                    continue;
                }
                notify_project_file_opened(app, Path::new(argument));
            }
            if let Some(window) = app.get_webview_window("main").or_else(|| app.get_webview_window("boot")) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = app.deep_link().register_all() {
                    eprintln!("Could not register the passkey deep link scheme: {error}");
                }
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_client_build_info,
            get_workspace_password,
            save_workspace_password,
            delete_workspace_password,
            get_local_session_token,
            save_local_session_token,
            delete_local_session_token,
            set_release_channel_icon,
            read_arc_project_file,
            read_arc_graph_file,
            begin_graph_export,
            write_graph_export_chunk,
            finish_graph_export,
            cancel_graph_export,
            save_project_export,
            download_project_export,
            download_bot_export,
            upload_project_import_file,
            cancel_project_import_upload,
            open_project_window,
            open_desktop_prompt,
            show_desktop_prompt_window,
            take_desktop_prompt_data,
            dispatch_desktop_prompt_action,
            complete_desktop_prompt,
            close_desktop_prompts,
            show_main_window_after_startup,
            reset_local_data,
            open_external_url,
            open_passkey_auth_url,
            set_menu_context,
            set_application_theme,
            open_macos_files_folders_settings,
            check_channel_update,
            install_channel_update,
            install_staged_update,
            get_staged_update_status,
            mark_update_healthy,
            update_discord_presence,
            clear_discord_presence,
            restart_app,
        ])
        .on_menu_event(|app, event| {
            let action = event.id().as_ref();
            if action == "help.github" {
                let _ = open_external_url("https://github.com/relentiousdragon/arc-studio".to_string());
                return;
            }
            dispatch_desktop_menu_action(app, action.to_string());
        })
        .manage(StudioServer { child: Mutex::new(None), port: Mutex::new(None), shutting_down: AtomicBool::new(false) })
        .manage(PendingProjectFiles::default())
        .manage(PendingDesktopMenuActions::default())
        .manage(DiscordPresence { client: Mutex::new(None), started_at_ms: Mutex::new(None) })
        .manage(DesktopPromptManager::default())
        .manage(AppState::new())
        .setup(|app| {
            mark_update_starting(app.handle());
            let handle = app.handle();
            let surface = app.state::<AppState>().surface();
            let menu = build_menu(handle, &surface)?;
            app.set_menu(menu)?;
            #[cfg(target_os = "macos")]
            if let Err(error) = install_macos_dock_menu(handle) {
                eprintln!("Could not install the ARC Studio Dock menu: {error}");
            }
            #[cfg(target_os = "windows")]
            {
                let _ = thread::Builder::new().name("arc-taskbar-menu".to_string()).spawn(|| {
                    if let Err(error) = install_windows_jump_list() {
                        eprintln!("Could not install the ARC Studio taskbar menu: {error}");
                    }
                });
            }
            let window_config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "ARC Studio window configuration is missing"))?;
            let config_dir = node_compatible_path(&app.path().app_config_dir()?);
            fs::create_dir_all(&config_dir)?;
            let window_size_path = config_dir.join("window-size.txt");
            let window_size = restore_window_size(app, &window_config, &window_size_path);
            let local_username = os_login_name();
            let desktop_target = option_env!("ARC_DESKTOP_TARGET")
                .map(str::to_owned)
                .unwrap_or_else(|| format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS));
            let release_channel = build_release_channel();
            let startup_project_files = std::env::args_os().skip(1)
                .map(PathBuf::from)
                .filter(|path| is_arc_project_path(path) || is_arc_graph_path(path))
                .map(|path| js_string_literal(&path.to_string_lossy()))
                .collect::<Vec<_>>()
                .join(",");
            let startup_args = std::env::args_os().skip(1).collect::<Vec<_>>();
            let startup_menu_action = startup_args.iter().find_map(|argument| desktop_menu_action_argument(argument));
            let startup_project_id = startup_args.windows(2)
                .find(|pair| pair[0] == "--arc-project-id")
                .and_then(|pair| pair[1].to_str())
                .filter(|id| id.strip_prefix("project_").is_some_and(|uuid| uuid.len() == 36))
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let _boot_window = WebviewWindowBuilder::new(app, "boot", WebviewUrl::App("boot.html".into()))
                .title("ARC Studio")
                .inner_size(240.0, 200.0)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .closable(false)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(false)
                .center()
                .build()?;

            let launch_args = MainWindowLaunch {
                window_config,
                window_size,
                window_size_path,
                local_username,
                desktop_target,
                release_channel,
                startup_project_files,
                startup_project_id,
                startup_menu_action,
            };
            if cfg!(debug_assertions) {
                let callback_handle = handle.clone();
                handle.run_on_main_thread(move || create_main_window(callback_handle, launch_args, None, None))?;
            } else {
                let handle = handle.clone();
                thread::spawn(move || {
                    let (api_base_url, startup_error) = match start_studio_server(&handle) {
                        Ok(url) => (Some(url), None),
                        Err(error) => {
                            eprintln!("ARC Studio local service failed to start: {error}");
                            (None, Some(format!("{error} Check desktop-server-process.log in the app logs folder for details.")))
                        }
                    };
                    let callback_handle = handle.clone();
                    if let Err(error) = handle.run_on_main_thread(move || {
                        create_main_window(callback_handle, launch_args, api_base_url, startup_error)
                    }) {
                        eprintln!("Could not open the ARC Studio window after startup: {error}");
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build ARC Studio desktop");

    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            for url in urls {
                if let Ok(path) = url.to_file_path() { notify_project_file_opened(app, &path); }
            }
        }
        RunEvent::Exit => {
            clear_discord_presence_inner(&app.state::<DiscordPresence>());
            if let Some(server) = app.try_state::<StudioServer>() {
                server.shutting_down.store(true, Ordering::SeqCst);
            }
            if let (Ok(config_dir), Some(window_size)) = (app.path().app_config_dir(), app.try_state::<WindowSizeState>()) {
                save_window_dimensions(&config_dir.join("window-size.txt"), &window_size.0);
            }
            stop_studio_server(app);
        }
        _ => {}
    });
}

fn create_main_window<R: tauri::Runtime>(
    app: AppHandle<R>,
    launch: MainWindowLaunch,
    api_base_url: Option<String>,
    startup_error: Option<String>,
) {
    let MainWindowLaunch {
        window_config,
        window_size,
        window_size_path,
        local_username,
        desktop_target,
        release_channel,
        startup_project_files,
        startup_project_id,
        startup_menu_action,
    } = launch;
    let create_result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut window = WebviewWindowBuilder::from_config(&app, &window_config)?
            .inner_size(window_size.width, window_size.height)
            .maximized(window_size.maximized)
            .background_color(tauri::webview::Color(20, 23, 27, 255))
            .visible(false);
        #[cfg(target_os = "linux")]
        if let Some(icon) = app.default_window_icon().cloned() {
            window = window.icon(icon)?;
        }
        let platform = if cfg!(target_os = "macos") { "macos" } else if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "linux") { "linux" } else { "other" };
        let api_base_url = api_base_url
            .as_deref()
            .map(js_string_literal)
            .unwrap_or_else(|| "null".to_string());
        let startup_error = startup_error
            .as_deref()
            .map(js_string_literal)
            .unwrap_or_else(|| "null".to_string());
        let startup_menu_action = startup_menu_action
            .as_deref()
            .map(js_string_literal)
            .unwrap_or_else(|| "null".to_string());
        let init_script = format!(
            "window.__ARC_STUDIO_CONFIG__ = Object.freeze({{ desktop: true, platform: {}, target: {}, releaseChannel: {}, localUsername: {}, apiBaseUrl: {}, startupError: {}, startupProjectId: {} }}); window.__ARC_STUDIO_OPEN_FILES__ = [{}]; window.__ARC_STUDIO_MENU_ACTION__ = {};",
            js_string_literal(platform),
            js_string_literal(&desktop_target),
            js_string_literal(release_channel),
            js_string_literal(&local_username),
            api_base_url,
            startup_error,
            startup_project_id,
            startup_project_files,
            startup_menu_action
        );
        window = window.initialization_script(init_script);

        let window = window.build()?;
        if let Some(pending_actions) = app.try_state::<PendingDesktopMenuActions>() {
            let actions = pending_actions.0.lock().map(|mut actions| std::mem::take(&mut *actions)).unwrap_or_default();
            for action in actions { dispatch_desktop_menu_action(&app, action); }
        }
        let pending_paths = {
            let pending = app.state::<PendingProjectFiles>();
            let mut paths = pending.paths.lock().map_err(|_| {
                io::Error::new(io::ErrorKind::Other, "Pending project files are unavailable.")
            })?;
            pending.main_window_ready.store(true, Ordering::SeqCst);
            std::mem::take(&mut *paths)
        };
        for path in pending_paths {
            let path = js_string_literal(&path);
            let script = format!("window.__ARC_STUDIO_OPEN_FILES__ ||= []; window.__ARC_STUDIO_OPEN_FILES__.push({path}); window.dispatchEvent(new CustomEvent('arc:desktop-file-opened', {{ detail: {path} }}));");
            let _ = window.eval(&script);
        }
        let window_dimensions = Arc::new(Mutex::new(window_size));
        app.manage(WindowSizeState(window_dimensions.clone()));
        let app_handle = app.clone();
        let window_label = window_config.label.clone();
        let save_path = window_size_path.clone();
        let initial_fullscreen = cfg!(target_os = "macos") && window.is_fullscreen().unwrap_or(false);
        if cfg!(target_os = "macos") {
            let _ = window.set_title(if initial_fullscreen { "ARC Studio" } else { "" });
            let value = if initial_fullscreen { "true" } else { "false" };
            let _ = window.eval(&format!("document.documentElement.dataset.arcMacosFullscreen='{value}';"));
        }
        let fullscreen_state = Arc::new(AtomicBool::new(initial_fullscreen));
        let fullscreen_state_for_window = fullscreen_state.clone();
        window.on_window_event(move |event| {
            if cfg!(target_os = "macos") && matches!(event, WindowEvent::Resized(_)) {
                if let Some(event_window) = app_handle.get_webview_window(&window_label) {
                    let fullscreen = event_window.is_fullscreen().unwrap_or(false);
                    if fullscreen_state_for_window.swap(fullscreen, Ordering::SeqCst) != fullscreen {
                        let _ = event_window.set_title(if fullscreen { "ARC Studio" } else { "" });
                        let value = if fullscreen { "true" } else { "false" };
                        let _ = event_window.eval(&format!("document.documentElement.dataset.arcMacosFullscreen='{value}';"));
                    }
                }
            }
            let next_size = match event {
                WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                    if let Some(window) = app_handle.get_webview_window(&window_label) {
                        for path in paths.iter().filter(|path| is_arc_project_path(path) || is_arc_graph_path(path)) {
                            let path = js_string_literal(&path.to_string_lossy());
                            let script = format!("window.__ARC_STUDIO_OPEN_FILES__ ||= []; window.__ARC_STUDIO_OPEN_FILES__.push({path}); window.dispatchEvent(new CustomEvent('arc:desktop-file-opened', {{ detail: {path} }}));");
                            let _ = window.eval(&script);
                        }
                    }
                    None
                }
                WindowEvent::Resized(size) => Some((size.width, size.height, None)),
                WindowEvent::ScaleFactorChanged { scale_factor, new_inner_size, .. } => Some((new_inner_size.width, new_inner_size.height, Some(*scale_factor))),
                WindowEvent::CloseRequested { .. } => {
                    close_desktop_prompt_sessions(&app_handle, Some(&window_label));
                    if let Some(window) = app_handle.get_webview_window(&window_label) {
                        if let Ok(mut dimensions) = window_dimensions.lock() {
                            dimensions.maximized = window.is_maximized().unwrap_or(false);
                        }
                    }
                    save_window_dimensions(&save_path, &window_dimensions);
                    None
                }
                _ => None,
            };
            let Some((width, height, event_scale_factor)) = next_size else { return; };
            let Some(window) = app_handle.get_webview_window(&window_label) else { return; };
            let maximized = window.is_maximized().unwrap_or(false);
            if maximized || window.is_fullscreen().unwrap_or(false) {
                if let Ok(mut dimensions) = window_dimensions.lock() {
                    dimensions.maximized = maximized;
                }
                save_window_dimensions(&save_path, &window_dimensions);
                return;
            }
            let scale_factor = event_scale_factor.unwrap_or_else(|| window.scale_factor().unwrap_or(1.0));
            let logical_width = width as f64 / scale_factor;
            let logical_height = height as f64 / scale_factor;
            let fills_monitor = window.current_monitor().ok().flatten().is_some_and(|monitor| {
                let monitor_scale = monitor.scale_factor().max(1.0);
                let monitor_width = monitor.size().width as f64 / monitor_scale;
                let monitor_height = monitor.size().height as f64 / monitor_scale;
                logical_width >= monitor_width * 0.88 && logical_height >= monitor_height * 0.82
            });
            if fills_monitor { return; }
            if let Ok(mut dimensions) = window_dimensions.lock() {
                dimensions.width = logical_width;
                dimensions.height = logical_height;
                dimensions.maximized = false;
            }
            save_window_dimensions(&save_path, &window_dimensions);
        });
        Ok(())
    })();
    if let Err(error) = create_result {
        eprintln!("Could not create the ARC Studio main window: {error}");
    }
}

#[cfg(target_os = "windows")]
fn windows_10_or_newer() -> bool {
    #[repr(C)]
    struct OsVersionInfo {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        service_pack: [u16; 128],
        service_pack_major: u16,
        service_pack_minor: u16,
        suite_mask: u16,
        product_type: u8,
        reserved: u8,
    }
    #[link(name = "ntdll")]
    unsafe extern "system" { fn RtlGetVersion(version: *mut OsVersionInfo) -> i32; }
    let mut version = OsVersionInfo {
        size: std::mem::size_of::<OsVersionInfo>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        service_pack: [0; 128],
        service_pack_major: 0,
        service_pack_minor: 0,
        suite_mask: 0,
        product_type: 0,
        reserved: 0,
    };
    unsafe {
        RtlGetVersion(&mut version) == 0
            && (version.major > 10 || (version.major == 10 && version.build >= 17134))
    }
}

#[cfg(target_os = "windows")]
fn show_windows_10_required_message() {
    const MB_ICONERROR: u32 = 0x00000010;
    const MB_OK: u32 = 0x00000000;
    let text: Vec<u16> = "ARC Studio requires Windows 10 version 1803 (build 17134) or newer, including Windows 11.".encode_utf16().chain(Some(0)).collect();
    let title: Vec<u16> = "ARC Studio".encode_utf16().chain(Some(0)).collect();
    #[link(name = "user32")]
    unsafe extern "system" { fn MessageBoxW(window: *mut std::ffi::c_void, text: *const u16, title: *const u16, kind: u32) -> i32; }
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_ICONERROR | MB_OK); }
}

#[tauri::command]
fn show_main_window_after_startup(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the main ARC Studio window can be shown after startup.".to_string());
    }
    window.show().map_err(|error| format!("Could not show ARC Studio: {error}"))?;
    if let Some(boot_window) = app.get_webview_window("boot") {
        let _ = boot_window.close();
    }
    window.set_focus().map_err(|error| format!("Could not focus ARC Studio: {error}"))?;
    Ok(())
}

fn restore_window_size<R: tauri::Runtime>(app: &tauri::App<R>, config: &tauri::utils::config::WindowConfig, path: &Path) -> WindowDimensions {
    let minimum_width = config.min_width.unwrap_or(560.0);
    let minimum_height = config.min_height.unwrap_or(420.0);
    let monitor_bounds = app.primary_monitor().ok().flatten().map(|monitor| {
        let scale = monitor.scale_factor().max(1.0);
        (monitor.size().width as f64 / scale, monitor.size().height as f64 / scale)
    });
    let maximum_width = config.max_width.or_else(|| monitor_bounds.map(|bounds| bounds.0)).unwrap_or(10000.0).max(minimum_width);
    let maximum_height = config.max_height.or_else(|| monitor_bounds.map(|bounds| bounds.1)).unwrap_or(10000.0).max(minimum_height);
    let saved = fs::read_to_string(path).ok().and_then(|contents| {
        let mut values = contents.split_whitespace();
        let width = values.next()?.parse::<f64>().ok()?;
        let height = values.next()?.parse::<f64>().ok()?;
        if !width.is_finite() || !height.is_finite() { return None; }
        let maximized = match values.next() {
            None => false,
            Some("maximized") => true,
            Some(_) => return None,
        };
        if values.next().is_some() { return None; }
        Some(WindowDimensions { width, height, maximized })
    });
    let saved = saved.unwrap_or(WindowDimensions { width: config.width, height: config.height, maximized: false });
    WindowDimensions {
        width: saved.width.clamp(minimum_width, maximum_width),
        height: saved.height.clamp(minimum_height, maximum_height),
        maximized: saved.maximized,
    }
}

fn save_window_dimensions(path: &Path, dimensions: &Arc<Mutex<WindowDimensions>>) {
    let Some(parent) = path.parent() else { return; };
    if fs::create_dir_all(parent).is_err() { return; }
    if let Ok(dimensions) = dimensions.lock() {
        let _ = fs::write(path, format!("{:.0} {:.0}{}", dimensions.width, dimensions.height, if dimensions.maximized { " maximized" } else { "" }));
    }
}

fn os_login_name() -> String {
    let raw_name = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default();
    let safe_name = raw_name
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(32)
        .collect::<String>();
    if safe_name.len() >= 2 {
        safe_name
    } else {
        "Admin".to_string()
    }
}

fn js_string_literal(value: &str) -> String {
    let mut escaped = String::from("\"");
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            character if character.is_control() || matches!(character, '\u{2028}' | '\u{2029}') => {
                escaped.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => escaped.push(character),
        }
    }
    escaped.push('"');
    escaped
}

#[cfg(target_os = "windows")]
fn node_compatible_path(path: &Path) -> PathBuf {
    use std::ffi::OsString;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};

    const VERBATIM_PREFIX: [u16; 4] = [92, 92, 63, 92];
    const VERBATIM_UNC_PREFIX: [u16; 8] = [92, 92, 63, 92, 85, 78, 67, 92];
    let wide = path.as_os_str().encode_wide().collect::<Vec<_>>();

    if wide.starts_with(&VERBATIM_UNC_PREFIX) {
        let mut ordinary = vec![92, 92];
        ordinary.extend_from_slice(&wide[VERBATIM_UNC_PREFIX.len()..]);
        PathBuf::from(OsString::from_wide(&ordinary))
    } else if wide.starts_with(&VERBATIM_PREFIX) {
        PathBuf::from(OsString::from_wide(&wide[VERBATIM_PREFIX.len()..]))
    } else {
        path.to_path_buf()
    }
}

#[cfg(not(target_os = "windows"))]
fn node_compatible_path(path: &Path) -> PathBuf {
    path.to_path_buf()
}

fn is_project_directory_name(name: &str) -> bool {
    name.strip_prefix("project_")
        .is_some_and(|uuid| uuid.len() == 36 && uuid.bytes().all(|byte| byte.is_ascii_hexdigit() || byte == b'-'))
}

fn copy_directory_tree(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory_tree(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)?;
        } else {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "A project directory contains an unsupported file type."));
        }
    }
    fs::set_permissions(destination, fs::metadata(source)?.permissions())?;
    Ok(())
}

fn files_match(left: &Path, right: &Path) -> io::Result<bool> {
    let left_metadata = fs::metadata(left)?;
    let right_metadata = fs::metadata(right)?;
    if left_metadata.len() != right_metadata.len() { return Ok(false); }
    let mut left_file = fs::File::open(left)?;
    let mut right_file = fs::File::open(right)?;
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];
    loop {
        let left_read = left_file.read(&mut left_buffer)?;
        let right_read = right_file.read(&mut right_buffer)?;
        if left_read != right_read || left_buffer[..left_read] != right_buffer[..right_read] { return Ok(false); }
        if left_read == 0 { return Ok(true); }
    }
}

fn directories_match(left: &Path, right: &Path) -> io::Result<bool> {
    let mut left_entries = fs::read_dir(left)?.collect::<Result<Vec<_>, _>>()?;
    let mut right_entries = fs::read_dir(right)?.collect::<Result<Vec<_>, _>>()?;
    left_entries.sort_by_key(|entry| entry.file_name());
    right_entries.sort_by_key(|entry| entry.file_name());
    if left_entries.len() != right_entries.len() { return Ok(false); }
    for (left_entry, right_entry) in left_entries.iter().zip(right_entries.iter()) {
        if left_entry.file_name() != right_entry.file_name() { return Ok(false); }
        let left_type = left_entry.file_type()?;
        let right_type = right_entry.file_type()?;
        if left_type.is_dir() && right_type.is_dir() {
            if !directories_match(&left_entry.path(), &right_entry.path())? { return Ok(false); }
        } else if left_type.is_file() && right_type.is_file() {
            if !files_match(&left_entry.path(), &right_entry.path())? { return Ok(false); }
        } else {
            return Ok(false);
        }
    }
    Ok(true)
}

fn migrate_local_project_directories(source_root: &Path, documents_root: &Path) -> Result<(), String> {
    fs::create_dir_all(documents_root).map_err(|error| format!("Could not access Documents/ARC Studio: {error}"))?;
    let source_entries = match fs::read_dir(source_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not read the existing local projects: {error}")),
    };
    for entry in source_entries {
        let entry = entry.map_err(|error| format!("Could not read an existing project folder: {error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_project_directory_name(&name) { continue; }
        let file_type = entry.file_type().map_err(|error| format!("Could not inspect project folder {name}: {error}"))?;
        if !file_type.is_dir() { return Err(format!("The existing project path {name} is not a regular folder.")); }
        let source = entry.path();
        let destination = documents_root.join(&name);
        if destination.exists() {
            let matches = directories_match(&source, &destination).map_err(|error| format!("Could not compare the existing project copies for {name}: {error}"))?;
            if !matches { return Err(format!("Both the app data folder and Documents/ARC Studio contain different data for {name}. Move one copy before starting ARC Studio.")); }
            fs::remove_dir_all(&source).map_err(|error| format!("Could not remove the duplicate old project folder {name}: {error}"))?;
            continue;
        }
        match fs::rename(&source, &destination) {
            Ok(()) => continue,
            Err(error) if matches!(error.raw_os_error(), Some(17 | 18)) => {},
            Err(error) => return Err(format!("Could not move project {name} into Documents/ARC Studio: {error}")),
        }
        let temporary = documents_root.join(format!(".arc-migrating-{name}-{}", std::process::id()));
        if temporary.exists() { fs::remove_dir_all(&temporary).map_err(|error| format!("Could not clear an interrupted project migration: {error}"))?; }
        copy_directory_tree(&source, &temporary).map_err(|error| format!("Could not copy project {name} into Documents/ARC Studio: {error}"))?;
        let matches = directories_match(&source, &temporary).map_err(|error| format!("Could not verify project {name} after copying: {error}"))?;
        if !matches {
            let _ = fs::remove_dir_all(&temporary);
            return Err(format!("Project {name} did not verify after copying into Documents/ARC Studio. The original data was kept."));
        }
        fs::rename(&temporary, &destination).map_err(|error| {
            let _ = fs::remove_dir_all(&temporary);
            format!("Could not finish moving project {name} into Documents/ARC Studio: {error}")
        })?;
        fs::remove_dir_all(&source).map_err(|error| format!("Project {name} was copied successfully but its old copy could not be removed: {error}"))?;
    }
    if fs::read_dir(source_root).is_ok_and(|mut entries| entries.next().is_none()) {
        let _ = fs::remove_dir(source_root);
    }
    Ok(())
}

fn local_documents_permission_error(message: String) -> String {
    #[cfg(target_os = "macos")]
    if message.to_lowercase().contains("permission denied") || message.to_lowercase().contains("operation not permitted") {
        return format!("ARC_DOCUMENTS_PERMISSION_REQUIRED:{message}");
    }
    message
}

fn start_studio_server<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Result<String, Box<dyn std::error::Error>> {
    if app.state::<StudioServer>().shutting_down.load(Ordering::SeqCst) {
        return Err(io::Error::new(io::ErrorKind::Interrupted, "ARC Studio is closing.").into());
    }
    let resource_dir = node_compatible_path(&app.path().resource_dir()?);
    let runtime_dir = resource_dir.join("resources/runtime");
    let app_root = runtime_dir.join("app");
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    let node_path = runtime_dir.join(node_name);
    let entry_path = app_root.join("packages/studio-server/src/index.js");
    if !node_path.is_file() || !entry_path.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "ARC Studio desktop runtime is incomplete. Rebuild the desktop package.",
        )
        .into());
    }

    let data_dir = node_compatible_path(&app.path().app_data_dir()?);
    let config_dir = node_compatible_path(&app.path().app_config_dir()?);
    let documents_directory = app.path().document_dir()
        .map_err(|error| io::Error::other(local_documents_permission_error(error.to_string())))?;
    let documents_root = node_compatible_path(&documents_directory).join("ARC Studio");
    migrate_local_project_directories(&data_dir.join("projects"), &documents_root)
        .map_err(|message| io::Error::other(local_documents_permission_error(message)))?;
    if app.state::<StudioServer>().shutting_down.load(Ordering::SeqCst) {
        return Err(io::Error::new(io::ErrorKind::Interrupted, "ARC Studio is closing.").into());
    }
    let logs_dir = data_dir.join("logs");
    fs::create_dir_all(&data_dir)?;
    fs::create_dir_all(&config_dir)?;
    fs::create_dir_all(&logs_dir)?;
    #[cfg(unix)]
    {
        fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700))?;
        fs::set_permissions(&config_dir, fs::Permissions::from_mode(0o700))?;
        fs::set_permissions(&logs_dir, fs::Permissions::from_mode(0o700))?;
    }

    let port_file = config_dir.join(format!("server-{}.port", std::process::id()));
    let _ = fs::remove_file(&port_file);
    let server_log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs_dir.join("desktop-server-process.log"))?;
    let server_error_log = server_log.try_clone()?;
    let bot_token_key = bot_token_encryption_key()
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    let mut server_command = Command::new(node_path);
    server_command
        .arg(entry_path)
        .current_dir(&app_root)
        .env("ARC_DESKTOP_MODE", "1")
        .env("ARC_DATA_DIR", &data_dir)
        .env("ARC_PROJECTS_DIR", &documents_root)
        .env("ARC_LOG_DIR", &logs_dir)
        .env("ARC_ENV_FILE", config_dir.join("studio.env"))
        .env("ARC_BOT_TOKEN_ENCRYPTION_KEY", bot_token_key)
        .env("ARC_PORT_FILE", &port_file)
        .env(
            "ARC_CORS_ORIGINS",
            "tauri://localhost,http://tauri.localhost",
        )
        .env("HOST", "127.0.0.1")
        .env("PORT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::from(server_log))
        .stderr(Stdio::from(server_error_log));
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        server_command.creation_flags(0x08000000);
    }
    let mut child = server_command.spawn()?;

    let port = match wait_for_server_port(&mut child, &port_file) {
        Ok(port) => port,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error.into());
        }
    };
    let _ = fs::remove_file(port_file);
    let server_state = app.state::<StudioServer>();
    let mut server = server_state.child.lock().map_err(|_| {
        io::Error::new(
            io::ErrorKind::Other,
            "ARC Studio server state is unavailable.",
        )
    })?;
    let mut server_port = server_state.port.lock().map_err(|_| {
        io::Error::new(
            io::ErrorKind::Other,
            "ARC Studio server state is unavailable.",
        )
    })?;
    if server_state.shutting_down.load(Ordering::SeqCst) {
        drop(server_port);
        drop(server);
        let _ = child.kill();
        let _ = child.wait();
        return Err(io::Error::new(io::ErrorKind::Interrupted, "ARC Studio is closing.").into());
    }
    *server = Some(child);
    *server_port = Some(port);
    Ok(format!("http://127.0.0.1:{port}"))
}

fn wait_for_server_port(
    child: &mut Child,
    port_file: &Path,
) -> Result<u16, Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                format!("ARC Studio server exited during startup ({status})."),
            )
            .into());
        }
        if let Ok(value) = fs::read_to_string(port_file) {
            if let Ok(port) = value.trim().parse::<u16>() {
                if port > 0 {
                    return Ok(port);
                }
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "ARC Studio server did not start within 20 seconds.",
    )
    .into())
}

fn stop_studio_server<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let server_state = app.state::<StudioServer>();
    let Ok(mut server) = server_state.child.lock() else {
        return;
    };
    if let Ok(mut port) = server_state.port.lock() {
        *port = None;
    }
    let Some(mut child) = server.take() else {
        return;
    };
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"ARC_STUDIO_SHUTDOWN\n");
        let _ = stdin.flush();
    }
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}
