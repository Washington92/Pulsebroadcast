import { useEffect, useState } from "react";

type RuntimeStatus = { initialized: boolean; version: string | null; message: string };
type TauriBridge = { core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<RuntimeStatus> } };
const bridge = () => (window as Window & { __TAURI__?: TauriBridge }).__TAURI__?.core?.invoke;

export function NativeEnginePanel() {
  const [path, setPath] = useState("C:\\Program Files\\obs-studio\\bin\\64bit\\obs.dll");
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const invoke = bridge();
  useEffect(() => {
    if (!invoke) return;
    let active = true;
    void invoke("libobs_status").then(value => { if (active) setStatus(value); })
      .catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [invoke]);
  async function run(command: "start_libobs" | "stop_libobs") {
    if (!invoke) return;
    setBusy(true);
    setError("");
    try { setStatus(await invoke(command, command === "start_libobs" ? { path } : {})); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <section className="fixed bottom-2 left-3 z-[130] max-w-[95vw] rounded-lg border border-border bg-card p-2 text-xs text-foreground shadow-lg" aria-label="Motor nativo libobs">
    <div className="mb-1 flex items-center gap-2">
      <strong>Motor libobs</strong>
      <span role="status">{!invoke ? "Somente no desktop Tauri" : status?.initialized ? "Inicializado (sem vídeo)" : "Desligado"}</span>
    </div>
    {invoke && <>
      <label className="flex items-center gap-2">DLL
        <input aria-label="Caminho obs.dll" className="w-56 max-w-[45vw] rounded border border-border bg-background px-1 py-1" value={path} onChange={e => setPath(e.target.value)} disabled={busy || !!status?.initialized} />
      </label>
      <div className="mt-1 flex gap-2">
        <button className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50" disabled={busy || !!status?.initialized} onClick={() => void run("start_libobs")}>Inicializar</button>
        <button className="rounded bg-secondary px-2 py-1 disabled:opacity-50" disabled={busy || !status?.initialized} onClick={() => void run("stop_libobs")}>Encerrar</button>
      </div>
      {status?.message && <p className="mt-1 max-w-72 text-muted-foreground">{status.message}</p>}
      {status?.version && <p>libobs {status.version}</p>}
    </>}
    {error && <p role="alert" className="mt-1 max-w-72 text-red-500">{error}</p>}
  </section>;
}
