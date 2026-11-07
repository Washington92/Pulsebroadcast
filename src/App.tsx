import { useEffect, useRef, useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import { WmixEngine, type WmixSource } from "./engine/WmixEngine";
import { WmixAudioEngine, type AudioInput } from "./engine/WmixAudioEngine";

/** Official Lovable interface, powered by independent wMix capture/composition. */
export default function App() {
  const [engine] = useState(() => new WmixEngine());
  const [audio] = useState(() => new WmixAudioEngine());
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophone, setSelectedMicrophone] = useState("");
  const [sources, setSources] = useState<WmixSource[]>([]);
  const [program, setProgram] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    engine.onSourcesChanged = () => setSources(engine.list());
    audio.onChange = setInputs;
    audio.setMaster(0.78, false);
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
  async function refreshMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter(device => device.kind === "audioinput"));
      setOutputs(devices.filter(device => device.kind === "audiooutput"));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function addMicrophone() {
    setError("");
    try { await audio.addMicrophone(selectedMicrophone || undefined); await refreshMicrophones(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
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
    <Switcher nativeAudio={inputs} nativeAudioVolume={(id, volume) => audio.setVolume(id, volume)} nativeAudioMute={(id, muted) => audio.setMute(id, muted)} nativeAudioCue={(id, enabled) => audio.setCue(id, enabled)} nativeAudioRemove={id => audio.remove(id)} nativeMasterChange={(volume, muted) => audio.setMaster(volume, muted)} nativeSources={sources} nativeProgram={program} nativeCut={id => engine.setProgram(id)} nativeFade={(id, ms) => engine.transitionTo(id, ms)} nativeAdd={addCamera} nativeRecord={toggleRecording} nativeRecording={recording} />
    <canvas ref={canvas} width={1280} height={720} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true" />
    <div className="fixed bottom-12 right-3 z-[120] flex gap-2">
      <button onClick={() => void addCamera()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Câmera real</button>
      <button onClick={() => void addScreen()} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Capturar tela</button>
      <select aria-label="Saída de pré-escuta" defaultValue="" onFocus={() => void refreshMicrophones()} onChange={e => { if (e.target.value) void audio.setCueOutput(e.target.value).catch(err => setError(String(err))); }} className="max-w-40 rounded border border-border bg-card p-2 text-xs text-foreground">
        <option value="">Fones: saída padrão</option>
        {outputs.filter(device => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Saída ${index + 1}`}</option>)}
      </select>
      <div className="flex items-center gap-1 rounded border border-border bg-card px-1">
        <select aria-label="Dispositivo de microfone" value={selectedMicrophone} onFocus={() => void refreshMicrophones()} onChange={e => setSelectedMicrophone(e.target.value)} className="max-w-36 bg-card p-1 text-xs text-foreground">
          <option value="">Microfone padrão</option>
          {microphones.filter(device => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}
        </select>
        <button type="button" onClick={() => void refreshMicrophones()} title="Atualizar dispositivos" aria-label="Atualizar dispositivos de áudio" className="px-1 text-xs text-foreground">↻</button>
        <button onClick={() => void addMicrophone()} className="rounded bg-secondary px-2 py-2 text-xs font-semibold text-foreground">+ Microfone</button>
      </div>
    </div>
    {error && <div role="alert" className="fixed bottom-24 right-3 z-[120] max-w-sm rounded bg-red-950 p-3 text-xs text-white">{error}</div>}
    <div className="wmix-demo-note" role="status">{sources.length ? `wMix Engine • ${sources.length} fonte(s) real(is) • Gravação WebM com áudio quando microfone conectado` : "Interface Lovable • Adicione câmera ou tela para ativar o motor próprio • Sem OBS"}</div>
  </>;
}
