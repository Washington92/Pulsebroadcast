/** wMix Engine 0.1 — browser capture/composition; no OBS dependency. */
export type WmixSource = { id: string; name: string; stream: MediaStream };
export class WmixEngine {
  private sources = new Map<string, WmixSource>();
  private videos = new Map<string, HTMLVideoElement>();
  private canvas: HTMLCanvasElement | null = null;
  private frame = 0;
  private program: string | null = null;
  private fadeFrom: string | null = null;
  private fadeStart = 0;
  private fadeDuration = 0;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  onSourcesChanged?: () => void;
  onProgramChanged?: (id: string | null) => void;
  list() { return [...this.sources.values()]; }
  currentProgram() { return this.program; }
  attach(canvas: HTMLCanvasElement) { this.canvas = canvas; this.draw(); }
  async addCamera(deviceId?: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
    return this.addStream(stream, 'Câmera');
  }
  async addScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    return this.addStream(stream, 'Tela');
  }
  private addStream(stream: MediaStream, label: string) {
    const id = crypto.randomUUID();
    const name = stream.getVideoTracks()[0]?.label || label;
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
    void video.play().catch(() => {});
    this.videos.set(id, video);
    this.sources.set(id, { id, name, stream });
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => this.remove(id), { once: true }));
    if (!this.program) this.setProgram(id);
    this.onSourcesChanged?.();
    return id;
  }
  setProgram(id: string) {
    if (!this.sources.has(id)) throw new Error('Fonte inexistente');
    this.program = id; this.onProgramChanged?.(id);
  }
  transitionTo(id: string, durationMs = 500) {
    if (!this.sources.has(id)) throw new Error("Fonte inexistente");
    if (id === this.program) return;
    this.fadeFrom = this.program;
    this.fadeStart = performance.now();
    this.fadeDuration = Math.max(1, durationMs);
    this.setProgram(id);
  }
  getVideo(id: string) { return this.videos.get(id) ?? null; }
  remove(id: string) {
    const source = this.sources.get(id);
    if (!source) return;
    this.sources.delete(id); this.videos.delete(id);
    source.stream.getTracks().forEach(track => track.stop());
    if (this.fadeFrom === id) this.fadeFrom = null;
    if (this.program === id) { this.program = this.sources.keys().next().value ?? null; this.onProgramChanged?.(this.program); }
    this.onSourcesChanged?.();
  }
  private draw = () => {
    const canvas = this.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#080c13'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const video = this.program ? this.videos.get(this.program) : null;
      const paint = (v: HTMLVideoElement, alpha = 1) => {
        const scale = Math.min(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
        const w = v.videoWidth * scale, h = v.videoHeight * scale;
        ctx.globalAlpha = alpha;
        ctx.drawImage(v, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        ctx.globalAlpha = 1;
      };
      const fadeProgress = this.fadeFrom ? Math.min(1, (performance.now() - this.fadeStart) / this.fadeDuration) : 1;
      const previous = this.fadeFrom ? this.videos.get(this.fadeFrom) : null;
      if (fadeProgress < 1 && previous?.readyState && previous.videoWidth) paint(previous);
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
        paint(video, fadeProgress);
      }
      if (fadeProgress >= 1) this.fadeFrom = null;
    }
    this.frame = requestAnimationFrame(this.draw);
  };
  startRecording() {
    if (!this.canvas) throw new Error('Program indisponível');
    if (this.recorder?.state === 'recording') throw new Error('Gravação já iniciada');
    const stream = this.canvas.captureStream(30);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { stream.getTracks().forEach(t => t.stop()); throw new Error('Gravação WebM não suportada'); }
    this.chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
    recorder.start(1000); this.recorder = recorder;
  }
  stopRecording(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder || recorder.state !== 'recording') return Promise.reject(new Error('Nenhuma gravação ativa'));
    return new Promise((resolve, reject) => {
      recorder.onstop = () => { recorder.stream.getTracks().forEach(t => t.stop()); this.recorder = null; resolve(new Blob(this.chunks, { type: recorder.mimeType })); this.chunks = []; };
      recorder.onerror = () => reject(new Error('Falha na gravação'));
      recorder.stop();
    });
  }
  dispose() {
    cancelAnimationFrame(this.frame); this.canvas = null;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    for (const id of [...this.sources.keys()]) this.remove(id);
  }
}
