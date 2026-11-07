/** Independent wMix audio bus based on the Web Audio API. No OBS code or process. */
export type AudioInput = { id: string; name: string; stream: MediaStream; volume: number; muted: boolean; cue: boolean; level: number };
type Channel = { input: AudioInput; source: MediaStreamAudioSourceNode; gain: GainNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> };
export class WmixAudioEngine {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private channels = new Map<string, Channel>();
  private cueDestination: MediaStreamAudioDestinationNode | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume = 0.78;
  private masterMuted = false;
  private cueMonitor: HTMLAudioElement | null = null;
  private cueGains = new Map<string, GainNode>();
  private raf = 0;
  onChange?: (inputs: AudioInput[]) => void;
  private ensureContext() {
    if (!this.context) { this.context = new AudioContext(); this.destination = this.context.createMediaStreamDestination(); this.cueDestination = this.context.createMediaStreamDestination(); this.masterGain = this.context.createGain(); this.masterGain.gain.value = this.masterVolume; this.masterGain.connect(this.destination); }
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
    source.connect(analyser); analyser.connect(gain); gain.connect(this.masterGain!);
    const cueGain = ctx.createGain(); cueGain.gain.value = 0;
    analyser.connect(cueGain); cueGain.connect(this.cueDestination!);
    this.cueGains.set(id, cueGain);
    const input: AudioInput = { id, name: stream.getAudioTracks()[0].label || "Microfone", stream, volume: 1, muted: false, cue: false, level: 0 };
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
  setMaster(volume: number, muted: boolean) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.masterMuted = muted;
    if (this.masterGain && this.context) this.masterGain.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.context.currentTime, 0.01);
  }
  async enableCueMonitor() {
    this.ensureContext();
    if (!this.cueMonitor) {
      const monitor = document.createElement("audio");
      monitor.autoplay = true;
      monitor.srcObject = this.cueDestination!.stream;
      this.cueMonitor = monitor;
    }
    await this.context!.resume();
    await this.cueMonitor.play();
  }
  async setCue(id: string, enabled: boolean) {
    const channel = this.channels.get(id);
    if (!channel) return;
    if (enabled) await this.enableCueMonitor();
    channel.input.cue = enabled;
    this.cueGains.get(id)!.gain.value = enabled ? 1 : 0;
    this.emit();
  }
  async setCueOutput(deviceId: string) {
    await this.enableCueMonitor();
    const monitor = this.cueMonitor as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (!monitor.setSinkId) throw new Error("Seleção de saída não suportada neste ambiente");
    await monitor.setSinkId(deviceId);
  }
  remove(id: string) {
    const ch = this.channels.get(id); if (!ch) return;
    this.channels.delete(id);
    ch.source.disconnect(); ch.analyser.disconnect(); ch.gain.disconnect();
    this.cueGains.get(id)?.disconnect(); this.cueGains.delete(id);
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
    if (this.cueMonitor) { this.cueMonitor.pause(); this.cueMonitor.srcObject = null; this.cueMonitor = null; }
    void this.context?.close(); this.context = null; this.destination = null; this.cueDestination = null; this.masterGain = null;
  }
}
