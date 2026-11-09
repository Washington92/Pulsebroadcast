//! Windows-only discovery of a local libobs binary. This is not yet a video engine.
use std::path::Path;

#[derive(serde::Serialize)]
pub struct LibobsProbe {
    pub available: bool,
    pub path: Option<String>,
    pub message: String,
}

/// Explicit path only: never search the current directory or load arbitrary DLLs.
/// Discovery is intentionally separate from loading libobs and its plugin dependencies.
#[tauri::command]
pub fn probe_libobs(path: String) -> Result<LibobsProbe, String> {
    let requested = Path::new(&path);
    if !requested.is_absolute() {
        return Err("Informe um caminho absoluto para obs.dll.".into());
    }
    let filename = requested.file_name().and_then(|name| name.to_str()).unwrap_or_default();
    if !filename.eq_ignore_ascii_case("obs.dll") {
        return Err("O arquivo esperado no Windows é obs.dll (libobs).".into());
    }
    let resolved = match requested.canonicalize() {
        Ok(value) => value,
        Err(_) => return Ok(LibobsProbe {
            available: false,
            path: None,
            message: "obs.dll não encontrado no caminho informado.".into(),
        }),
    };
    if !resolved.is_file() {
        return Err("O caminho informado não é um arquivo.".into());
    }
    Ok(LibobsProbe {
        available: true,
        path: Some(resolved.display().to_string()),
        message: "Arquivo encontrado. Carregamento, ABI, plugins e inicialização ainda não validados.".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::probe_libobs;
    #[test]
    fn rejects_relative_path() {
        assert!(probe_libobs("obs.dll".into()).is_err());
    }
    #[test]
    fn rejects_other_binary_names() {
        let path = if cfg!(windows) { r"C:\\temp\\other.dll" } else { "/tmp/other.dll" };
        assert!(probe_libobs(path.into()).is_err());
    }
}
