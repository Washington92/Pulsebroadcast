use std::process::Command;

/// Checks for a local FFmpeg executable. This does not start a broadcast.
#[tauri::command]
pub fn probe_encoder() -> Result<String, String> {
    let output = Command::new("ffmpeg")
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
