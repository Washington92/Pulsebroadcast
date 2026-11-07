/** Independent wMix audio bus based on the Web Audio API. No OBS code or process. */
export type AudioInput = { id: string; name: string; stream: MediaStream; volume: number; muted: boolean; level: number };
type Channel = { input: AudioInput; source: MediaStreamAudioSourceNode; gain: GainNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> };
export class WmixAudioEngine {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private channels = new Map<string, Channel>();
  private raf = 0;
  onChange?: (inputs: AudioInput[]) => void;
  private ensureContext() {
    if (!this.context) { this.context = new AudioContext(); this.destination = this.context.createMediaStreamDestination(); }
    void this.context.resume();
    return this.context;
  }
  list() { return [...this.channels.values()].map(ch => ({ ...ch.input })); }
  output() { return this.destination?.stream ?? null; }
  async addMicrophone(deviceId?: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : { echoCancellation: false }, video: false });
    try { return this.addStream(stream); } catch (error) { stream.getTracks().forEach(t => t.stop()); throw error; }
  }
  addStream(stream: MediaStream) {
    if (!stream.getAudioTracks().length) throw new Error("Fonte sem áudio");
    const ctx = this.ensureContext();
    const id = crypto.randomUUID();
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    source.connect(analyser); analyser.connect(gain); gain.connect(this.destination!);
    const input: AudioInput = { id, name: stream.getAudioTracks()[0].label || "Microfone", stream, volume: 1, muted: false, level: 0 };
    this.channels.set(id, { input, source, gain, analyser, samples: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)) });
    stream.getAudioTracks().forEach(t => t.addEventListener("ended", () => this.remove(id), { once: true }));
    if (!this.raf) this.measure();
    this.emit(); return id;
  }
  setVolume(id: string, volume: number) {
    const ch = this.channels.get(id); if (!ch) return;
    ch.input.volume = Math.max(0, Math.min(1, volume));
    ch.gain.gain.value = ch.input.muted ? 0 : ch.input.volume;
    this.emit();
  }
  setMute(id: string, muted: boolean) {
    const ch = this.channels.get(id); if (!ch) return;
    ch.input.muted = muted; ch.gain.gain.value = muted ? 0 : ch.input.volume;
    this.emit();
  }
  remove(id: string) {
    const ch = this.channels.get(id); if (!ch) return;
    this.channels.delete(id);
    ch.source.disconnect(); ch.analyser.disconnect(); ch.gain.disconnect();
    ch.input.stream.getTracks().forEach(t => t.stop()); this.emit();
  }
  private emit() { this.onChange?.(this.list()); }
  private measure = () => {
    for (const ch of this.channels.values()) {
      ch.analyser.getFloatTimeDomainData(ch.samples);
      let sum = 0; for (const sample of ch.samples) sum += sample * sample;
      ch.input.level = Math.min(1, Math.sqrt(sum / ch.samples.length) * 3);
    }
    if (this.channels.size) { this.emit(); this.raf = requestAnimationFrame(this.measure); }
    else this.raf = 0;
  };
  dispose() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    for (const id of [...this.channels.keys()]) this.remove(id);
    void this.context?.close(); this.context = null; this.destination = null;
  }
}
