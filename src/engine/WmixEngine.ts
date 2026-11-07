/** wMix Engine 0.1 — browser capture/composition; no OBS dependency. */
export type WmixSource = { id: string; name: string; stream: MediaStream };
export type PipLayout = { x: number; y: number; width: number };
export class WmixEngine {
  private sources = new Map<string, WmixSource>();
  private videos = new Map<string, HTMLVideoElement>();
  private canvas: HTMLCanvasElement | null = null;
  private frame = 0;
  private program: string | null = null;
  private overlay: string | null = null;
  private pipLayout: PipLayout = { x: 0.685, y: 0.68, width: 0.29 };
  private fadeFrom: string | null = null;
  private fadeStart = 0;
  private fadeDuration = 0;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordingError: Error | null = null;
  private recordingStream: MediaStream | null = null;
  onSourcesChanged?: () => void;
  onProgramChanged?: (id: string | null) => void;
  list() { return [...this.sources.values()]; }
  currentProgram() { return this.program; }
  currentOverlay() { return this.overlay; }
  currentPipLayout(): PipLayout { return { ...this.pipLayout }; }
  setPipLayout(layout: PipLayout) {
    const width = Math.max(0.1, Math.min(0.8, Number.isFinite(layout.width) ? layout.width : 0.29));
    const height = width * 9 / 16 * (this.canvas ? this.canvas.width / this.canvas.height : 16 / 9);
    this.pipLayout = {
      width,
      x: Math.max(0, Math.min(1 - width, Number.isFinite(layout.x) ? layout.x : 0)),
      y: Math.max(0, Math.min(1 - height, Number.isFinite(layout.y) ? layout.y : 0)),
    };
  }
  setOverlay(id: string | null) {
    if (id !== null && !this.sources.has(id)) throw new Error("Fonte de overlay inexistente");
    this.overlay = id;
    this.onSourcesChanged?.();
  }
  attach(canvas: HTMLCanvasElement) {
    cancelAnimationFrame(this.frame);
    this.canvas = canvas;
    this.draw();
  }
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
    this.fadeFrom = null;
    this.program = id; this.onProgramChanged?.(id);
  }
  transitionTo(id: string, durationMs = 500) {
    if (!this.sources.has(id)) throw new Error("Fonte inexistente");
    if (id === this.program) return;
    const previous = this.program;
    this.setProgram(id);
    this.fadeFrom = previous;
    this.fadeStart = performance.now();
    this.fadeDuration = Math.max(1, durationMs);
  }
  getVideo(id: string) { return this.videos.get(id) ?? null; }
  remove(id: string) {
    const source = this.sources.get(id);
    if (!source) return;
    this.sources.delete(id);
    const video = this.videos.get(id);
    if (video) { video.pause(); video.srcObject = null; }
    this.videos.delete(id);
    source.stream.getTracks().forEach(track => track.stop());
    if (this.fadeFrom === id) this.fadeFrom = null;
    if (this.overlay === id) this.overlay = null;
    if (this.fadeFrom && !this.sources.has(this.fadeFrom)) this.fadeFrom = null;
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
      // Independent picture-in-picture layer composited into the Program recording.
      const overlayVideo = this.overlay ? this.videos.get(this.overlay) : null;
      if (overlayVideo && overlayVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && overlayVideo.videoWidth) {
        const boxWidth = canvas.width * this.pipLayout.width;
        const boxHeight = boxWidth * 9 / 16;
        const x = canvas.width * this.pipLayout.x;
        const y = canvas.height * this.pipLayout.y;
        ctx.fillStyle = '#05070b';
        ctx.fillRect(x - 3, y - 3, boxWidth + 6, boxHeight + 6);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, boxWidth, boxHeight); ctx.clip();
        const scale = Math.max(boxWidth / overlayVideo.videoWidth, boxHeight / overlayVideo.videoHeight);
        const w = overlayVideo.videoWidth * scale, h = overlayVideo.videoHeight * scale;
        ctx.drawImage(overlayVideo, x + (boxWidth - w) / 2, y + (boxHeight - h) / 2, w, h);
        ctx.restore();
      }
    }
    this.frame = requestAnimationFrame(this.draw);
  };
  startRecording(audioStream?: MediaStream | null) {
    if (!this.canvas) throw new Error('Program indisponível');
    if (this.recorder) throw new Error('Finalize a gravação anterior antes de iniciar outra');
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder não suportado neste ambiente');
    const stream = this.canvas.captureStream(30);
    const audioTracks = audioStream?.getAudioTracks() ?? [];
    for (const track of audioTracks) stream.addTrack(track);
    const codecs = audioTracks.length
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = codecs.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      stream.getVideoTracks().forEach(track => track.stop());
      throw new Error('Gravação WebM não suportada');
    }
    this.chunks = [];
    this.recordingError = null;
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      recorder.onerror = () => { this.recordingError = new Error('Falha na gravação'); };
      recorder.start(1000);
      this.recorder = recorder;
      this.recordingStream = stream;
    } catch (error) {
      stream.getVideoTracks().forEach(track => track.stop());
      throw error;
    }
  }
  stopRecording(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('Nenhuma gravação ativa'));
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        this.recordingStream?.getVideoTracks().forEach(track => track.stop());
        this.recordingStream = null;
        this.recorder = null;
        const error = this.recordingError;
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.chunks = [];
        this.recordingError = null;
        if (error) reject(error);
        else if (!blob.size) reject(new Error('Gravação vazia'));
        else resolve(blob);
      };
      if (recorder.state === 'inactive') {
        recorder.onstop?.(new Event('stop'));
      } else {
        try { recorder.requestData(); recorder.stop(); } catch (error) { reject(error); }
      }
    });
  }
  dispose() {
    cancelAnimationFrame(this.frame); this.canvas = null;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recordingStream?.getVideoTracks().forEach(track => track.stop());
    this.recordingStream = null;
    for (const id of [...this.sources.keys()]) this.remove(id);
  }
}
