//! Experimental native libobs lifecycle for the wMix desktop process.
//! Initialization does not create video/audio outputs or load plugins.
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::Path;
use std::sync::Mutex;

use libloading::Library;
use serde::Serialize;

type ObsStartup = unsafe extern "C" fn(*const c_char, *const c_char, *mut c_void) -> bool;
type ObsShutdown = unsafe extern "C" fn();
type ObsVersion = unsafe extern "C" fn() -> *const c_char;

struct LoadedObs {
    // Library must outlive any function pointer resolved from it.
    library: Library,
    shutdown: ObsShutdown,
    version: String,
}

#[derive(Default)]
pub struct LibobsRuntime {
    loaded: Mutex<Option<LoadedObs>>,
}

#[derive(Serialize)]
pub struct LibobsRuntimeStatus {
    pub initialized: bool,
    pub version: Option<String>,
    pub message: String,
}

impl LibobsRuntime {
    fn start(&self, path: String) -> Result<LibobsRuntimeStatus, String> {
        let mut loaded = self.loaded.lock().map_err(|_| "Estado libobs indisponível")?;
        if loaded.is_some() {
            return Err("libobs já está inicializada no wMix.".into());
        }
        let file = Path::new(&path);
        if !file.is_absolute()
            || !file.file_name().and_then(|n| n.to_str()).unwrap_or("").eq_ignore_ascii_case("obs.dll")
        {
            return Err("Informe o caminho absoluto e confiável para obs.dll.".into());
        }
        let canonical = file.canonicalize().map_err(|e| format!("DLL não encontrada: {e}"))?;
        if !canonical.is_file() {
            return Err("O caminho não aponta para um arquivo.".into());
        }

        // SAFETY: the caller explicitly selects a trusted DLL. This is NOT a sandbox:
        // loading a DLL executes native code. Keep the library alive until shutdown.
        let library = unsafe { Library::new(&canonical) }
            .map_err(|e| format!("Não foi possível carregar libobs e dependências: {e}"))?;
        let (startup, shutdown, version) = unsafe {
            let startup: ObsStartup = *library.get::<ObsStartup>(b"obs_startup\0")
                .map_err(|e| format!("obs_startup ausente: {e}"))?;
            let shutdown: ObsShutdown = *library.get::<ObsShutdown>(b"obs_shutdown\0")
                .map_err(|e| format!("obs_shutdown ausente: {e}"))?;
            let version: ObsVersion = *library.get::<ObsVersion>(b"obs_get_version_string\0")
                .map_err(|e| format!("obs_get_version_string ausente: {e}"))?;
            (startup, shutdown, version)
        };
        let locale = CString::new("pt-BR").expect("static locale");
        // SAFETY: signatures match the libobs C ABI; the profiler pointer may be null.
        let started = unsafe { startup(locale.as_ptr(), std::ptr::null(), std::ptr::null_mut()) };
        if !started {
            return Err("obs_startup falhou. Verifique logs e dependências da libobs.".into());
        }
        let version_text = unsafe {
            let ptr = version();
            if ptr.is_null() { "desconhecida".into() }
            else { CStr::from_ptr(ptr).to_string_lossy().into_owned() }
        };
        *loaded = Some(LoadedObs { library, shutdown, version: version_text.clone() });
        Ok(LibobsRuntimeStatus {
            initialized: true,
            version: Some(version_text),
            message: "libobs inicializada. Vídeo, áudio e fontes ainda não configurados.".into(),
        })
    }

    fn stop(&self) -> Result<LibobsRuntimeStatus, String> {
        let mut loaded = self.loaded.lock().map_err(|_| "Estado libobs indisponível")?;
        if let Some(runtime) = loaded.take() {
            // SAFETY: runtime holds the library until obs_shutdown returns.
            unsafe { (runtime.shutdown)() };
            drop(runtime.library);
        }
        Ok(LibobsRuntimeStatus {
            initialized: false, version: None, message: "libobs encerrada.".into()
        })
    }

    fn status(&self) -> Result<LibobsRuntimeStatus, String> {
        let loaded = self.loaded.lock().map_err(|_| "Estado libobs indisponível")?;
        Ok(LibobsRuntimeStatus {
            initialized: loaded.is_some(), version: loaded.as_ref().map(|runtime| runtime.version.clone()),
            message: if loaded.is_some() { "libobs inicializada (sem pipeline de mídia).".into() }
                     else { "libobs não inicializada.".into() }
        })
    }
}

impl Drop for LibobsRuntime {
    fn drop(&mut self) {
        // Ensure native OBS resources are released before unloading the DLL.
        // This is a last-resort cleanup, not a replacement for orderly stop_libobs.
        if let Ok(loaded) = self.loaded.get_mut() {
            if let Some(runtime) = loaded.take() {
                // SAFETY: the library remains loaded while shutdown executes.
                unsafe { (runtime.shutdown)() };
                drop(runtime.library);
            }
        }
    }
}

#[tauri::command]
pub fn start_libobs(runtime: tauri::State<'_, LibobsRuntime>, path: String) -> Result<LibobsRuntimeStatus, String> {
    runtime.start(path)
}

#[tauri::command]
pub fn stop_libobs(runtime: tauri::State<'_, LibobsRuntime>) -> Result<LibobsRuntimeStatus, String> {
    runtime.stop()
}

#[tauri::command]
pub fn libobs_status(runtime: tauri::State<'_, LibobsRuntime>) -> Result<LibobsRuntimeStatus, String> {
    runtime.status()
}

#[cfg(test)]
mod tests {
    use super::LibobsRuntime;
    #[test]
    fn rejects_non_absolute_path() {
        assert!(LibobsRuntime::default().start("obs.dll".into()).is_err());
    }
    #[test]
    fn stopping_uninitialized_runtime_is_idempotent() {
        let runtime = LibobsRuntime::default();
        assert!(!runtime.stop().unwrap().initialized);
        assert!(!runtime.status().unwrap().initialized);
    }
    #[test]
    fn rejects_unrelated_dll_before_loading() {
        let runtime = LibobsRuntime::default();
        let path = if cfg!(windows) { r"C:\\Windows\\System32\\kernel32.dll" } else { "/usr/lib/other.dll" };
        assert!(runtime.start(path.into()).is_err());
        assert!(!runtime.status().unwrap().initialized);
    }
    #[test]
    fn rejects_missing_absolute_obs_dll() {
        let runtime = LibobsRuntime::default();
        let path = if cfg!(windows) { r"C:\\wmix-test-nonexistent\\obs.dll" } else { "/wmix-test-nonexistent/obs.dll" };
        assert!(runtime.start(path.into()).is_err());
        assert!(!runtime.status().unwrap().initialized);
    }
    #[test]
    fn starts_stopped() {
        assert!(!LibobsRuntime::default().status().unwrap().initialized);
    }
}
