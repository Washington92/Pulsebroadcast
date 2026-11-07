//! Local-only experimental Program A/V bridge.
//! WebM fragments arrive over Tauri IPC and are written sequentially to FFmpeg stdin.
//! Never pass real stream keys through command-line arguments.
use std::io::Write;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

#[derive(Default)]
pub struct ProgramBridge(pub Mutex<BridgeSession>);

#[derive(Default)]
pub struct BridgeSession {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    bytes_written: u64,
}

fn is_loopback_rtmp(url: &str) -> bool {
    let Some((scheme, rest)) = url.split_once("://") else { return false };
    if scheme != "rtmp" { return false; }
    let Some((host, path)) = rest.split_once('/') else { return false };
    matches!(host, "localhost" | "127.0.0.1" | "localhost:1935" | "127.0.0.1:1935")
        && !path.is_empty()
        && !url.chars().any(char::is_whitespace)
}

impl BridgeSession {
    fn start(&mut self, url: &str, bitrate_kbps: u32) -> Result<(), String> {
        if self.child.is_some() { return Err("A ponte Program já está ativa".into()); }
        if !is_loopback_rtmp(url) { return Err("A ponte experimental aceita somente RTMP local sem chave real".into()); }
        if !(500..=50_000).contains(&bitrate_kbps) { return Err("Bitrate inválido".into()); }
        let mut child = Command::new("ffmpeg")
            .args([
                "-hide_banner", "-nostdin", "-loglevel", "error",
                "-f", "webm", "-i", "pipe:0",
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-b:v", &format!("{bitrate_kbps}k"),
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                "-f", "flv", url,
            ])
            .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|_| "FFmpeg não encontrado para ponte Program".to_string())?;
        let stdin = child.stdin.take().ok_or("Não foi possível abrir entrada do encoder")?;
        self.stdin = Some(stdin);
        self.child = Some(child);
        self.bytes_written = 0;
        Ok(())
    }

    fn push(&mut self, bytes: &[u8]) -> Result<u64, String> {
        if bytes.is_empty() || bytes.len() > 2 * 1024 * 1024 {
            return Err("Fragmento inválido (limite 2 MiB)".into());
        }
        if let Some(child) = self.child.as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("FFmpeg encerrou: {status}"));
            }
        }
        let input = self.stdin.as_mut().ok_or("Ponte Program não iniciada")?;
        input.write_all(bytes).map_err(|e| format!("Falha ao enviar fragmento ao FFmpeg: {e}"))?;
        self.bytes_written += bytes.len() as u64;
        Ok(self.bytes_written)
    }

    fn status(&mut self) -> Result<String, String> {
        let Some(child) = self.child.as_mut() else { return Ok("idle".into()); };
        match child.try_wait() {
            Ok(Some(exit)) => {
                self.stdin.take();
                self.child.take();
                Ok(format!("stopped: {exit}"))
            }
            Ok(None) => Ok(format!("running: {} bytes", self.bytes_written)),
            Err(error) => Err(format!("Falha ao consultar encoder: {error}")),
        }
    }

    fn stop(&mut self) -> Result<(), String> {
        self.stdin.take();
        if let Some(mut child) = self.child.take() {
            match child.try_wait() {
                Ok(Some(_)) => {}
                Ok(None) => {
                    // EOF gives FFmpeg a chance to finalize the muxer.
                    for _ in 0..10 {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        if let Ok(Some(_)) = child.try_wait() { return Ok(()); }
                    }
                    child.kill().map_err(|e| format!("Falha ao encerrar encoder: {e}"))?;
                    child.wait().map_err(|e| format!("Falha ao aguardar encoder: {e}"))?;
                }
                Err(e) => return Err(format!("Falha ao verificar encoder: {e}")),
            }
        }
        Ok(())
    }
}

impl Drop for BridgeSession {
    fn drop(&mut self) { let _ = self.stop(); }
}

#[tauri::command]
pub fn start_program_bridge(
    bridge: tauri::State<'_, ProgramBridge>, url: String, video_bitrate_kbps: u32,
) -> Result<(), String> {
    let mut session = bridge.0.lock().map_err(|_| "Ponte Program indisponível")?;
    session.start(&url, video_bitrate_kbps)
}

#[tauri::command]
pub fn push_program_fragment(
    bridge: tauri::State<'_, ProgramBridge>, bytes: Vec<u8>,
) -> Result<u64, String> {
    let mut session = bridge.0.lock().map_err(|_| "Ponte Program indisponível")?;
    session.push(&bytes)
}

#[tauri::command]
pub fn stop_program_bridge(bridge: tauri::State<'_, ProgramBridge>) -> Result<(), String> {
    let mut session = bridge.0.lock().map_err(|_| "Ponte Program indisponível")?;
    session.stop()
}

#[tauri::command]
pub fn program_bridge_status(bridge: tauri::State<'_, ProgramBridge>) -> Result<String, String> {
    let mut session = bridge.0.lock().map_err(|_| "Ponte Program indisponível")?;
    session.status()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loopback_only() {
        assert!(is_loopback_rtmp("rtmp://127.0.0.1:1935/live/test"));
        assert!(!is_loopback_rtmp("rtmps://example.com/live/key"));
        assert!(!is_loopback_rtmp("rtmp://example.com/live/key"));
        assert!(!is_loopback_rtmp("rtmp://localhost"));
    }
    #[test]
    fn invalid_fragments_rejected() {
        let mut session = BridgeSession::default();
        assert!(session.push(&[]).is_err());
        assert!(session.push(&vec![0; 2 * 1024 * 1024 + 1]).is_err());
    }
}
