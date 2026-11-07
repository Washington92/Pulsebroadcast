import { useEffect, useRef, useState } from "react";
import { WmixEngine, type WmixSource } from "../engine/WmixEngine";

function Preview({ engine, id }: { engine: WmixEngine; id: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = id ? engine.list().find(s => s.id === id)?.stream ?? null : null;
    if (el.srcObject) void el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [engine, id]);
  return <video ref={ref} autoPlay muted playsInline className="h-full w-full bg-black object-contain" />;
}
export default function NativeSwitcher() {
  const [engine] = useState(() => new WmixEngine());
  const [sources, setSources] = useState<WmixSource[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [program, setProgram] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    engine.onSourcesChanged = () => setSources(engine.list());
    engine.onProgramChanged = setProgram;
    if (canvasRef.current) engine.attach(canvasRef.current);
    return () => engine.dispose();
  }, [engine]);
  async function add(kind: "camera" | "screen") {
    setBusy(true); setError("");
    try { const id = kind === "camera" ? await engine.addCamera() : await engine.addScreen(); setPreview(id); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function cut() {
    if (!preview) return;
    const old = engine.currentProgram();
    try { engine.setProgram(preview); setPreview(old); }
    catch (e) { setError(String(e)); }
  }
  async function toggleRecording() {
    setError("");
    try {
      if (!recording) { engine.startRecording(); setRecording(true); return; }
      const blob = await engine.stopRecording(); setRecording(false);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `wmix-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div><h1 className="text-2xl font-bold tracking-tight"><span className="text-primary">w</span>Mix <span className="text-xs font-normal text-muted-foreground">ENGINE 0.1</span></h1><p className="text-xs text-muted-foreground">Produção independente • Sem OBS Studio</p></div>
      <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void add("camera")} className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">+ Câmera</button><button disabled={busy} onClick={() => void add("screen")} className="rounded border border-border bg-secondary px-4 py-2">+ Tela</button></div>
    </header>
    {error && <div role="alert" className="mb-4 rounded border border-red-500 bg-red-950 p-3 text-sm">{error}</div>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="overflow-hidden rounded-lg border-2 border-green-600 bg-card"><h2 className="p-3 text-sm font-bold text-green-400">PREVIEW · {sources.find(s => s.id === preview)?.name ?? "Sem fonte"}</h2><div className="aspect-video bg-black"><Preview engine={engine} id={preview}/></div></section>
      <section className="overflow-hidden rounded-lg border-2 border-red-600 bg-card"><h2 className="p-3 text-sm font-bold text-red-400">PROGRAM · {sources.find(s => s.id === program)?.name ?? "Sem fonte"}</h2><canvas ref={canvasRef} width={1280} height={720} className="aspect-video w-full bg-black"/></section>
    </div>
    <div className="my-5 flex flex-wrap items-center justify-center gap-3"><button onClick={cut} disabled={!preview} className="rounded bg-red-700 px-8 py-3 font-bold text-white disabled:opacity-40">CUT</button><button onClick={() => void toggleRecording()} disabled={!program} className="rounded border border-red-600 px-5 py-3 font-semibold">{recording ? "■ Parar e salvar WebM" : "● Gravar Program"}</button></div>
    <section className="rounded-lg border border-border bg-card p-4"><h2 className="mb-3 font-semibold">Fontes de vídeo</h2>{sources.length === 0 && <p className="text-sm text-muted-foreground">Adicione uma câmera ou compartilhe uma tela para iniciar.</p>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{sources.map(source => <div key={source.id} className="rounded border border-border bg-secondary p-2"><div className="aspect-video overflow-hidden bg-black"><Preview engine={engine} id={source.id}/></div><p className="my-2 truncate text-xs" title={source.name}>{source.name}</p><div className="flex gap-2"><button onClick={() => setPreview(source.id)} className="rounded bg-green-800 px-2 py-1 text-xs">Preview</button><button onClick={() => engine.remove(source.id)} disabled={recording} className="rounded bg-slate-700 px-2 py-1 text-xs disabled:opacity-40">Remover</button></div></div>)}</div></section>
    <p className="mt-4 text-xs text-muted-foreground">MVP: captura e composição reais pelo navegador/WebView. Gravação WebM de vídeo sem áudio. RTMP, áudio, transições e motor Windows nativo ainda não implementados.</p>
  </main>;
}
