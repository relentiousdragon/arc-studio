#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
#[cfg(target_os = "macos")]
use std::ffi::CString;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::{Emitter, Manager, RunEvent, State, Webview, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_updater::UpdaterExt;

const UPDATE_REPOSITORY: &str = match option_env!("ARC_UPDATE_REPOSITORY") {
    Some(repository) => repository,
    None => "relentiousdragon/arc-studio",
};

fn build_release_channel() -> &'static str {
    option_env!("ARC_RELEASE_CHANNEL")
        .filter(|channel| *channel == "nightly" || *channel == "stable")
        .unwrap_or_else(|| {
            if option_env!("CARGO_PKG_VERSION").is_some_and(|version| version.contains('-')) {
                "nightly"
            } else {
                "stable"
            }
        })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientBuildInfo {
    version: &'static str,
    platform: &'static str,
    architecture: &'static str,
}

#[tauri::command]
fn get_client_build_info() -> ClientBuildInfo {
    ClientBuildInfo {
        version: env!("CARGO_PKG_VERSION"),
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
        current_version: update.current_version.clone(),
        version: update.version.clone(),
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
    Ok(Some(StagedUpdateStatus { version: metadata.version, staged: true }))
}

#[tauri::command]
fn read_arc_project_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_arc_project_path(&path) {
        return Err("Choose an .arcproject file.".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not read the project file: {error}"))?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 * 1024 {
        return Err("The project file is too large to open.".to_string());
    }
    fs::read_to_string(path).map_err(|error| format!("Could not read the project file: {error}"))
}

fn is_arc_graph_path(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()).is_some_and(|name| {
        let name = name.to_ascii_lowercase();
        name.ends_with(".arcgraph") || name.ends_with(".arc.json")
    })
}

#[tauri::command]
fn read_arc_graph_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_arc_graph_path(&path) {
        return Err("Choose an .arcgraph file.".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not read the graph file: {error}"))?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 * 1024 {
        return Err("The graph file is too large to open.".to_string());
    }
    fs::read_to_string(path).map_err(|error| format!("Could not read the graph file: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectExportReceipt {
    path: String,
    revealed: bool,
}

#[tauri::command]
fn save_project_export<R: tauri::Runtime>(app: tauri::AppHandle<R>, filename: String, contents: String) -> Result<ProjectExportReceipt, String> {
    if contents.len() > 128 * 1024 * 1024 {
        return Err("The project export is too large to save.".to_string());
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
    let path = loop {
        let name = if suffix == 0 { format!("{stem}.arcproject") } else { format!("{stem} ({suffix}).arcproject") };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                #[cfg(unix)]
                file.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|error| format!("Could not secure the project export: {error}"))?;
                file.write_all(contents.as_bytes()).map_err(|error| {
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
fn open_project_window(project_id: String) -> Result<(), String> {
    let valid_id = project_id.strip_prefix("project_").is_some_and(|uuid| {
        uuid.len() == 36 && uuid.chars().enumerate().all(|(index, character)| {
            if [8, 13, 18, 23].contains(&index) { character == '-' }
            else { character.is_ascii_hexdigit() }
        })
    });
    if !valid_id { return Err("That project ID is not valid.".to_string()); }
    let executable = std::env::current_exe().map_err(|error| format!("Could not locate ARC Studio: {error}"))?;
    Command::new(executable)
        .arg("--arc-project-id")
        .arg(project_id)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the project in a new window: {error}"))
}

fn is_arc_project_path(path: &Path) -> bool {
    path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("arcproject"))
}

#[cfg(target_os = "macos")]
fn notify_project_file_opened<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: &Path) {
    if !is_arc_project_path(path) && !is_arc_graph_path(path) { return; }
    let Some(window) = app.get_webview_window("main") else { return; };
    let path = js_string_literal(&path.to_string_lossy());
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
}
struct DiscordPresence {
    client: Mutex<Option<DiscordIpcClient>>,
    started_at_ms: Mutex<Option<i64>>,
}
struct WindowSizeState(Arc<Mutex<WindowDimensions>>);
#[derive(Clone, Copy)]
struct WindowDimensions { width: f64, height: f64, maximized: bool }
const DISCORD_APPLICATION_ID: &str = "1559947417699360821";
const ARC_GITHUB_URL: &str = "https://github.com/relentiousdragon/arc-studio";
const NIGHTLY_RPC_ICON_URL: &str = "https://raw.githubusercontent.com/relentiousdragon/arc-studio/main/packages/studio-desktop/src-tauri/icons/nightly-icon.png";

#[tauri::command]
fn update_discord_presence(
    presence: State<'_, DiscordPresence>,
    details: String,
    state_text: String,
    activity_type: u8,
) -> Result<(), String> {
    let details = presence_text(&details);
    let state_text = presence_text(&state_text);
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
        .timestamps(activity::Timestamps::new().start(started_at_ms))
        .buttons(vec![activity::Button::new("GitHub", ARC_GITHUB_URL)]);
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
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            save_project_export,
            open_project_window,
            reset_local_data,
            open_external_url,
            open_macos_files_folders_settings,
            check_channel_update,
            install_channel_update,
            install_staged_update,
            get_staged_update_status,
            mark_update_healthy,
            update_discord_presence,
            clear_discord_presence,
            restart_app
        ])
        .on_menu_event(|app, event| {
            let action = event.id().as_ref();
            if action == "help.github" {
                let _ = open_external_url("https://github.com/relentiousdragon/arc-studio".to_string());
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                let script = format!(
                    "window.dispatchEvent(new CustomEvent('arc:desktop-menu-action', {{ detail: {} }}));",
                    js_string_literal(action)
                );
                let _ = window.eval(&script);
            }
        })
        .manage(StudioServer { child: Mutex::new(None), port: Mutex::new(None) })
        .manage(DiscordPresence {
            client: Mutex::new(None),
            started_at_ms: Mutex::new(None),
        })
        .setup(|app| {
            mark_update_starting(app.handle());
            use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
            let handle = app.handle();
            let new_graph = MenuItemBuilder::with_id("file.new-graph", "New Graph").accelerator("CmdOrCtrl+T").build(handle)?;
            let new_blank_graph = MenuItemBuilder::with_id("file.new-blank-graph", "New Blank Graph").accelerator("CmdOrCtrl+Shift+T").build(handle)?;
            let open_graph = MenuItemBuilder::with_id("file.open-graph", "Open Graph File…").accelerator("CmdOrCtrl+O").build(handle)?;
            let open_project = MenuItemBuilder::with_id("file.open-project", "Import Project File…").build(handle)?;
            let save_graph = MenuItemBuilder::with_id("file.save-graph", "Save Graph").accelerator("CmdOrCtrl+S").build(handle)?;
            let export_graph = MenuItemBuilder::with_id("file.export-graph", "Export Graph…").build(handle)?;
            let export_project = MenuItemBuilder::with_id("file.export-project", "Export Project…").build(handle)?;
            let file_menu = SubmenuBuilder::new(handle, "File")
                .item(&new_graph).item(&new_blank_graph).separator().item(&open_graph).item(&open_project)
                .separator().item(&save_graph).item(&export_graph).item(&export_project).build()?;

            let undo = MenuItemBuilder::with_id("edit.undo", "Undo").accelerator("CmdOrCtrl+Z").build(handle)?;
            let redo_accelerator = if cfg!(target_os = "macos") { "CmdOrCtrl+Shift+Z" } else { "CmdOrCtrl+Y" };
            let redo = MenuItemBuilder::with_id("edit.redo", "Redo").accelerator(redo_accelerator).build(handle)?;
            let cut = PredefinedMenuItem::cut(handle, None)?;
            let copy = PredefinedMenuItem::copy(handle, None)?;
            let paste = PredefinedMenuItem::paste(handle, None)?;
            let select_all = PredefinedMenuItem::select_all(handle, None)?;
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .item(&undo).item(&redo).separator().item(&cut).item(&copy).item(&paste).separator().item(&select_all).build()?;

            let library = MenuItemBuilder::with_id("view.library", "Toggle Library").accelerator("Shift+L").build(handle)?;
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
            let help_menu = SubmenuBuilder::new(handle, "Help").item(&help_shortcuts).separator().item(&github).build()?;
            let menu_builder = MenuBuilder::new(handle);
            #[cfg(target_os = "macos")]
            let menu_builder = {
                let about = PredefinedMenuItem::about(handle, None, None)?;
                let hide = PredefinedMenuItem::hide(handle, None)?;
                let hide_others = PredefinedMenuItem::hide_others(handle, None)?;
                let quit = PredefinedMenuItem::quit(handle, None)?;
                let app_menu = SubmenuBuilder::new(handle, "ARC Studio")
                    .item(&about).separator().item(&hide).item(&hide_others).separator().item(&quit).build()?;
                menu_builder.item(&app_menu)
            };
            let menu = menu_builder.item(&file_menu).item(&edit_menu).item(&view_menu).item(&window_menu).item(&help_menu).build()?;
            app.set_menu(menu)?;
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
            let (api_base_url, startup_error) = if !cfg!(debug_assertions) {
                match start_studio_server(app) {
                    Ok(url) => (Some(url), None),
                    Err(error) => {
                        eprintln!("ARC Studio local service failed to start: {error}");
                        (None, Some(format!("{error} Check desktop-server-process.log in the app logs folder for details.")))
                    }
                }
            } else {
                (None, None)
            };
            let mut window = WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                .inner_size(window_size.width, window_size.height);
            #[cfg(target_os = "linux")]
            if let Some(icon) = app.default_window_icon().cloned() {
                window = window.icon(icon)?;
            }
            let local_username = os_login_name();
            let api_base_url = api_base_url
                .as_deref()
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let startup_error = startup_error
                .as_deref()
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let platform = if cfg!(target_os = "macos") { "macos" } else if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "linux") { "linux" } else { "other" };
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
            let startup_project_id = startup_args.windows(2)
                .find(|pair| pair[0] == "--arc-project-id")
                .and_then(|pair| pair[1].to_str())
                .filter(|id| id.strip_prefix("project_").is_some_and(|uuid| uuid.len() == 36))
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let init_script = format!(
                "window.__ARC_STUDIO_CONFIG__ = Object.freeze({{ desktop: true, platform: {}, target: {}, releaseChannel: {}, localUsername: {}, apiBaseUrl: {}, startupError: {}, startupProjectId: {} }}); window.__ARC_STUDIO_OPEN_FILES__ = [{}];",
                js_string_literal(platform),
                js_string_literal(&desktop_target),
                js_string_literal(release_channel),
                js_string_literal(&local_username),
                api_base_url,
                startup_error,
                startup_project_id,
                startup_project_files
            );
            window = window.initialization_script(init_script);

            let window = window.build()?;
            if window_size.maximized { let _ = window.maximize(); }
            let window_dimensions = Arc::new(Mutex::new(window_size));
            app.manage(WindowSizeState(window_dimensions.clone()));
            let app_handle = app.handle().clone();
            let window_label = window_config.label.clone();
            let save_path = window_size_path.clone();
            window.on_window_event(move |event| {
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
            if let (Ok(config_dir), Some(window_size)) = (app.path().app_config_dir(), app.try_state::<WindowSizeState>()) {
                save_window_dimensions(&config_dir.join("window-size.txt"), &window_size.0);
            }
            stop_studio_server(app);
        }
        _ => {}
    });
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
    app: &mut tauri::App<R>,
) -> Result<String, Box<dyn std::error::Error>> {
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
    *server = Some(child);
    *server_state.port.lock().map_err(|_| io::Error::new(io::ErrorKind::Other, "ARC Studio server state is unavailable."))? = Some(port);
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
