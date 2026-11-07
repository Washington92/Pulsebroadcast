//! Resolve the packaged encoder on Windows. Development builds on other OSes
//! may use FFmpeg from PATH; packaged Windows builds must not silently do so.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;

pub fn ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let path = app.path().resolve("resources/ffmpeg.exe", BaseDirectory::Resource)
            .map_err(|e| format!("Não foi possível localizar o encoder integrado: {e}"))?;
        if !path.is_file() {
            return Err(format!("FFmpeg integrado ausente: {}", path.display()));
        }
        Ok(path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok(PathBuf::from("ffmpeg"))
    }
}
