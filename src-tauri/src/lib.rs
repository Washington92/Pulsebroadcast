mod streaming;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![streaming::probe_encoder, streaming::validate_rtmp_destination])
        .run(tauri::generate_context!())
        .expect("error while running wMix");
}
