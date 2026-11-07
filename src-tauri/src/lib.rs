mod streaming;
mod output_manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(output_manager::OutputManager::default())
        .invoke_handler(tauri::generate_handler![streaming::probe_encoder, streaming::validate_rtmp_destination, streaming::start_synthetic_stream, streaming::synthetic_stream_status, streaming::stop_synthetic_stream])
        .run(tauri::generate_context!())
        .expect("error while running wMix");
}
