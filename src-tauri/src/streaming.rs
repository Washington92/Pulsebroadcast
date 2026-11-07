use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{State, AppHandle};
use crate::encoder_path::ffmpeg_path;
use crate::output_manager::{OutputManager, OutputState};

/// Checks for a local FFmpeg executable. This does not start a broadcast.
#[tauri::command]
pub fn probe_encoder(app: AppHandle) -> Result<String, String> {
    let output = Command::new(ffmpeg_path(&app)?)
        .arg("-version")
        .output()
        .map_err(|_| "FFmpeg não encontrado no PATH. A transmissão nativa ainda não está disponível.".to_string())?;
    if !output.status.success() {
        return Err("FFmpeg encontrado, mas não pôde ser executado.".into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().next().unwrap_or("FFmpeg disponível").to_string())
}

/// Validates non-secret destination metadata before a future native RTMP session.
#[tauri::command]
pub fn validate_rtmp_destination(url: String, video_bitrate_kbps: u32) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("rtmp://") || trimmed.starts_with("rtmps://")) {
        return Err("O servidor deve usar rtmp:// ou rtmps://".into());
    }
    let authority = trimmed.split_once("://").map(|(_, rest)| rest.split('/').next().unwrap_or("")).unwrap_or("");
    if authority.is_empty() || authority.contains('@') || authority.chars().any(char::is_whitespace) {
        return Err("Endereço do servidor RTMP inválido.".into());
    }
    if !(500..=50_000).contains(&video_bitrate_kbps) {
        return Err("Bitrate deve ficar entre 500 e 50000 kbps.".into());
    }
    Ok(())
}

/// Synthetic A/V test only. Restrict destinations to loopback to avoid exposing
/// production stream keys in operating-system process command lines.
#[tauri::command]
pub fn start_synthetic_stream(
    app: AppHandle,
    manager: State<'_, OutputManager>,
    url: String,
    video_bitrate_kbps: u32,
) -> Result<String, String> {
    validate_rtmp_destination(url.clone(), video_bitrate_kbps)?;
    let host = url.split_once("://").and_then(|(_, rest)| rest.split('/').next()).unwrap_or("");
    if !matches!(host, "localhost" | "127.0.0.1" | "127.0.0.1:1935" | "localhost:1935") {
        return Err("Teste sintético restrito ao servidor RTMP local. Não use chaves reais.".into());
    }
    let mut session = manager.0.lock().map_err(|_| "Gerenciador indisponível")?;
    session.poll()?;
    session.begin()?;
    let result = Command::new("ffmpeg")
        .args([
            "-hide_banner", "-nostdin", "-loglevel", "error",
            "-re", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
            "-re", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-b:v", &format!("{video_bitrate_kbps}k"),
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            "-f", "flv", &url,
        ])
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn();
    match result {
        Ok(child) => {
            session.attach(child)?;
            // Live here means the encoder process is running, NOT proof that
            // the RTMP ingest server accepted the stream.
            std::thread::sleep(Duration::from_millis(300));
            match session.poll()? {
                OutputState::Starting => {
                    session.mark_live()?;
                    Ok("Encoder sintético em execução; confirme a recepção no servidor local.".into())
                }
                _ => Err("Encoder encerrou durante a inicialização; verifique o servidor RTMP local.".into()),
            }
        }
        Err(_) => {
            session.fail("FFmpeg não pôde ser iniciado");
            Err("FFmpeg não encontrado ou indisponível".into())
        }
    }
}

#[tauri::command]
pub fn synthetic_stream_status(manager: State<'_, OutputManager>) -> Result<String, String> {
    let mut session = manager.0.lock().map_err(|_| "Gerenciador indisponível")?;
    Ok(session.poll()?.as_str().to_string())
}

#[tauri::command]
pub fn stop_synthetic_stream(manager: State<'_, OutputManager>) -> Result<(), String> {
    let mut session = manager.0.lock().map_err(|_| "Gerenciador indisponível")?;
    session.stop()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_bad_destinations() {
        assert!(validate_rtmp_destination("https://example.com/live".into(), 6000).is_err());
        assert!(validate_rtmp_destination("rtmps://".into(), 6000).is_err());
        assert!(validate_rtmp_destination("rtmp://host/live".into(), 100).is_err());
    }
    #[test]
    fn accepts_rtmp_and_rtmps() {
        assert!(validate_rtmp_destination("rtmp://localhost/live".into(), 6000).is_ok());
        assert!(validate_rtmp_destination("rtmps://example.com/live".into(), 4500).is_ok());
    }
}
