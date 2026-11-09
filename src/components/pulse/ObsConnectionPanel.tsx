import { useEffect, useRef, useState } from "react";
import { ObsWebSocketClient, type ObsStudioState } from "../../integrations/obs/ObsWebSocketClient";

/** Optional OBS remote status; never replaces the independent wMix Canvas Program. */
export function ObsConnectionPanel() {
  const client = useRef<ObsWebSocketClient | null>(null);
  const [endpoint, setEndpoint] = useState("ws://127.0.0.1:4455");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ObsStudioState>({
    connected: false, studioMode: false, previewScene: null, programScene: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const obs = new ObsWebSocketClient();
    client.current = obs;
    obs.onStateChange = setState;
    return () => { obs.onStateChange = undefined; obs.disconnect(); client.current = null; };
  }, []);

  async function connect() {
    const obs = client.current;
    if (!obs) return;
    setBusy(true);
    setError("");
    try {
      await obs.connect(endpoint, password);
      setPassword("");
      await obs.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao conectar ao OBS.");
      obs.disconnect();
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!client.current) return;
    setBusy(true);
    setError("");
    try { await client.current.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao consultar o OBS."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Conexão opcional OBS Studio" className="rounded-lg border border-border bg-card p-3 text-foreground shadow-sm">
    <div className="mb-2 flex items-center justify-between gap-2">
      <strong className="text-xs">OBS Studio · controle remoto</strong>
      <span role="status" className={`text-xs ${state.connected ? "text-green-500" : "text-muted-foreground"}`}>
        {state.connected ? "Conectado" : "Desconectado"}
      </span>
    </div>
    <p className="mb-2 text-[11px] text-muted-foreground">Estado externo do OBS; não altera o Preview/Program do wMix.</p>
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
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50">Atualizar</button>
        <button type="button" onClick={() => client.current?.disconnect()} className="rounded border border-border px-2 py-1 text-xs">Desconectar</button>
      </div>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
  </section>;
}
