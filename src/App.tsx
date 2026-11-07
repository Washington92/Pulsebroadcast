import { useEffect, useRef, useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import { WmixEngine, type PipLayout, type WmixSource } from "./engine/WmixEngine";
import { WmixAudioEngine, type AudioInput } from "./engine/WmixAudioEngine";

type ScenePreset = { name: string; layout: PipLayout; overlayName: string | null; baseName?: string | null };
const PRESETS_KEY = "wmix-scene-presets-v1";
function readPresets(): ScenePreset[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ScenePreset => !!item && typeof item.name === "string" && typeof item.layout?.x === "number" && typeof item.layout?.y === "number" && typeof item.layout?.width === "number" && (item.overlayName === null || typeof item.overlayName === "string")).slice(0, 20);
  } catch { return []; }
}
function ScenePreview({ engine, scene, sources, baseId }: { engine: WmixEngine; scene: ScenePreset; sources: WmixSource[]; baseId: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const overlay = sources.find(s => s.name === scene.overlayName);
    engine.prepareScene(baseId, overlay?.id ?? null, scene.layout);
    engine.attachPreview(ref.current);
    return () => engine.clearPreview();
  }, [engine, scene, sources, baseId]);
  const missing = !!scene.overlayName && !sources.some(s => s.name === scene.overlayName);
  return <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
    <canvas ref={ref} width={1280} height={720} className="h-full w-full" aria-label="Composição de Preview do motor wMix" />
    {missing && <div className="absolute bottom-2 left-2 rounded bg-red-950 px-2 py-1 text-xs text-white">Fonte PiP indisponível: {scene.overlayName}</div>}
  </div>;
}

