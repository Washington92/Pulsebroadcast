/**
 * Optional OBS Studio WebSocket v5 client.
 * No connection is made until connect() is explicitly called.
 * Passwords are kept in memory only and are never logged or persisted.
 */
export type ObsStudioState = {
  connected: boolean;
  studioMode: boolean;
  previewScene: string | null;
  programScene: string | null;
};

type ObsMessage = { op: number; d?: Record<string, unknown> };
type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
};

const encoder = new TextEncoder();

async function sha256Base64(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("OBS authentication requires a secure context (Web Crypto).");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function authentication(password: string, salt: string, challenge: string): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

export class ObsWebSocketClient {
  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private sequence = 0;
  private generation = 0;
  private state: ObsStudioState = { connected: false, studioMode: false, previewScene: null, programScene: null };
  onStateChange?: (state: ObsStudioState) => void;

  snapshot(): ObsStudioState { return { ...this.state }; }

  private publish(next: Partial<ObsStudioState>): void {
    this.state = { ...this.state, ...next };
    this.onStateChange?.(this.snapshot());
  }

  async connect(url: string, password = ""): Promise<void> {
    this.disconnect();
    const parsed = new URL(url);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") throw new Error("OBS requires a ws:// or wss:// URL.");
    const generation = ++this.generation;
    const socket = new WebSocket(parsed.toString());
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (reason: Error) => {
        if (!settled) { settled = true; reject(reason); }
        if (this.socket === socket) this.disconnect();
      };
      const timeout = setTimeout(() => fail(new Error("OBS connection timed out.")), 10000);
      socket.onmessage = async event => {
        if (generation !== this.generation) return;
        try {
          const message = JSON.parse(String(event.data)) as ObsMessage;
          if (message.op === 0) {
            const auth = message.d?.authentication as { salt?: string; challenge?: string } | undefined;
            if (auth && (!password || !auth.salt || !auth.challenge)) throw new Error("OBS authentication credentials are required.");
            const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 1 << 2 };
            if (auth) identify.authentication = await authentication(password, auth.salt!, auth.challenge!);
            socket.send(JSON.stringify({ op: 1, d: identify }));
          } else if (message.op === 2) {
            clearTimeout(timeout);
            this.publish({ connected: true });
            if (!settled) { settled = true; resolve(); }
          } else if (message.op === 5) {
            const type = message.d?.eventType;
            const data = (message.d?.eventData ?? {}) as Record<string, unknown>;
            if (type === "CurrentProgramSceneChanged") this.publish({ programScene: String(data.sceneName ?? "") });
            if (type === "CurrentPreviewSceneChanged") this.publish({ previewScene: String(data.sceneName ?? "") });
            if (type === "StudioModeStateChanged") this.publish({ studioMode: data.studioModeEnabled === true });
          } else if (message.op === 7) {
            const id = String(message.d?.requestId ?? "");
            const pending = this.pending.get(id);
            if (!pending) return;
            this.pending.delete(id);
            const status = message.d?.requestStatus as { result?: boolean; comment?: string } | undefined;
            if (status?.result) pending.resolve((message.d?.responseData ?? {}) as Record<string, unknown>);
            else pending.reject(new Error(status?.comment ?? "OBS request failed."));
          }
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      };
      socket.onerror = () => fail(new Error("OBS WebSocket connection failed."));
      socket.onclose = () => {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(new Error("OBS disconnected before identification.")); }
        if (this.socket === socket) this.disconnect();
      };
    });
  }

  request(type: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.state.connected)
      return Promise.reject(new Error("OBS is not connected."));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data } }));
    });
  }

  async refresh(): Promise<ObsStudioState> {
    const [mode, program] = await Promise.all([
      this.request("GetStudioModeEnabled"),
      this.request("GetCurrentProgramScene")
    ]);
    const studioMode = mode.studioModeEnabled === true;
    const preview = studioMode ? await this.request("GetCurrentPreviewScene") : null;
    this.publish({
      studioMode,
      programScene: typeof program.currentProgramSceneName === "string" ? program.currentProgramSceneName : null,
      previewScene: typeof preview?.currentPreviewSceneName === "string" ? preview.currentPreviewSceneName : null
    });
    return this.snapshot();
  }

  disconnect(): void {
    ++this.generation;
    const socket = this.socket;
    this.socket = null;
    if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); }
    for (const request of this.pending.values()) request.reject(new Error("OBS disconnected."));
    this.pending.clear();
    this.publish({ connected: false, studioMode: false, previewScene: null, programScene: null });
  }
}
