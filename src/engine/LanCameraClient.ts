/**
 * Experimental LAN bridge adapter: fetch JPEG frames into a canvas MediaStream.
 * Maximum useful frame rate is limited by Android sender (~2 fps).
 * No audio, encryption, adaptive bitrate or production-grade latency.
 */
export class LanCameraClient {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  readonly stream: MediaStream;
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private constructor(
    readonly endpoint: string, readonly cameraId: string, private readonly token: string,
  ) {
    this.canvas.width = 640;
    this.canvas.height = 360;
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D não disponível");
    this.ctx = context;
    this.stream = this.canvas.captureStream(5);
    this.tick();
  }

  static connect(endpoint: string, cameraId: string, token: string): LanCameraClient {
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(endpoint))
      throw new Error("Use o receptor local http://127.0.0.1:8787");
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(cameraId)) throw new Error("ID da câmera inválido");
    if (token.length < 20) throw new Error("Token insuficiente");
    return new LanCameraClient(endpoint, cameraId, token);
  }

  private async tick() {
    if (this.closed) return;
    try {
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 1800);
      try {
        const response = await fetch(`${this.endpoint}/api/frame?id=${encodeURIComponent(this.cameraId)}`, {
          headers: { Authorization: `Bearer ${this.token}` }, signal: controller.signal, cache: "no-store",
        });
        if (response.ok) {
          const image = await createImageBitmap(await response.blob());
          try {
            this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
          } finally { image.close(); }
        }
      } finally { clearTimeout(requestTimeout); }
    } catch {
      // No synthetic image: retain last received frame until a future successful fetch.
    }
    if (!this.closed) this.timer = setTimeout(() => void this.tick(), 500);
  }

  async setTally(state: "PROGRAM" | "PREVIEW" | "STANDBY"): Promise<void> {
    if (this.closed) return;
    await fetch(`${this.endpoint}/api/tally?id=${encodeURIComponent(this.cameraId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
  }

  disconnect() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.stream.getTracks().forEach(track => track.stop());
  }
}