/** Official Lovable interface, powered by independent wMix capture/composition. */
export default function App() {
  const [engine] = useState(() => new WmixEngine());
  const [audio] = useState(() => new WmixAudioEngine());
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
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
  const [stagedScene, setStagedScene] = useState<ScenePreset | null>(null);
  const [stagedBase, setStagedBase] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState({ fps: 0, droppedFrames: 0 });
  const [recordBus, setRecordBus] = useState<"master" | "a" | "b">("master");
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const projectFile = useRef<HTMLInputElement>(null);
  const imageFile = useRef<HTMLInputElement>(null);
  const videoFile = useRef<HTMLInputElement>(null);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [showInputPicker, setShowInputPicker] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashProgress, setSplashProgress] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = now - started;
      // Progress represents the startup animation, not a fabricated percentage of engine readiness.
      const next = Math.min(100, Math.round(elapsed / 26));
      setSplashProgress(next);
      if (next < 100) frame = requestAnimationFrame(animate);
      else frame = requestAnimationFrame(() => setSplashVisible(false));
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const [inputSearch, setInputSearch] = useState("");
  const [programStream, setProgramStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    engine.onSourcesChanged = () => { setSources(engine.list()); setOverlay(engine.currentOverlay() ?? ""); };
    void refreshMicrophones();
    const refreshDevices = () => { void refreshMicrophones(); };
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    engine.setPipLayout(pipLayout);
    audio.onChange = setInputs;
    audio.setMaster(0.78, false);
    engine.onProgramChanged = setProgram;
    engine.onPerformance = setPerformanceMetrics;
    engine.onRecordingRecovered = blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wmix-recuperado-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    engine.onRecordingStopped = failure => {
      setRecording(false);
      if (failure) setError(failure.message);
      else setError(previous => previous === "Gravação interrompida inesperadamente." ? "" : previous);
    };
    if (canvas.current) {
      engine.attach(canvas.current);
      if (typeof canvas.current.captureStream === "function") setProgramStream(canvas.current.captureStream(30));
    }
    return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices); engine.onPerformance = undefined; engine.dispose(); audio.dispose(); };
  }, [engine, audio]);
  function updatePipLayout(next: PipLayout) {
    engine.setPipLayout(next);
    const normalized = engine.currentPipLayout();
    setPipLayout(normalized);
    try { localStorage.setItem("wmix-pip-layout", JSON.stringify(normalized)); } catch { /* storage optional */ }
  }
  function exportProject() {
    const project = {
      format: "wmix-project", version: 1,
      savedAt: new Date().toISOString(),
      scenes: presets, pipLayout,
      sources: sources.map(source => ({ name: source.name, kind: source.kind })),
      note: "Dispositivos de captura não são reabertos automaticamente ao importar.",
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "projeto-wmix.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setError("");
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Arquivo de projeto muito grande (máximo 1 MB).");
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== "object") throw new Error("Projeto inválido.");
      const project = value as Record<string, unknown>;
      if (project.format !== "wmix-project" || project.version !== 1 || !Array.isArray(project.scenes)) throw new Error("Formato de projeto incompatível.");
      const layout = project.pipLayout as PipLayout | undefined;
      if (!layout || ![layout.x, layout.y, layout.width].every(n => typeof n === "number" && Number.isFinite(n))) throw new Error("Layout PiP inválido.");
      const scenes = project.scenes as ScenePreset[];
      if (scenes.length > 20 || !scenes.every(p => p && typeof p.name === "string" && p.name.length <= 40 && p.layout && [p.layout.x, p.layout.y, p.layout.width].every(n => typeof n === "number" && Number.isFinite(n)) && (p.overlayName === null || typeof p.overlayName === "string") && (p.baseName == null || typeof p.baseName === "string"))) throw new Error("Cenas inválidas.");
      localStorage.setItem(PRESETS_KEY, JSON.stringify(scenes));
      setPresets(scenes);
      updatePipLayout(layout);
      setStagedScene(null);
      setSelectedPreset("");
      setError("Projeto importado: cenas e layout restaurados. Reconecte as fontes de vídeo manualmente.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { if (projectFile.current) projectFile.current.value = ""; }
  }
  function saveScene() {
    const name = presetName.trim().slice(0, 40);
    if (!name) { setError("Informe um nome para a cena."); return; }
    const next = [...presets.filter(p => p.name !== name), { name, layout: engine.currentPipLayout(), overlayName: sources.find(s => s.id === overlay)?.name ?? null, baseName: sources.find(s => s.id === program)?.name ?? null }].slice(-20);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); setPresets(next); setSelectedPreset(name); setError(""); }
    catch { setError("Não foi possível salvar a cena neste navegador."); }
  }
  function loadScene(name: string) {
    setSelectedPreset(name);
    const preset = presets.find(p => p.name === name);
    if (!preset) return;
    setStagedScene(preset);
    setStagedBase(sources.find(s => s.name === preset.baseName)?.id ?? program);
    setError("");
  }
  function takeScene(mode: "cut" | "fade" = "cut") {
    if (!stagedScene) return;
    const source = sources.find(s => s.name === stagedScene.overlayName);
    if (stagedScene.overlayName && !source) {
      setError("Fonte da cena não encontrada. Conecte a câmera correspondente antes de colocar no ar.");
      return;
    }
    if (!stagedBase || !sources.some(s => s.id === stagedBase)) { setError("Selecione uma câmera principal disponível."); return; }
    if (mode === "fade") engine.transitionTo(stagedBase, 500);
    else engine.setProgram(stagedBase);
    updatePipLayout(stagedScene.layout);
    engine.setOverlay(source?.id ?? null);
    setOverlay(source?.id ?? "");
    setStagedScene(null);
    setStagedBase(null);
    setSelectedPreset("");
    setError("");
  }
  async function addCamera() {
    setError("");
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const available = devices.filter(device => device.kind === "videoinput");
      setCameras(available);
      if (!available.length) { setError("Nenhuma câmera detectada. Conecte uma webcam USB ou habilite a câmera no Windows e tente novamente."); return; }
      const deviceId = available.some(device => device.deviceId === selectedCamera) ? selectedCamera : "";
      if (selectedCamera && !deviceId) setSelectedCamera("");
      await engine.addCamera(deviceId || undefined);
      await refreshMicrophones();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") setError("Câmera não encontrada. Confira se está conectada e selecione uma câmera disponível.");
      else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") setError("Acesso à câmera negado. Verifique as permissões de câmera do Windows.");
      else if (err.name === "NotReadableError" || err.name === "TrackStartError") setError("A câmera não pôde ser aberta. Feche outros aplicativos que possam estar utilizando o dispositivo.");
      else setError(err.message);
    }
  }
  async function reconnectProgramCamera() {
    if (!program || sources.find(source => source.id === program)?.kind !== "camera") { setError("Selecione uma câmera no Program (não uma captura de tela)."); return; }
    setError("");
    try { await engine.reconnectCamera(program, selectedCamera || undefined); await refreshMicrophones(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function addImage(file?: File) {
    if (!file) return;
    setShowInputPicker(false);
    setError("");
    try { await engine.addImage(file); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { if (imageFile.current) imageFile.current.value = ""; }
  }
  async function addVideoFile(file?: File) {
    if (!file) return;
    setShowInputPicker(false);
    setError("");
    try { const id = await engine.addVideoFile(file); setSelectedVideo(id); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { if (videoFile.current) videoFile.current.value = ""; }
  }
  function videoAction(action: "play" | "pause" | "restart" | "loop") {
    try { engine.controlVideo(selectedVideo, action); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function addScreen() {
    setError("");
    try { await engine.addScreen(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function refreshMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter(device => device.kind === "audioinput"));
      setCameras(devices.filter(device => device.kind === "videoinput"));
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
    {splashVisible && <div role="status" aria-label="Inicializando wMix" className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute -left-[18%] -top-[45%] h-[70%] w-[90%] -rotate-[28deg] rounded-[100%] border-b-2 border-[#5dff23] bg-gradient-to-b from-transparent via-[#042609] to-[#08fa16]/50 shadow-[0_0_45px_#00ff00]" />
      <div className="pointer-events-none absolute -bottom-[52%] -right-[18%] h-[90%] w-[100%] -rotate-[24deg] rounded-[100%] border-t-2 border-[#5dff23] bg-gradient-to-t from-transparent via-[#04300a] to-[#09ff17]/40 shadow-[0_0_50px_#00ff00]" />
      <div className="relative flex w-full max-w-5xl flex-col items-center px-8 text-center">
        <div className="relative text-[clamp(80px,13vw,180px)] font-black leading-none tracking-[-0.09em]">wMix<span className="absolute left-[64%] top-0 h-[0.12em] w-[0.4em] -skew-x-[28deg] bg-[#14ff00]" /></div>
        <div className="mt-1 flex w-full max-w-3xl items-center gap-6"><span className="h-px flex-1 bg-gradient-to-l from-[#16ff00] to-transparent" /><p className="whitespace-nowrap text-[clamp(10px,1.6vw,20px)] tracking-[0.3em]">BROADCAST &amp; LIVE PRODUCTION</p><span className="h-px flex-1 bg-gradient-to-r from-[#16ff00] to-transparent" /></div>
        <div className="mt-12 grid w-full max-w-3xl grid-cols-5 divide-x divide-[#13ff00]/40 text-xs sm:text-sm">
          {([{icon:"▣",title:"Produção",sub:"Ao Vivo"},{icon:"◇",title:"Mixagem",sub:"de Fontes"},{icon:"☷",title:"Controle e",sub:"Automação"},{icon:"◉",title:"Transmissão",sub:"Streaming"},{icon:"● REC",title:"Gravação em",sub:"Alta Qualidade"}] as const).map(item => <div key={item.title} className="px-1"><div className="mb-2 text-xl text-[#31ff27] drop-shadow-[0_0_8px_#00ff00] sm:text-3xl">{item.icon}</div><div>{item.title}</div><div>{item.sub}</div></div>)}
        </div>
        <p className="mb-5 mt-14 text-lg font-medium sm:text-2xl">Iniciando o wMix...</p>
        <div role="progressbar" aria-label="Progresso de abertura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={splashProgress} className="h-7 w-full max-w-xl overflow-hidden rounded-full border-2 border-slate-300 bg-[#181818] p-[3px] shadow-[0_0_16px_#17ff00]/20">
          <div className="h-full rounded-full bg-[#25fa08] shadow-[0_0_12px_#21ff00] transition-[width] duration-75 ease-linear" style={{width: `${splashProgress}%`}} />
        </div>
        <p className="mt-4 text-sm text-slate-300">v1.0.0</p>
        <button type="button" onClick={() => setSplashVisible(false)} className="mt-5 text-xs text-slate-500 hover:text-white">Pular introdução</button>
      </div>
      <p className="absolute bottom-7 right-8 text-xs italic text-slate-400">Powered by <strong>Ton Dantas</strong></p>
    </div>}
    <Switcher nativeAudio={inputs} nativeAudioVolume={(id, volume) => audio.setVolume(id, volume)} nativeAudioMute={(id, muted) => audio.setMute(id, muted)} nativeAudioCue={(id, enabled) => audio.setCue(id, enabled)} nativeAudioRemove={id => audio.remove(id)} nativeMasterChange={(volume, muted) => audio.setMaster(volume, muted)} nativeBusVolume={(bus, volume) => audio.setBusVolume(bus, volume)} nativeBusSend={(id, bus, enabled) => audio.setBusSend(id, bus, enabled)} nativeSources={sources} nativeProgram={program} nativeProgramStream={programStream} nativeCut={id => engine.setProgram(id)} nativeFade={(id, ms) => engine.transitionTo(id, ms)} nativeAdd={async () => { setShowInputPicker(true); }} nativeRemove={id => engine.remove(id)} nativeRename={(id, name) => engine.renameSource(id, name)} nativeRecord={toggleRecording} nativeRecording={recording} />
    <input ref={videoFile} type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" className="hidden" aria-label="Selecionar arquivo de vídeo" onChange={e => void addVideoFile(e.target.files?.[0])} />
    <input ref={imageFile} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="hidden" aria-label="Selecionar imagem para input" onChange={e => void addImage(e.target.files?.[0])} />
    {showInputPicker && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setShowInputPicker(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Adicionar input" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-semibold">Adicionar input</h2><p className="text-xs text-muted-foreground">Catálogo de fontes wMix • inspiradas nos fluxos de vMix, Wirecast e OBS</p></div><button type="button" aria-label="Fechar" onClick={() => setShowInputPicker(false)} className="rounded px-2 py-1 text-muted-foreground hover:bg-secondary">✕</button></div>
        <input aria-label="Pesquisar tipos de input" value={inputSearch} onChange={e => setInputSearch(e.target.value)} placeholder="Pesquisar câmera, vídeo, NDI, áudio, navegador..." className="mb-3 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:border-muted-foreground" />
        <div className="overflow-y-auto pr-1">
          {([
            { title: "Câmeras e captura", items: [{ name: "Câmera USB / Webcam", icon: "◉", desc: "Câmera reconhecida pelo Windows", action: "camera" }, { name: "Captura HDMI / SDI", icon: "▣", desc: "Via placa de captura reconhecida como câmera", action: "camera" }, { name: "Câmera IP / RTSP", icon: "◉", desc: "Protocolo de rede", action: "" }, { name: "NDI / SRT", icon: "⇄", desc: "Vídeo profissional pela rede", action: "" }] },
            { title: "Mídia", items: [{ name: "Imagem", icon: "▧", desc: "PNG, JPG, WebP, GIF estático", action: "image" }, { name: "Vídeo", icon: "▶", desc: "MP4, WebM e codecs compatíveis", action: "video" }, { name: "Áudio / Música", icon: "♫", desc: "Arquivos de áudio", action: "" }, { name: "Playlist / Slideshow", icon: "▤", desc: "Lista de mídias", action: "" }] },
            { title: "Tela e aplicativos", items: [{ name: "Tela / Monitor", icon: "▣", desc: "Compartilhar monitor ou janela", action: "screen" }, { name: "Captura de jogo", icon: "◈", desc: "Captura dedicada de jogos", action: "" }, { name: "Região de tela", icon: "▢", desc: "Área selecionada", action: "" }] },
            { title: "Gráficos e composição", items: [{ name: "Título / Lower third", icon: "T", desc: "Textos e GC", action: "" }, { name: "Navegador / URL", icon: "◎", desc: "Páginas e overlays web", action: "" }, { name: "Cor / Gradiente", icon: "◧", desc: "Fundos gráficos", action: "" }, { name: "Cena / Multiview", icon: "▦", desc: "Composição de múltiplas fontes", action: "" }, { name: "Relógio / Cronômetro", icon: "◷", desc: "Elementos temporizados", action: "" }] },
            { title: "Áudio e produção", items: [{ name: "Microfone", icon: "♩", desc: "Adicionar ao mixer de áudio", action: "microphone" }, { name: "Áudio do sistema", icon: "♫", desc: "Captura de áudio do Windows", action: "" }, { name: "Replay / Entrada remota", icon: "↺", desc: "Produção avançada", action: "" }] },
          ] as const).map(group => {
            const visible = group.items.filter(item => (group.title + " " + item.name + " " + item.desc).toLocaleLowerCase("pt-BR").includes(inputSearch.toLocaleLowerCase("pt-BR").trim()));
            return visible.length ? <div key={group.title} className="mb-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{visible.map(item => <button key={item.name} type="button" disabled={!item.action} onClick={() => { if (item.action === "image") imageFile.current?.click(); else if (item.action === "video") videoFile.current?.click(); else if (item.action === "camera") { setShowInputPicker(false); void addCamera(); } else if (item.action === "screen") { setShowInputPicker(false); void addScreen(); } else if (item.action === "microphone") { setShowInputPicker(false); void addMicrophone(); } }} className="min-h-24 rounded-lg border border-border bg-secondary/50 p-3 text-left transition-colors enabled:hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-45"><span className="mb-1 block text-lg text-muted-foreground">{item.icon}</span><strong className="block text-xs">{item.name}</strong><span className="block text-[10px] text-muted-foreground">{item.desc}</span>{!item.action && <span className="mt-1 block text-[9px]">Em desenvolvimento</span>}</button>)}</div></div> : null;
          })}
        </div>
      </section>
    </div>}
    <canvas ref={canvas} width={1280} height={720} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true" />
    <div className="fixed bottom-3 right-3 z-[120] rounded border border-border bg-card/95 px-3 py-1 text-xs font-mono text-foreground shadow" role="status" aria-label="Desempenho de renderização">FPS {performanceMetrics.fps} · Frames estimados perdidos {performanceMetrics.droppedFrames}</div>
    {stagedScene && <div className="fixed right-3 top-16 z-[115] w-72 max-w-[90vw] rounded-lg border border-primary bg-card p-2 shadow-xl"><div className="mb-2 flex items-center justify-between text-xs font-bold text-foreground"><span>PREVIEW • {stagedScene.name}</span><button type="button" onClick={() => { setStagedScene(null); setSelectedPreset(""); }} aria-label="Fechar preview">✕</button></div><select aria-label="Câmera principal do Preview" value={stagedBase ?? ""} onChange={e => setStagedBase(e.target.value || null)} className="mb-2 w-full rounded border border-border bg-card p-1 text-xs text-foreground"><option value="">Escolha a câmera principal</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select><ScenePreview engine={engine} scene={stagedScene} sources={sources} baseId={stagedBase} /><p className="mt-1 text-[10px] text-muted-foreground">Prévia visual: câmera atual e PiP preparado. O Program permanece inalterado até TAKE.</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => takeScene("cut")} className="flex-1 rounded bg-primary px-2 py-2 text-xs font-bold text-primary-foreground">CUT cena</button><button type="button" onClick={() => takeScene("fade")} className="flex-1 rounded bg-secondary px-2 py-2 text-xs font-bold text-foreground">FADE 500ms</button></div></div>}
    <button type="button" onClick={() => setShowAdvancedControls(value => !value)} aria-expanded={showAdvancedControls} aria-controls="wmix-advanced-controls" className="fixed right-3 top-14 z-[125] rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg hover:bg-secondary">{showAdvancedControls ? "Fechar controles" : "⚙ Controles avançados"}</button>
    {showAdvancedControls && <aside id="wmix-advanced-controls" aria-label="Controles avançados do motor wMix" className="fixed bottom-14 right-3 top-28 z-[120] w-[min(410px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-2xl"><h2 className="mb-3 text-sm font-semibold text-foreground">Controles avançados</h2><div className="flex flex-col items-stretch gap-2 [&>button]:w-full [&>select]:max-w-none [&>select]:w-full [&>div]:flex-wrap">
      <button type="button" onClick={reconnectProgramCamera} disabled={!program || sources.find(source => source.id === program)?.kind !== "camera"} title="Reabrir a câmera atual mantendo a cena" className="rounded border border-border bg-card px-2 py-2 text-xs text-foreground disabled:opacity-50">Reconectar Program</button>
      {sources.some(source => source.kind === "video") && <div className="flex items-center gap-1 rounded border border-border bg-card px-1 text-xs text-foreground"><select aria-label="Vídeo para controlar" value={selectedVideo} onChange={e => setSelectedVideo(e.target.value)} className="max-w-32 bg-card p-1 text-xs"><option value="">Selecionar vídeo</option>{sources.filter(source => source.kind === "video").map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select><button type="button" title="Reproduzir vídeo" onClick={() => videoAction("play")} className="rounded bg-secondary px-2 py-1">▶</button><button type="button" title="Pausar vídeo" onClick={() => videoAction("pause")} className="rounded bg-secondary px-2 py-1">Ⅱ</button><button type="button" title="Reiniciar vídeo" onClick={() => videoAction("restart")} className="rounded bg-secondary px-2 py-1">↺</button><button type="button" title="Alternar repetição" onClick={() => videoAction("loop")} className="rounded bg-secondary px-2 py-1">Loop</button></div>}
      <select aria-label="Câmera para adicionar" title="Escolha a webcam antes de clicar em Adicionar câmera" value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)} className="max-w-44 rounded border border-border bg-card px-2 py-2 text-xs text-foreground"><option value="">Câmera padrão</option>{cameras.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}</select>
      <select aria-label="Fonte de sobreposição PiP" title="Segunda câmera sobre o Program" value={overlay} onChange={e => { engine.setOverlay(e.target.value || null); setOverlay(e.target.value); }} className="max-w-40 rounded border border-border bg-card px-2 py-2 text-xs text-foreground"><option value="">PiP: desligado</option>{sources.filter(source => source.id !== program).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
      {overlay && <div className="flex items-center gap-2 rounded border border-border bg-card px-2 text-xs text-foreground">{(["x", "y", "width"] as const).map(key => <label key={key} className="flex items-center gap-1">{key === "width" ? "Tamanho" : key.toUpperCase()}<input type="range" aria-label={`PiP ${key}`} min="0" max={key === "width" ? "80" : "90"} value={Math.round(pipLayout[key] * 100)} onChange={e => updatePipLayout({ ...pipLayout, [key]: Number(e.target.value) / 100 })} className="w-16 accent-primary" /></label>)}</div>}
      <div className="flex items-center gap-1 rounded border border-border bg-card px-1"><input aria-label="Nome da cena" placeholder="Nome da cena" value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={40} className="w-28 bg-card p-1 text-xs text-foreground" /><button type="button" onClick={saveScene} className="rounded bg-secondary px-2 py-1 text-xs text-foreground">Salvar cena</button><select aria-label="Carregar cena salva" value={selectedPreset} onChange={e => loadScene(e.target.value)} className="max-w-32 bg-card p-1 text-xs text-foreground"><option value="">Cenas salvas</option>{presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select>{stagedScene && <><span role="status" className="max-w-44 truncate px-1 text-xs text-foreground" title={stagedScene.name}>PREVIEW: {stagedScene.name}</span><button type="button" onClick={() => takeScene("cut")} className="rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">TAKE cena</button><button type="button" onClick={() => { setStagedScene(null); setSelectedPreset(""); }} aria-label="Cancelar preparação da cena" className="rounded bg-secondary px-2 py-1 text-xs text-foreground">Cancelar</button></>}</div>
      <select aria-label="Áudio da gravação" title="Selecione o barramento usado na gravação" value={recordBus} disabled={recording} onChange={e => setRecordBus(e.target.value as "master" | "a" | "b")} className="rounded border border-border bg-card px-2 py-2 text-xs text-foreground"><option value="master">REC: MASTER</option><option value="a">REC: BUS A</option><option value="b">REC: BUS B</option></select>
      <input ref={projectFile} type="file" accept=".json,application/json" className="hidden" aria-label="Arquivo de projeto wMix" onChange={e => void importProject(e.target.files?.[0])} />
      <button type="button" onClick={exportProject} className="rounded border border-border bg-card px-2 py-2 text-xs text-foreground">Salvar projeto</button>
      <button type="button" onClick={() => projectFile.current?.click()} className="rounded border border-border bg-card px-2 py-2 text-xs text-foreground">Abrir projeto</button>
      <button onClick={() => setShowInputPicker(true)} className="rounded border border-primary bg-secondary px-3 py-2 text-xs font-semibold text-foreground">+ Adicionar input</button>
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
    </div></aside>}
    {error && <div role="alert" className="fixed bottom-24 right-3 z-[120] max-w-sm rounded bg-red-950 p-3 text-xs text-white">{error}</div>}
    <div className="hidden" role="status" aria-live="polite">{sources.length ? `wMix Engine • ${sources.length} fonte(s) real(is) • Gravação WebM com áudio quando microfone conectado` : "Interface Lovable • Adicione imagem, câmera ou tela para ativar o motor próprio • Sem OBS"}</div>
  </>;
}
