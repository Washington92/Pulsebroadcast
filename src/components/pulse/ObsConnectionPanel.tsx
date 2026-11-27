import { useEffect, useRef, useState } from "react";
import { ObsWebSocketClient, type ObsStudioState } from "../../integrations/obs/ObsWebSocketClient";

/** Optional remote OBS control. Video frames remain in OBS Studio; this panel does not replace wMix monitors. */
export function ObsConnectionPanel() {
  const client = useRef<ObsWebSocketClient | null>(null);
  const [endpoint, setEndpoint] = useState("ws://127.0.0.1:4455");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ObsStudioState>({
    connected: false, studioMode: false, previewScene: null, programScene: null,
  });
  const [scenes, setScenes] = useState<string[]>([]);
  const [selectedScene, setSelectedScene] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const obs = new ObsWebSocketClient();
    client.current = obs;
    obs.onStateChange = setState;
    return () => { obs.onStateChange = undefined; obs.disconnect(); client.current = null; };
  }, []);

  async function loadState() {
    const obs = client.current;
    if (!obs) return;
    const [snapshot, names] = await Promise.all([obs.refresh(), obs.scenes()]);
    setState(snapshot);
    setScenes(names);
    setSelectedScene(current => {
      if (names.includes(current)) return current;
      const preferred = snapshot.previewScene ?? snapshot.programScene;
      return preferred && names.includes(preferred) ? preferred : names[0] ?? "";
    });
  }

  async function connect() {
    const obs = client.current;
    if (!obs) return;
    setBusy(true);
    setError("");
    try {
      await obs.connect(endpoint, password);
      setPassword("");
      await loadState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao conectar ao OBS.");
      setPassword("");
      obs.disconnect();
      setScenes([]);
      setSelectedScene("");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: (obs: ObsWebSocketClient) => Promise<unknown>) {
    const obs = client.current;
    if (!obs) return;
    setBusy(true);
    setError("");
    try {
      await action(obs);
      await loadState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao executar comando no OBS.");
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Conexão opcional OBS Studio" className="rounded-lg border border-border bg-card p-3 text-foreground shadow-sm">
    <div className="mb-2 flex items-center justify-between gap-2">
      <strong className="text-xs">OBS Studio · controle remoto</strong>
      <span role="status" className={`text-xs ${state.connected ? "text-green-500" : "text-muted-foreground"}`}>
        {state.connected ? "Conectado" : "Desconectado"}
      </span>
    </div>
    <p className="mb-2 text-[11px] text-muted-foreground">Os comandos atuam no OBS Studio. O vídeo do OBS ainda não é incorporado aos monitores Preview/Program do wMix.</p>
    {!state.connected ? <div className="flex flex-wrap gap-2">
      <input aria-label="Endereço OBS WebSocket" value={endpoint} onChange={event => setEndpoint(event.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs" />
      <input aria-label="Senha OBS WebSocket" type="password" autoComplete="off" placeholder="Senha OBS"
        value={password} onChange={event => setPassword(event.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs" />
      <button type="button" disabled={busy} onClick={() => void connect()} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50">
        {busy ? "Conectando…" : "Conectar"}
      </button>
    </div> : <>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-border p-2"><span className="block text-muted-foreground">OBS PREVIEW</span><strong>{state.studioMode ? state.previewScene ?? "Sem cena" : "Studio Mode desligado"}</strong></div>
        <div className="rounded border border-border p-2"><span className="block text-muted-foreground">OBS PROGRAM</span><strong>{state.programScene ?? "Sem cena"}</strong></div>
      </div>
      <label className="mt-3 block space-y-1 text-xs">
        Cena para controle remoto
        <select aria-label="Cena OBS para controle remoto" value={selectedScene} onChange={event => setSelectedScene(event.target.value)}
          disabled={busy || scenes.length === 0} className="w-full rounded border border-border bg-background px-2 py-2 disabled:opacity-50">
          {scenes.length === 0 ? <option value="">Nenhuma cena encontrada</option> : scenes.map(scene => <option key={scene} value={scene}>{scene}</option>)}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy || !selectedScene || !state.studioMode}
          onClick={() => void runAction(obs => obs.setCurrentPreviewScene(selectedScene))}
          className="rounded border border-border px-2 py-2 text-xs disabled:opacity-40">Preparar Preview</button>
        <button type="button" disabled={busy || !selectedScene}
          onClick={() => void runAction(obs => obs.setCurrentProgramScene(selectedScene))}
          className="rounded bg-primary px-2 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">CUT → Program</button>
        <button type="button" disabled={busy || !selectedScene || !state.studioMode}
          onClick={() => void runAction(async obs => { await obs.setCurrentPreviewScene(selectedScene); await obs.triggerStudioTransition(); })}
          className="col-span-2 rounded border border-primary/50 bg-primary/10 px-2 py-2 text-xs font-semibold text-foreground disabled:opacity-40">TAKE → Program · transição selecionada no OBS</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void runAction(obs => obs.setStudioModeEnabled(!state.studioMode))}
          className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50">{state.studioMode ? "Desativar Studio Mode" : "Ativar Studio Mode"}</button>
        <button type="button" disabled={busy} onClick={() => void runAction(obs => obs.refresh().then(() => undefined))}
          className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50">Atualizar</button>
        <button type="button" disabled={busy} onClick={() => { client.current?.disconnect(); setScenes([]); setSelectedScene(""); }}
          className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50">Desconectar</button>
      </div>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
  </section>;
}
