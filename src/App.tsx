import { useEffect, useRef, useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import { WmixEngine, type PipLayout, type WmixSource } from "./engine/WmixEngine";
import { WmixAudioEngine, type AudioInput } from "./engine/WmixAudioEngine";

type ScenePreset = { name: string; layout: PipLayout; overlayName: string | null };
const PRESETS_KEY = "wmix-scene-presets-v1";
function readPresets(): ScenePreset[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ScenePreset => !!item && typeof item.name === "string" && typeof item.layout?.x === "number" && typeof item.layout?.y === "number" && typeof item.layout?.width === "number" && (item.overlayName === null || typeof item.overlayName === "string")).slice(0, 20);
  } catch { return []; }
}
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
  const [overlay, setOverlay] = useState<string>("");
  const [pipLayout, setPipLayout] = useState<PipLayout>(() => {
    try { const saved = localStorage.getItem("wmix-pip-layout"); return saved ? JSON.parse(saved) as PipLayout : { x: 0.685, y: 0.68, width: 0.29 }; }
    catch { return { x: 0.685, y: 0.68, width: 0.29 }; }
  });
  const [presets, setPresets] = useState<ScenePreset[]>(readPresets);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordBus, setRecordBus] = useState<"master" | "a" | "b">("master");
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    engine.onSourcesChanged = () => { setSources(engine.list()); setOverlay(engine.currentOverlay() ?? ""); };
    engine.setPipLayout(pipLayout);
    audio.onChange = setInputs;
    audio.setMaster(0.78, false);
    engine.onProgramChanged = setProgram;
    if (canvas.current) engine.attach(canvas.current);
    return () => { engine.dispose(); audio.dispose(); };
  }, [engine, audio]);
  function updatePipLayout(next: PipLayout) {
    engine.setPipLayout(next);
    const normalized = engine.currentPipLayout();
    setPipLayout(normalized);
    try { localStorage.setItem("wmix-pip-layout", JSON.stringify(normalized)); } catch { /* storage optional */ }
  }
  function saveScene() {
    const name = presetName.trim().slice(0, 40);
    if (!name) { setError("Informe um nome para a cena."); return; }
    const next = [...presets.filter(p => p.name !== name), { name, layout: engine.currentPipLayout(), overlayName: sources.find(s => s.id === overlay)?.name ?? null }].slice(-20);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); setPresets(next); setSelectedPreset(name); setError(""); }
    catch { setError("Não foi possível salvar a cena neste navegador."); }
  }
  function loadScene(name: string) {
    setSelectedPreset(name);
    const preset = presets.find(p => p.name === name);
    if (!preset) return;
    updatePipLayout(preset.layout);
    const source = sources.find(s => s.name === preset.overlayName);
    engine.setOverlay(source?.id ?? null);
    setOverlay(source?.id ?? "");
    setError(preset.overlayName && !source ? "Layout carregado. Conecte a fonte de vídeo correspondente para restaurar o PiP." : "");
  }
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
    setError("");
    try {
      if (!recording) {
        const selectedAudio = recordBus === "master" ? audio.output() : audio.busOutput(recordBus);
        engine.startRecording(selectedAudio);
        setRecording(true);
        return;
      }
      const blob = await engine.stopRecording();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wmix-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (recording) setRecording(false);
    }
  }
  return <>
    <Switcher nativeAudio={inputs} nativeAudioVolume={(id, volume) => audio.setVolume(id, volume)} nativeAudioMute={(id, muted) => audio.setMute(id, muted)} nativeAudioCue={(id, enabled) => audio.setCue(id, enabled)} nativeAudioRemove={id => audio.remove(id)} nativeMasterChange={(volume, muted) => audio.setMaster(volume, muted)} nativeBusVolume={(bus, volume) => audio.setBusVolume(bus, volume)} nativeBusSend={(id, bus, enabled) => audio.setBusSend(id, bus, enabled)} nativeSources={sources} nativeProgram={program} nativeCut={id => engine.setProgram(id)} nativeFade={(id, ms) => engine.transitionTo(id, ms)} nativeAdd={addCamera} nativeRecord={toggleRecording} nativeRecording={recording} />
    <canvas ref={canvas} width={1280} height={720} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true" />
    <div className="fixed bottom-12 right-3 z-[120] flex flex-wrap gap-2">
      <select aria-label="Fonte de sobreposição PiP" title="Segunda câmera sobre o Program" value={overlay} onChange={e => { engine.setOverlay(e.target.value || null); setOverlay(e.target.value); }} className="max-w-40 rounded border border-border bg-card px-2 py-2 text-xs text-foreground"><option value="">PiP: desligado</option>{sources.filter(source => source.id !== program).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
      {overlay && <div className="flex items-center gap-2 rounded border border-border bg-card px-2 text-xs text-foreground">{(["x", "y", "width"] as const).map(key => <label key={key} className="flex items-center gap-1">{key === "width" ? "Tamanho" : key.toUpperCase()}<input type="range" aria-label={`PiP ${key}`} min="0" max={key === "width" ? "80" : "90"} value={Math.round(pipLayout[key] * 100)} onChange={e => updatePipLayout({ ...pipLayout, [key]: Number(e.target.value) / 100 })} className="w-16 accent-primary" /></label>)}</div>}
      <div className="flex items-center gap-1 rounded border border-border bg-card px-1"><input aria-label="Nome da cena" placeholder="Nome da cena" value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={40} className="w-28 bg-card p-1 text-xs text-foreground" /><button type="button" onClick={saveScene} className="rounded bg-secondary px-2 py-1 text-xs text-foreground">Salvar cena</button><select aria-label="Carregar cena salva" value={selectedPreset} onChange={e => loadScene(e.target.value)} className="max-w-32 bg-card p-1 text-xs text-foreground"><option value="">Cenas salvas</option>{presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
      <select aria-label="Áudio da gravação" title="Selecione o barramento usado na gravação" value={recordBus} disabled={recording} onChange={e => setRecordBus(e.target.value as "master" | "a" | "b")} className="rounded border border-border bg-card px-2 py-2 text-xs text-foreground"><option value="master">REC: MASTER</option><option value="a">REC: BUS A</option><option value="b">REC: BUS B</option></select>
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
