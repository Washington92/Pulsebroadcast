//! Experimental native libobs lifecycle for the wMix desktop process.
//! Initializes the Windows video pipeline for the validated OBS 33.0.1 runtime.
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::Path;
use std::sync::Mutex;

use libloading::Library;
use serde::Serialize;

type ObsStartup = unsafe extern "C" fn(*const c_char, *const c_char, *mut c_void) -> bool;
type ObsShutdown = unsafe extern "C" fn();
type ObsVersion = unsafe extern "C" fn() -> *const c_char;

// Layout from OBS Studio 33.0.1 libobs/obs.h.
#[cfg(windows)]
#[repr(C)]
struct ObsVideoInfo {
    graphics_module: *const c_char,
    fps_num: u32,
    fps_den: u32,
    base_width: u32,
    base_height: u32,
    output_width: u32,
    output_height: u32,
    output_format: i32,
    adapter: u32,
    gpu_conversion: bool,
    colorspace: i32,
    range: i32,
    scale_type: i32,
}

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
    pub video_ready: bool,
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
        #[cfg(windows)]
        let library = unsafe {
            use libloading::os::windows::{
                Library as WindowsLibrary, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR,
            };
            WindowsLibrary::load_with_flags(
                &canonical,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            )
            .map(Library::from)
        };
        #[cfg(not(windows))]
        let library = unsafe { Library::new(&canonical) };
        let library = library.map_err(|e| {
            format!("Não foi possível carregar {} e suas dependências: {e}", canonical.display())
        })?;
        let (startup, shutdown, version) = unsafe {
            let startup: ObsStartup = *library.get::<ObsStartup>(b"obs_startup\0")
                .map_err(|e| format!("obs_startup ausente: {e}"))?;
            let shutdown: ObsShutdown = *library.get::<ObsShutdown>(b"obs_shutdown\0")
                .map_err(|e| format!("obs_shutdown ausente: {e}"))?;
            let version: ObsVersion = *library.get::<ObsVersion>(b"obs_get_version_string\0")
                .map_err(|e| format!("obs_get_version_string ausente: {e}"))?;
            (startup, shutdown, version)
        };
        // Reject incompatible ABIs before calling obs_startup: the video-info layout
        // and initialization sequence below are validated only for OBS 33.0.1.
        let version_text = unsafe {
            let ptr = version();
            if ptr.is_null() {
                return Err("libobs retornou versão nula.".into());
            }
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        };
        #[cfg(windows)]
        if !supports_video_abi(&version_text) {
            return Err(format!(
                "A integração de vídeo exige libobs 33.0.1; encontrada: {version_text}"
            ));
        }
        let locale = CString::new("pt-BR").expect("static locale");
        // SAFETY: signatures match the libobs C ABI; the profiler pointer may be null.
        let started = unsafe { startup(locale.as_ptr(), std::ptr::null(), std::ptr::null_mut()) };
        if !started {
            return Err("obs_startup falhou. Verifique logs e dependências da libobs.".into());
        }
        let runtime = LoadedObs { library, shutdown, version: version_text.clone() };
        #[cfg(windows)]
        runtime.initialize_video(&canonical)?;
        *loaded = Some(runtime);
        Ok(LibobsRuntimeStatus {
            initialized: true,
            video_ready: cfg!(windows),
            version: Some(version_text),
            message: if cfg!(windows) { "Vídeo libobs configurado em 1280×720 a 30 FPS.".into() }
                     else { "libobs inicializada sem vídeo.".into() },
        })
    }

    fn stop(&self) -> Result<LibobsRuntimeStatus, String> {
        let mut loaded = self.loaded.lock().map_err(|_| "Estado libobs indisponível")?;
        drop(loaded.take());
        Ok(LibobsRuntimeStatus {
            initialized: false, video_ready: false, version: None, message: "libobs encerrada.".into()
        })
    }

    fn status(&self) -> Result<LibobsRuntimeStatus, String> {
        let loaded = self.loaded.lock().map_err(|_| "Estado libobs indisponível")?;
        Ok(LibobsRuntimeStatus {
            initialized: loaded.is_some(), video_ready: cfg!(windows) && loaded.is_some(), version: loaded.as_ref().map(|runtime| runtime.version.clone()),
            message: if cfg!(windows) && loaded.is_some() { "Vídeo libobs configurado em 1280×720 a 30 FPS.".into() }
                     else if loaded.is_some() { "libobs inicializada sem vídeo.".into() }
                     else { "libobs não inicializada.".into() }
        })
    }
}

#[cfg(windows)]
fn supports_video_abi(version: &str) -> bool {
    version == "33.0.1"
}

#[cfg(windows)]
impl LoadedObs {
    fn initialize_video(&self, dll: &Path) -> Result<(), String> {
        let graphics = dll.with_file_name("libobs-d3d11.dll");
        if !graphics.is_file() {
            return Err(format!("Módulo D3D11 não encontrado: {}", graphics.display()));
        }
        let graphics = CString::new(graphics.to_str().ok_or("Caminho D3D11 inválido")?)
            .map_err(|_| "Caminho D3D11 inválido")?;
        let data = dll.parent().and_then(Path::parent).and_then(Path::parent)
            .ok_or("Instalação OBS incompleta")?.join("data").join("libobs");
        if !data.join("default.effect").is_file() {
            return Err(format!("Dados da libobs não encontrados: {}", data.display()));
        }
        let data = data.to_str().ok_or("Caminho de dados inválido")?;
        // libobs appends shader names to this path. Extended Windows paths
        // do not accept the forward slashes used by its data-file lookup.
        let data = if let Some(unc) = data.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{unc}")
        } else {
            data.strip_prefix(r"\\?\").unwrap_or(data).to_owned()
        };
        let data = CString::new(format!("{data}/"))
            .map_err(|_| "Caminho de dados inválido")?;
        let mut info = ObsVideoInfo {
            graphics_module: graphics.as_ptr(),
            fps_num: 30,
            fps_den: 1,
            base_width: 1280,
            base_height: 720,
            output_width: 1280,
            output_height: 720,
            output_format: 2, // VIDEO_FORMAT_NV12
            adapter: 0,
            gpu_conversion: true,
            colorspace: 2, // VIDEO_CS_709
            range: 1, // VIDEO_RANGE_PARTIAL
            scale_type: 0, // OBS_SCALE_DISABLE
        };
        // The version guard matches the C layout and the module path lives through the call.
        let result = unsafe {
            let reset = self.library
                .get::<unsafe extern "C" fn(*mut ObsVideoInfo) -> i32>(b"obs_reset_video\0")
                .map_err(|error| format!("obs_reset_video ausente: {error}"))?;
            let add_data_path = self.library
                .get::<unsafe extern "C" fn(*const c_char)>(b"obs_add_data_path\0")
                .map_err(|error| format!("obs_add_data_path ausente: {error}"))?;
            add_data_path(data.as_ptr());
            reset(&mut info)
        };
        if result != 0 {
            return Err(format!("obs_reset_video falhou (código {result})."));
        }
        Ok(())
    }
}

impl Drop for LoadedObs {
    fn drop(&mut self) {
        // The library field remains loaded until shutdown returns.
        unsafe { (self.shutdown)() };
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
    #[cfg(windows)]
    use super::supports_video_abi;
    #[cfg(windows)]
    #[test]
    fn rejects_unvalidated_video_abi_versions() {
        assert!(supports_video_abi("33.0.1"));
        assert!(!supports_video_abi("33.0.0"));
        assert!(!supports_video_abi("34.0.0"));
        assert!(!supports_video_abi(""));
    }
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
