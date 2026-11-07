/** wMix Engine 0.1 — browser capture/composition; no OBS dependency. */
export type WmixSource = { id: string; name: string; stream: MediaStream; kind: "camera" | "screen" };
export type PipLayout = { x: number; y: number; width: number };
export class WmixEngine {
  private sources = new Map<string, WmixSource>();
  private videos = new Map<string, HTMLVideoElement>();
  private canvas: HTMLCanvasElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewScene: { base: string | null; overlay: string | null; layout: PipLayout } | null = null;
  private frame = 0;
  private frameWindowStart = 0;
  private frameCount = 0;
  private droppedFrames = 0;
  private lastFrameAt = 0;
  private measuredFps = 0;
  onPerformance?: (metrics: { fps: number; droppedFrames: number }) => void;
  private program: string | null = null;
  private overlay: string | null = null;
  private pipLayout: PipLayout = { x: 0.685, y: 0.68, width: 0.29 };
  private fadeFrom: string | null = null;
  private fadeSnapshot: HTMLCanvasElement | null = null;
  private fadeScene: { base: string | null; overlay: string | null; layout: PipLayout } | null = null;
  private fadeStart = 0;
  private fadeDuration = 0;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordingError: Error | null = null;
  private recordingStream: MediaStream | null = null;
  private recordingWaiters: Array<{ resolve: (blob: Blob) => void; reject: (error: Error) => void }> = [];
  onRecordingStopped?: (error: Error | null) => void;
  onRecordingRecovered?: (blob: Blob) => void;
  private recordingStopRequested = false;
  onSourcesChanged?: () => void;
  onProgramChanged?: (id: string | null) => void;
  list() { return [...this.sources.values()]; }
  currentProgram() { return this.program; }
  isTransitioning() { return this.fadeSnapshot !== null; }
  currentPreviewScene() { return this.previewScene ? { ...this.previewScene, layout: { ...this.previewScene.layout } } : null; }
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
  attachPreview(canvas: HTMLCanvasElement | null) { this.previewCanvas = canvas; }
  prepareScene(base: string | null, overlay: string | null, layout: PipLayout) {
    this.previewScene = { base, overlay, layout: { ...layout } };
  }
  clearPreview() { this.previewScene = null; this.previewCanvas = null; }
  private paintPip(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, overlay: string | null, layout: PipLayout) {
    const video = overlay ? this.videos.get(overlay) : null;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
    const boxWidth = canvas.width * layout.width;
    const boxHeight = boxWidth * 9 / 16;
    const x = canvas.width * layout.x, y = canvas.height * layout.y;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(x - 3, y - 3, boxWidth + 6, boxHeight + 6);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, boxWidth, boxHeight); ctx.clip();
    const scale = Math.max(boxWidth / video.videoWidth, boxHeight / video.videoHeight);
    const w = video.videoWidth * scale, h = video.videoHeight * scale;
    ctx.drawImage(video, x + (boxWidth - w) / 2, y + (boxHeight - h) / 2, w, h);
    ctx.restore();
  }
  private paintBase(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, id: string | null) {
    const video = id ? this.videos.get(id) : null;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * scale, h = video.videoHeight * scale;
    ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  private drawPreview() {
    const canvas = this.previewCanvas, scene = this.previewScene;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#080c13'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.paintBase(ctx, canvas, scene.base);
    this.paintPip(ctx, canvas, scene.overlay, scene.layout);
  }
  async addCamera(deviceId?: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
    return this.addStream(stream, 'Câmera', 'camera');
  }
  /** Refresh a camera stream without changing its scene/source ID. */
  async reconnectCamera(id: string, deviceId?: string) {
    const source = this.sources.get(id);
    if (!source) throw new Error("Fonte não encontrada para reconexão");
    if (source.kind !== "camera") throw new Error("A fonte selecionada não é uma câmera");
    const previousTrack = source.stream.getVideoTracks()[0];
    const targetDevice = deviceId ?? previousTrack.getSettings?.().deviceId;
    const replacement = await navigator.mediaDevices.getUserMedia({
      video: targetDevice ? { deviceId: { exact: targetDevice } } : true,
      audio: false,
    });
    // A pending permission prompt may outlive the source's removal.
    if (this.sources.get(id) !== source) {
      replacement.getTracks().forEach(track => track.stop());
      throw new Error("A fonte foi removida durante a reconexão");
    }
    const video = this.videos.get(id);
    if (!video) {
      replacement.getTracks().forEach(track => track.stop());
      throw new Error("Vídeo da fonte indisponível");
    }
    source.stream = replacement;
    source.name = replacement.getVideoTracks()[0]?.label || source.name;
    video.srcObject = replacement;
    void video.play().catch(() => {});
    replacement.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
      if (this.sources.get(id)?.stream === replacement) this.remove(id);
    }, { once: true }));
    // Stop only after the replacement is attached; old ended events are ignored.
    const previous = previousTrack;
    if (previous) previous.stop();
    this.onSourcesChanged?.();
    return id;
  }
  async addScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    return this.addStream(stream, 'Tela', 'screen');
  }
  private addStream(stream: MediaStream, label: string, kind: 'camera' | 'screen') {
    const id = crypto.randomUUID();
    const name = stream.getVideoTracks()[0]?.label || label;
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
    void video.play().catch(() => {});
    this.videos.set(id, video);
    this.sources.set(id, { id, name, stream, kind });
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      // Ignore delayed events after a source has already been removed.
      if (this.sources.get(id)?.stream === stream) this.remove(id);
    }, { once: true }));
    if (!this.program) this.setProgram(id);
    this.onSourcesChanged?.();
    return id;
  }
  setProgram(id: string) {
    if (!this.sources.has(id)) throw new Error('Fonte inexistente');
    this.fadeFrom = null;
    this.fadeSnapshot = null;
    this.fadeScene = null;
    this.program = id; this.onProgramChanged?.(id);
  }
  transitionTo(id: string, durationMs = 500) {
    if (!this.sources.has(id)) throw new Error("Fonte inexistente");
    if (id === this.program) return;
    const previous = this.program;
    const previousScene = { base: this.program, overlay: this.overlay, layout: { ...this.pipLayout } };
    const snapshot = document.createElement("canvas");
    if (this.canvas) {
      snapshot.width = this.canvas.width;
      snapshot.height = this.canvas.height;
      snapshot.getContext("2d")?.drawImage(this.canvas, 0, 0);
    }
    this.setProgram(id);
    this.fadeFrom = previous;
    this.fadeScene = previousScene;
    this.fadeSnapshot = snapshot.width && snapshot.height ? snapshot : null;
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
    if (this.previewScene?.base === id) this.previewScene.base = null;
    if (this.previewScene?.overlay === id) this.previewScene.overlay = null;
    // Keep the snapshot as a safe fallback when a source disappears mid-transition.
    if (this.fadeScene?.base === id) this.fadeScene.base = null;
    if (this.fadeScene?.overlay === id) this.fadeScene.overlay = null;
    if (this.program === id) {
      this.fadeSnapshot = null;
      this.fadeScene = null;
      this.fadeFrom = null;
      this.program = this.sources.keys().next().value ?? null;
      this.onProgramChanged?.(this.program);
    }
    this.onSourcesChanged?.();
  }
  private draw = () => {
    const now = performance.now();
    if (!this.frameWindowStart) this.frameWindowStart = now;
    if (this.lastFrameAt && now - this.lastFrameAt > 50) this.droppedFrames += Math.max(0, Math.floor((now - this.lastFrameAt) / (1000 / 30)) - 1);
    this.lastFrameAt = now;
    this.frameCount++;
    if (now - this.frameWindowStart >= 1000) {
      this.measuredFps = Math.round(this.frameCount * 1000 / (now - this.frameWindowStart));
      this.onPerformance?.({ fps: this.measuredFps, droppedFrames: this.droppedFrames });
      this.frameCount = 0;
      this.frameWindowStart = now;
    }
    const canvas = this.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#080c13'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.paintBase(ctx, canvas, this.program);
      this.paintPip(ctx, canvas, this.overlay, this.pipLayout);
      if (this.fadeSnapshot) {
        const progress = Math.min(1, (performance.now() - this.fadeStart) / this.fadeDuration);
        if (progress < 1) {
          ctx.globalAlpha = 1 - progress;
          const previous = this.fadeScene;
          const previousBase = previous?.base ? this.videos.get(previous.base) : null;
          if (previous && previousBase && previousBase.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && previousBase.videoWidth) {
            ctx.save();
            ctx.fillStyle = "#080c13"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            this.paintBase(ctx, canvas, previous.base);
            this.paintPip(ctx, canvas, previous.overlay, previous.layout);
            ctx.restore();
          } else {
            ctx.drawImage(this.fadeSnapshot, 0, 0, canvas.width, canvas.height);
          }
          ctx.globalAlpha = 1;
        } else {
          this.fadeSnapshot = null;
          this.fadeScene = null;
          this.fadeFrom = null;
        }
      }
    }
    this.drawPreview();
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
    this.recordingStopRequested = false;
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      recorder.onerror = () => { this.recordingError = new Error("Falha na gravação"); };
      recorder.onstop = () => this.finishRecording(recorder);
      recorder.start(1000);
      this.recorder = recorder;
      this.recordingStream = stream;
    } catch (error) {
      stream.getVideoTracks().forEach(track => track.stop());
      throw error;
    }
  }
  private finishRecording(recorder: MediaRecorder) {
    if (this.recorder !== recorder) return;
    this.recordingStream?.getVideoTracks().forEach(track => track.stop());
    this.recordingStream = null;
    this.recorder = null;
    const error = this.recordingError;
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    this.chunks = [];
    this.recordingError = null;
    const unexpected = !this.recordingStopRequested;
    this.recordingStopRequested = false;
    const failure = error ?? (!blob.size ? new Error("Gravação vazia") : unexpected ? new Error("Gravação interrompida inesperadamente; arquivo parcial recuperado.") : null);
    if (unexpected && blob.size) this.onRecordingRecovered?.(blob);
    const waiters = this.recordingWaiters.splice(0);
    for (const waiter of waiters) {
      if (failure) waiter.reject(failure);
      else waiter.resolve(blob);
    }
    this.onRecordingStopped?.(failure);
  }
  stopRecording(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error("Nenhuma gravação ativa"));
    return new Promise((resolve, reject) => {
      this.recordingWaiters.push({ resolve, reject });
      this.recordingStopRequested = true;
      if (recorder.state === "inactive") {
        this.finishRecording(recorder);
      } else {
        try { recorder.requestData(); recorder.stop(); }
        catch (error) {
          this.recordingError = error instanceof Error ? error : new Error(String(error));
          this.finishRecording(recorder);
        }
      }
    });
  }
  dispose() {
    cancelAnimationFrame(this.frame); this.canvas = null; this.clearPreview();
    this.onPerformance = undefined;
    this.onRecordingRecovered = undefined;
    this.onRecordingStopped = undefined;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recordingStream?.getVideoTracks().forEach(track => track.stop());
    this.recordingStream = null;
    for (const id of [...this.sources.keys()]) this.remove(id);
  }
}
