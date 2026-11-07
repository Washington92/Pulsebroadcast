/**
 * Browser-to-native Program transport: ordered WebM fragments.
 * FFmpeg can ingest these chunks as a continuous stdin byte stream.
 * This module does not start FFmpeg or claim that RTMP is live.
 */
export class ProgramMediaTransport {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private pending: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private stopping: Promise<void> | null = null;

  async start(stream: MediaStream, send: (bytes: number[]) => Promise<void>): Promise<void> {
    if (this.recorder || this.stopping) throw new Error("Transporte já iniciado");
    if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder indisponível");
    const withAudio = stream.getAudioTracks().length > 0;
    const candidates = withAudio
      ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Encoder WebM indisponível para transporte");
    const recorder = new MediaRecorder(stream, { mimeType });
    this.failure = null;
    this.stream = stream;
    this.recorder = recorder;
    recorder.ondataavailable = event => {
      if (!event.data.size || this.failure) return;
      // Serialize blob reads and native IPC writes to preserve muxed byte order.
      this.pending = this.pending.then(async () => {
        const buffer = await event.data.arrayBuffer();
        await send(Array.from(new Uint8Array(buffer)));
      }).catch(error => {
        this.failure = error instanceof Error ? error : new Error(String(error));
        if (recorder.state !== "inactive") recorder.stop();
      });
    };
    recorder.onerror = () => {
      this.failure = new Error("Falha ao capturar mídia do Program");
    };
    try { recorder.start(250); }
    catch (error) { this.recorder = null; this.stream = null; throw error; }
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const recorder = this.recorder;
    if (!recorder) return;
    this.stopping = new Promise<void>(resolve => {
      if (recorder.state === "inactive") { resolve(); return; }
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    }).then(async () => {
      await this.pending;
      if (this.failure) throw this.failure;
    }).finally(() => {
      // Capture owns cloned audio tracks, never the shared mixer master.
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.recorder = null;
      this.stopping = null;
    });
    return this.stopping;
  }
}
