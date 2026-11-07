import { ProgramMediaTransport } from "./ProgramMediaTransport";
import type { WmixEngine } from "./WmixEngine";
import type { WmixAudioEngine } from "./WmixAudioEngine";

type NativeInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function nativeInvoke(): NativeInvoke {
  const host = window as Window & { __TAURI__?: { core?: { invoke?: NativeInvoke } } };
  const invoke = host.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("Transmissão local exige o aplicativo desktop wMix (Tauri)");
  return invoke;
}

/** Experimental local-only Program -> MediaRecorder -> IPC -> FFmpeg bridge. */
export class LocalProgramOutput {
  private transport: ProgramMediaTransport | null = null;
  private starting = false;

  async start(engine: WmixEngine, audio: WmixAudioEngine, url: string, bitrate: number): Promise<void> {
    if (this.transport || this.starting) throw new Error("Transmissão de teste já iniciada");
    this.starting = true;
    const invoke = nativeInvoke();
    let capture: MediaStream | null = null;
    let nativeStarted = false;
    try {
      // Reject production destinations before allocating capture resources.
      if (!/^rtmp:\/\/(localhost|127\.0\.0\.1)(:1935)?\/[^\s]+$/.test(url)) {
        throw new Error("Teste restrito a rtmp://127.0.0.1:1935/live/test");
      }
      capture = engine.captureProgramMedia(audio.output());
      await invoke("start_program_bridge", { url, videoBitrateKbps: bitrate });
      nativeStarted = true;
      const transport = new ProgramMediaTransport();
      await transport.start(capture, async bytes => {
        await invoke("push_program_fragment", { bytes });
      });
      this.transport = transport;
    } catch (error) {
      capture?.getTracks().forEach(track => track.stop());
      if (nativeStarted) await invoke("stop_program_bridge").catch(() => {});
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    if (this.starting) throw new Error("Aguarde a inicialização do encoder");
    const transport = this.transport;
    if (!transport) return;
    this.transport = null;
    const invoke = nativeInvoke();
    try { await transport.stop(); }
    finally { await invoke("stop_program_bridge"); }
  }

  get active(): boolean { return this.transport !== null; }
}
