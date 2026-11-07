//! Native output lifecycle. No UI, canvas or FFmpeg dependency.
use std::process::{Child, ExitStatus};
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputState { Idle, Starting, Live, Stopping, Failed }

impl OutputState {
    pub fn as_str(self) -> &'static str {
        match self { Self::Idle => "idle", Self::Starting => "starting", Self::Live => "live", Self::Stopping => "stopping", Self::Failed => "failed" }
    }
}

pub struct OutputSession {
    state: OutputState,
    child: Option<Child>,
    last_error: Option<String>,
}

impl Default for OutputSession {
    fn default() -> Self { Self { state: OutputState::Idle, child: None, last_error: None } }
}

impl OutputSession {
    pub fn state(&self) -> OutputState { self.state }
    pub fn last_error(&self) -> Option<&str> { self.last_error.as_deref() }
    pub fn begin(&mut self) -> Result<(), String> {
        if self.state != OutputState::Idle && self.state != OutputState::Failed {
            return Err("Já existe uma saída ativa ou em inicialização".into());
        }
        if self.child.is_some() { return Err("Processo anterior ainda está ativo".into()); }
        self.last_error = None;
        self.state = OutputState::Starting;
        Ok(())
    }
    pub fn attach(&mut self, child: Child) -> Result<(), String> {
        if self.state != OutputState::Starting { return Err("Saída não está iniciando".into()); }
        self.child = Some(child);
        // A spawned process is not proof of an established RTMP connection.
        Ok(())
    }
    pub fn mark_live(&mut self) -> Result<(), String> {
        if self.state != OutputState::Starting || self.child.is_none() {
            return Err("Processo de saída não está pronto".into());
        }
        self.state = OutputState::Live;
        Ok(())
    }
    pub fn fail(&mut self, message: &str) {
        self.state = OutputState::Failed;
        // Do not retain process stderr or destination URLs: they can contain stream keys.
        self.last_error = Some(message.to_string());
    }
    pub fn poll(&mut self) -> Result<OutputState, String> {
        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    self.child = None;
                    if self.state == OutputState::Stopping { self.state = OutputState::Idle; }
                    else { self.fail(if status.success() { "Encoder finalizado" } else { "Encoder encerrou com falha" }); }
                }
                Ok(None) => {}
                Err(_) => { self.fail("Não foi possível consultar o encoder"); }
            }
        }
        Ok(self.state)
    }
    pub fn stop(&mut self) -> Result<(), String> {
        if self.child.is_none() {
            self.state = OutputState::Idle;
            return Ok(());
        }
        self.state = OutputState::Stopping;
        if let Some(mut child) = self.child.take() {
            // Bounded termination: kill/wait prevents orphan encoder processes.
            if child.try_wait().map_err(|_| "Falha ao consultar encoder")?.is_none() {
                child.kill().map_err(|_| "Falha ao interromper encoder")?;
            }
            child.wait().map_err(|_| "Falha ao aguardar encerramento")?;
        }
        self.state = OutputState::Idle;
        Ok(())
    }
}

impl Drop for OutputSession {
    fn drop(&mut self) { let _ = self.stop(); }
}

#[derive(Default)]
pub struct OutputManager(pub Mutex<OutputSession>);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn starts_idle_and_rejects_duplicate_start() {
        let mut s = OutputSession::default();
        assert_eq!(s.state(), OutputState::Idle);
        s.begin().unwrap();
        assert_eq!(s.state(), OutputState::Starting);
        assert!(s.begin().is_err());
    }
    #[test]
    fn failed_session_can_be_reset() {
        let mut s = OutputSession::default();
        s.begin().unwrap();
        s.fail("Erro genérico");
        assert_eq!(s.state(), OutputState::Failed);
        s.begin().unwrap();
        assert_eq!(s.last_error(), None);
        s.stop().unwrap();
        assert_eq!(s.state(), OutputState::Idle);
    }
    #[test]
    fn cannot_mark_live_without_encoder() {
        let mut s = OutputSession::default();
        s.begin().unwrap();
        assert!(s.mark_live().is_err());
    }
    #[test]
    fn snapshots_use_expected_state_names() {
        assert_eq!(OutputState::Starting.as_str(), "starting");
        assert_eq!(OutputState::Stopping.as_str(), "stopping");
        assert_eq!(OutputState::Live.as_str(), "live");
    }
}
