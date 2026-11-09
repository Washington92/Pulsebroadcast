mod streaming;
mod output_manager;
mod program_bridge;
mod encoder_path;
mod libobs_probe;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(output_manager::OutputManager::default())
        .manage(program_bridge::ProgramBridge::default())
        .invoke_handler(tauri::generate_handler![libobs_probe::probe_libobs, streaming::probe_encoder, streaming::validate_rtmp_destination, streaming::start_synthetic_stream, streaming::synthetic_stream_status, streaming::stop_synthetic_stream, program_bridge::start_program_bridge, program_bridge::push_program_fragment, program_bridge::stop_program_bridge, program_bridge::program_bridge_status])
        .run(tauri::generate_context!())
        .expect("error while running wMix");
}
