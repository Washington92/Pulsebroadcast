import { useEffect, useRef, useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import { WmixEngine, type WmixSource } from "./engine/WmixEngine";
import { WmixAudioEngine, type AudioInput } from "./engine/WmixAudioEngine";

/** Official Lovable interface, powered by independent wMix capture/composition. */
export default function App() {
  const [engine] = useState(() => new WmixEngine());
  const [audio] = useState(() => new WmixAudioEngine());
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [sources, setSources] = useState<WmixSource[]>([]);
  const [program, setProgram] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    engine.onSourcesChanged = () => setSources(engine.list());
    audio.onChange = setInputs;
    engine.onProgramChanged = setProgram;
    if (canvas.current) engine.attach(canvas.current);
    return () => { engine.dispose(); audio.dispose(); };
  }, [engine, audio]);
  async function addCamera() {
    setError("");
    try { await engine.addCamera(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function addScreen() {
    setError("");
    try { await engine.addScreen(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function addMicrophone() {
    setError("");
    try { await audio.addMicrophone(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function toggleRecording() {
    if (!recording) { engine.startRecording(audio.output()); setRecording(true); return; }
    const blob = await engine.stopRecording(); setRecording(false);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url;
    link.download = `wmix-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <>
    <Switcher nativeSources={sources} nativeProgram={program} nativeCut={id => engine.setProgram(id)} nativeFade={(id, ms) => engine.transitionTo(id, ms)} nativeAdd={addCamera} nativeRecord={toggleRecording} nativeRecording={recording} />
    <canvas ref={canvas} width={1280} height={720} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true" />
    <div className="fixed bottom-12 right-3 z-[120] flex gap-2">
      <button onClick={() => void addCamera()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Câmera real</button>
      <button onClick={() => void addScreen()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Capturar tela</button>
      <button onClick={() => void addMicrophone()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Microfone</button>
    </div>
    {inputs.length > 0 && <aside aria-label="Mixer de áudio wMix" className="fixed bottom-24 right-3 z-[119] max-h-52 w-72 overflow-auto rounded-lg border border-border bg-card p-3 text-foreground shadow-xl">
      <h2 className="mb-2 text-sm font-bold">Áudio • wMix Engine</h2>
      {inputs.map(input => <div key={input.id} className="mb-3 text-xs">
        <div className="mb-1 flex items-center justify-between gap-2"><span className="truncate" title={input.name}>{input.name}</span><button onClick={() => audio.setMute(input.id, !input.muted)} className="rounded border border-border px-2 py-1">{input.muted ? "Ativar" : "Mute"}</button></div>
        <div className="mb-1 h-1.5 overflow-hidden rounded bg-secondary"><div className="h-full bg-green-500" style={{ width: `${Math.round(input.level * 100)}%` }} /></div>
        <input aria-label={`Volume de ${input.name}`} type="range" min="0" max="100" value={Math.round(input.volume * 100)} onChange={e => audio.setVolume(input.id, Number(e.target.value) / 100)} className="w-full" />
      </div>)}
    </aside>}
    {error && <div role="alert" className="fixed bottom-24 right-3 z-[120] max-w-sm rounded bg-red-950 p-3 text-xs text-white">{error}</div>}
    <div className="wmix-demo-note" role="status">{sources.length ? `wMix Engine • ${sources.length} fonte(s) real(is) • Gravação WebM com áudio quando microfone conectado` : "Interface Lovable • Adicione câmera ou tela para ativar o motor próprio • Sem OBS"}</div>
  </>;
}
