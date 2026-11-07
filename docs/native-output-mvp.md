# wMix — native output MVP (develop)

## Architecture
- `src/engine/SceneGraph.ts`: serializable Program/Preview/overlay/PiP state (browser-independent).
- `src/engine/WmixEngine.ts`: current browser capture, Canvas compositor, transitions and WebM recorder.
- `src/engine/WmixAudioEngine.ts`: current Web Audio mixer.
- `src-tauri/src/output_manager.rs`: supervised native output state machine (idle, starting, live, stopping, failed).
- `src-tauri/src/streaming.rs`: FFmpeg capability probe, RTMP URL validation, synthetic test signal.
- Tauri commands: `probe_encoder`, `validate_rtmp_destination`, `start_synthetic_stream`, `synthetic_stream_status`, `stop_synthetic_stream`.

## Synthetic test scope
The first native encoder uses FFmpeg lavfi `testsrc2` at 1280×720/30 FPS and a 48 kHz sine tone, encoded as H.264/AAC and muxed into FLV for RTMP/RTMPS. For safety the test command accepts only loopback RTMP destinations, e.g. `rtmp://127.0.0.1:1935/live/test`. It requires an FFmpeg binary in PATH and a separately running local RTMP ingest server. No streaming credentials are saved. Logs never include the destination URL. Process arguments can still be inspected by the OS, so **never pass a production stream key to this test**.

The native commands are implemented but not yet wired to the React transmit button. A successfully spawned encoder is **not** proof that a server is receiving the stream; verify ingestion at the server. `live` currently means the FFmpeg process survived the startup check. Stop currently uses a forced process termination rather than graceful RTMP trailer flushing. Reconnection and telemetry beyond process state are pending.

## Validation
- Frontend: `npm test && npm run build`.
- Native output unit tests: `rustc --edition=2021 --test src-tauri/src/output_manager.rs -o output-tests && ./output-tests` (Linux/macOS; on Windows use `output-tests.exe`).
- Rust/Tauri: `cargo check --manifest-path src-tauri/Cargo.toml`.
- CI: `native-engine.yml` runs Rust tests and cargo check without producing a Windows installer.

## Next
1. Confirm CI and fix any Rust compiler errors.
2. Verify synthetic RTMP ingestion against a local test server on Windows 10/11.
3. Replace forced termination with graceful FFmpeg shutdown and robust failure monitoring.
4. Design the explicit video/audio transport bridge from Program and AudioGraph to native encoder.
5. Add secret-safe destination handling, reconnect, metrics and encoder packaging.
6. Validate real Program transmission with hardware and long-running tests.
