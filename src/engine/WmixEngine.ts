/** wMix Engine 0.1 — browser capture/composition; no OBS dependency. */
export type WmixSource = { id: string; name: string; stream: MediaStream; kind: "camera" | "screen" | "image" | "video"; offline?: boolean };
export type PipLayout = { x: number; y: number; width: number };
export class WmixEngine {
  private sources = new Map<string, WmixSource>();
  private videos = new Map<string, HTMLVideoElement>();
  private recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private recoveryAttempts = new Map<string, number>();
  private cameraDeviceIds = new Map<string, string>();
  private mediaPlayers = new Map<string, { player: HTMLVideoElement; url: string; frame: number; canvas: HTMLCanvasElement }>();
  private canvas: HTMLCanvasElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewScene: { base: string | null; overlay: string | null; layout: PipLayout } | null = null;
  private frame = 0;
  private frameWindowStart = 0;
  private frameCount = 0;
  private droppedFrames = 0;
  private lastFrameAt = 0;
  private measuredFps = 0;
  private targetFps = 30;
  private lastRenderAt = 0;
  private renderContext: CanvasRenderingContext2D | null = null;
  setTargetFps(fps: 24 | 25 | 30 | 50 | 60) { this.targetFps = fps; this.lastRenderAt = 0; }
  getTargetFps() { return this.targetFps; }
  onPerformance?: (metrics: { fps: number; droppedFrames: number }) => void;
  private program: string | null = null;
  private overlay: string | null = null;
  private pipLayout: PipLayout = { x: 0.685, y: 0.68, width: 0.29 };
  private fadeFrom: string | null = null;
  private fadeSnapshot: HTMLCanvasElement | null = null;
  private fadeScene: { base: string | null; overlay: string | null; layout: PipLayout } | null = null;
  private manualFadeProgress: number | null = null;
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
  renameSource(id: string, name: string) {
    const source = this.sources.get(id);
    if (!source) throw new Error("Input não encontrado");
    const next = name.trim().slice(0, 60);
    if (!next) throw new Error("Informe um nome para o input");
    source.name = next;
    this.onSourcesChanged?.();
  }
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
    this.renderContext = canvas.getContext("2d", { alpha: false });
    this.lastRenderAt = 0;
    this.frameWindowStart = 0;
    this.frameCount = 0;
    this.lastFrameAt = 0;
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
  private sourceTransforms = new Map<string, { mode: "contain" | "cover" | "stretch"; scale: number; x: number; y: number }>();
  setSourceTransform(id: string, patch: Partial<{ mode: "contain" | "cover" | "stretch"; scale: number; x: number; y: number }>) {
    if (!this.sources.has(id)) throw new Error("Fonte inexistente");
    const old = this.sourceTransforms.get(id) ?? { mode: "contain" as const, scale: 1, x: 0, y: 0 };
    this.sourceTransforms.set(id, { ...old, ...patch, scale: Math.max(0.1, Math.min(5, patch.scale ?? old.scale)), x: Math.max(-1, Math.min(1, patch.x ?? old.x)), y: Math.max(-1, Math.min(1, patch.y ?? old.y)) });
    this.onSourcesChanged?.();
  }
  getSourceTransform(id: string) { return this.sourceTransforms.get(id) ?? { mode: "contain" as const, scale: 1, x: 0, y: 0 }; }
  private paintBase(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, id: string | null) {
    const video = id ? this.videos.get(id) : null;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
    const transform = id ? this.getSourceTransform(id) : { mode: "contain" as const, scale: 1, x: 0, y: 0 };
    const baseScale = transform.mode === "cover" ? Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight) : Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = transform.mode === "stretch" ? canvas.width * transform.scale : video.videoWidth * baseScale * transform.scale;
    const h = transform.mode === "stretch" ? canvas.height * transform.scale : video.videoHeight * baseScale * transform.scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height); ctx.clip();
    ctx.drawImage(video, (canvas.width - w) / 2 + transform.x * canvas.width, (canvas.height - h) / 2 + transform.y * canvas.height, w, h);
    ctx.restore();
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
    const id = this.addStream(stream, 'Câmera', 'camera');
    const resolvedDeviceId = deviceId || stream.getVideoTracks()[0]?.getSettings?.().deviceId;
    if (resolvedDeviceId) this.cameraDeviceIds.set(id, resolvedDeviceId);
    return id;
  }
  /** Refresh a camera stream without changing its scene/source ID. */
  async reconnectCamera(id: string, deviceId?: string) {
    const source = this.sources.get(id);
    if (!source) throw new Error("Fonte não encontrada para reconexão");
    if (source.kind !== "camera") throw new Error("A fonte selecionada não é uma câmera");
    const previousTrack = source.stream.getVideoTracks()[0];
    const targetDevice = deviceId ?? this.cameraDeviceIds.get(id) ?? previousTrack.getSettings?.().deviceId;
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
    source.offline = false;
    if (targetDevice) this.cameraDeviceIds.set(id, targetDevice);
    this.recoveryAttempts.delete(id);
    const pending = this.recoveryTimers.get(id);
    if (pending !== undefined) clearTimeout(pending);
    this.recoveryTimers.delete(id);
    source.name = replacement.getVideoTracks()[0]?.label || source.name;
    video.srcObject = replacement;
    void video.play().catch(() => {});
    replacement.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
      if (this.sources.get(id)?.stream === replacement) this.handleTrackEnded(id);
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
  /** Import a still image as a native video source for Preview, Program and recording. */
  async addImage(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem válido.");
    if (file.size > 30 * 1024 * 1024) throw new Error("Imagem muito grande (máximo 30 MB).");
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, bitmap.width);
      canvas.height = Math.max(1, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível preparar a imagem.");
      ctx.drawImage(bitmap, 0, 0);
      const stream = canvas.captureStream(1);
      const id = this.addStream(stream, file.name.replace(/\\.[^.]+$/, ""), "image");
      // Ensure a frame is available even when the canvas is otherwise static.
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
      track?.requestFrame?.();
      return id;
    } finally { bitmap.close(); }
  }
  /** Video file source with an independent playback clock and native canvas capture. */
  async addVideoFile(file: File) {
    if (!file.type.startsWith("video/")) throw new Error("Selecione um arquivo de vídeo válido.");
    const url = URL.createObjectURL(file);
    const player = document.createElement("video");
    player.src = url;
    player.loop = true;
    player.muted = true;
    player.playsInline = true;
    player.preload = "auto";
    try {
      await new Promise<void>((resolve, reject) => {
        player.onloadedmetadata = () => resolve();
        player.onerror = () => reject(new Error("Não foi possível abrir o vídeo. Verifique o formato e codec."));
      });
      const canvas = document.createElement("canvas");
      canvas.width = player.videoWidth || 1280;
      canvas.height = player.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível para reprodução.");
      const stream = canvas.captureStream(30);
      const id = this.addStream(stream, file.name.replace(/\\.[^.]+$/, ""), "video");
      const entry = { player, url, frame: 0, canvas };
      this.mediaPlayers.set(id, entry);
      const paint = () => {
        if (this.mediaPlayers.get(id) !== entry) return;
        if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
          (stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void })?.requestFrame?.();
        }
        entry.frame = requestAnimationFrame(paint);
      };
      paint();
      void player.play().catch(() => {});
      return id;
    } catch (error) {
      player.pause();
      player.removeAttribute("src");
      player.load();
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  controlVideo(id: string, action: "play" | "pause" | "restart" | "loop") {
    const entry = this.mediaPlayers.get(id);
    if (!entry) throw new Error("Selecione um input de vídeo.");
    if (action === "pause") entry.player.pause();
    else if (action === "restart") { entry.player.currentTime = 0; void entry.player.play().catch(() => {}); }
    else if (action === "loop") entry.player.loop = !entry.player.loop;
    else void entry.player.play().catch(() => {});
    return { paused: entry.player.paused, loop: entry.player.loop };
  }
  private addStream(stream: MediaStream, label: string, kind: 'camera' | 'screen' | 'image' | 'video') {
    const id = crypto.randomUUID();
    const name = stream.getVideoTracks()[0]?.label || label;
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
    void video.play().catch(() => {});
    this.videos.set(id, video);
    this.sources.set(id, { id, name, stream, kind });
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      // Ignore delayed events after a source has already been removed.
      if (this.sources.get(id)?.stream === stream) this.handleTrackEnded(id);
    }, { once: true }));
    if (!this.program) this.setProgram(id);
    this.onSourcesChanged?.();
    return id;
  }
  private handleTrackEnded(id: string) {
    const source = this.sources.get(id);
    if (!source) return;
    if (source.kind !== "camera") { this.remove(id); return; }
    source.offline = true;
    this.onSourcesChanged?.();
    this.scheduleRecovery(id);
  }
  private scheduleRecovery(id: string) {
    if (this.recoveryTimers.has(id) || !this.sources.has(id)) return;
    const attempts = this.recoveryAttempts.get(id) ?? 0;
    if (attempts >= 5) return; // Stop retrying until manual reconnect.
    const delay = Math.min(15000, 1000 * 2 ** attempts);
    this.recoveryTimers.set(id, setTimeout(async () => {
      this.recoveryTimers.delete(id);
      if (!this.sources.has(id) || !this.sources.get(id)?.offline) return;
      this.recoveryAttempts.set(id, attempts + 1);
      try { await this.reconnectCamera(id); }
      catch { this.scheduleRecovery(id); }
    }, delay));
  }
  setProgram(id: string) {
    if (!this.sources.has(id)) throw new Error('Fonte inexistente');
    this.manualFadeProgress = null;
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
  setManualTransition(id: string, progress: number) {
    if (!this.sources.has(id)) throw new Error("Fonte inexistente");
    const p = Math.max(0, Math.min(1, progress));
    if (this.manualFadeProgress === null) {
      if (id === this.program) return;
      const previous = this.program;
      const previousScene = { base: previous, overlay: this.overlay, layout: { ...this.pipLayout } };
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
    }
    this.manualFadeProgress = p;
    if (p >= 1) {
      this.fadeSnapshot = null;
      this.fadeScene = null;
      this.fadeFrom = null;
      this.manualFadeProgress = null;
    }
  }
  getVideo(id: string) { return this.videos.get(id) ?? null; }
  remove(id: string) {
    const source = this.sources.get(id);
    if (!source) return;
    this.sources.delete(id);
    this.sourceTransforms.delete(id);
    const pending = this.recoveryTimers.get(id);
    if (pending !== undefined) clearTimeout(pending);
    this.recoveryTimers.delete(id);
    this.recoveryAttempts.delete(id);
    this.cameraDeviceIds.delete(id);
    const media = this.mediaPlayers.get(id);
    if (media) { cancelAnimationFrame(media.frame); media.player.pause(); media.player.removeAttribute("src"); media.player.load(); URL.revokeObjectURL(media.url); this.mediaPlayers.delete(id); }
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
  private draw = (now: number = performance.now()) => {
    if (!this.canvas) return;
    // Schedule the next frame first; rendering is throttled independently of monitor refresh rate.
    this.frame = requestAnimationFrame(this.draw);
    const frameInterval = 1000 / this.targetFps;
    if (this.lastRenderAt && now - this.lastRenderAt < frameInterval - 1) return;
    if (this.lastFrameAt) {
      const delta = now - this.lastFrameAt;
      if (delta > frameInterval * 1.5) this.droppedFrames += Math.max(0, Math.round(delta / frameInterval) - 1);
    }
    this.lastFrameAt = now;
    // Advance from the previous scheduled slot to avoid drift at 60 Hz / 30 FPS.
    // If the UI thread stalls, resynchronize instead of accumulating a frame backlog.
    const elapsed = this.lastRenderAt ? now - this.lastRenderAt : frameInterval;
    this.lastRenderAt = now - (elapsed % frameInterval);
    if (!this.frameWindowStart) this.frameWindowStart = now;
    this.frameCount++;
    if (now - this.frameWindowStart >= 1000) {
      this.measuredFps = Math.round(this.frameCount * 1000 / (now - this.frameWindowStart));
      this.onPerformance?.({ fps: this.measuredFps, droppedFrames: this.droppedFrames });
      this.frameCount = 0;
      this.frameWindowStart = now;
    }
    const canvas = this.canvas;
    const ctx = this.renderContext;
    if (ctx) {
      ctx.fillStyle = '#080c13'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.paintBase(ctx, canvas, this.program);
      this.paintPip(ctx, canvas, this.overlay, this.pipLayout);
      if (this.fadeSnapshot) {
        const progress = this.manualFadeProgress ?? Math.min(1, (performance.now() - this.fadeStart) / this.fadeDuration);
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
  };
  startRecording(audioStream?: MediaStream | null) {
    if (!this.canvas) throw new Error('Program indisponível');
    if (this.recorder) throw new Error('Finalize a gravação anterior antes de iniciar outra');
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder não suportado neste ambiente');
    const stream = this.canvas.captureStream(this.targetFps);
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
    cancelAnimationFrame(this.frame); this.canvas = null; this.renderContext = null; this.clearPreview();
    this.onPerformance = undefined;
    this.onRecordingRecovered = undefined;
    this.onRecordingStopped = undefined;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recordingStream?.getVideoTracks().forEach(track => track.stop());
    this.recordingStream = null;
    for (const id of [...this.sources.keys()]) this.remove(id);
  }
}
