import { useEffect, useRef, useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import { WmixEngine, type WmixSource } from "./engine/WmixEngine";

/** Official Lovable interface, powered by independent wMix capture/composition. */
export default function App() {
  const [engine] = useState(() => new WmixEngine());
  const [sources, setSources] = useState<WmixSource[]>([]);
  const [program, setProgram] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    engine.onSourcesChanged = () => setSources(engine.list());
    engine.onProgramChanged = setProgram;
    if (canvas.current) engine.attach(canvas.current);
    return () => engine.dispose();
  }, [engine]);
  async function addCamera() {
    setError("");
    try { await engine.addCamera(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function addScreen() {
    setError("");
    try { await engine.addScreen(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function toggleRecording() {
    if (!recording) { engine.startRecording(); setRecording(true); return; }
    const blob = await engine.stopRecording(); setRecording(false);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url;
    link.download = `wmix-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <>
    <Switcher nativeSources={sources} nativeProgram={program} nativeCut={id => engine.setProgram(id)} nativeAdd={addCamera} nativeRecord={toggleRecording} nativeRecording={recording} />
    <canvas ref={canvas} width={1280} height={720} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true" />
    <div className="fixed bottom-12 right-3 z-[120] flex gap-2">
      <button onClick={() => void addCamera()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Câmera real</button>
      <button onClick={() => void addScreen()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Capturar tela</button>
    </div>
    {error && <div role="alert" className="fixed bottom-24 right-3 z-[120] max-w-sm rounded bg-red-950 p-3 text-xs text-white">{error}</div>}
    <div className="wmix-demo-note" role="status">{sources.length ? `wMix Engine • ${sources.length} fonte(s) real(is) • Gravação WebM sem áudio` : "Interface Lovable • Adicione câmera ou tela para ativar o motor próprio • Sem OBS"}</div>
  </>;
}
