import type { AudioInput } from "../../engine/WmixAudioEngine";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, ChevronDown, Copy, ExternalLink, FolderOpen, Headphones, Layers, LayoutGrid,
  Mic, MicOff, MonitorPlay, Pause, Play, Plus, Radio, RotateCcw, Settings, SlidersHorizontal,
  Sparkles, User, Volume2, VolumeX, Wifi, ZoomIn, ZoomOut, Repeat, Hand, Crosshair, Square, ScanLine, Lock, Unlock, Pencil,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { initialSources, type Source, type TransitionType } from "./data";

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-secondary/65 px-2 text-xs text-secondary-foreground hover:bg-accent/80 transition-colors";

function LiveFrame({ stream, className }: { stream: MediaStream; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className={cn("h-full w-full object-contain bg-black", className)} />;
}

/* ---------- Video surface ---------- */
function Frame({ s, className }: { s?: Source | undefined; className?: string }) {
  if (!s) return <div className={cn("bg-background", className)} />;
  if (!s.img)
    return (
      <div className={cn("relative bg-background", className)}>
        <div className="absolute bottom-[18%] left-[6%] border-l-2 border-primary pl-2">
          <div className="bg-primary px-1 text-[8px] font-bold text-primary-foreground">AO VIVO</div>
          <div className="text-[10px] font-semibold text-foreground">Show de lançamento</div>
        </div>
      </div>
    );
  return (
    <img
      src={s.img}
      alt={s.name}
      className={cn("h-full w-full object-cover", className)}
      style={{ filter: s.filter }}
      draggable={false}
    />
  );
}

function LowerThird({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        "absolute bottom-[12%] left-[6%] border-l-4 border-primary bg-background/70 py-1.5 pl-3 pr-6 backdrop-blur transition-all duration-500",
        show ? "translate-x-0 opacity-100" : "-translate-x-6 opacity-0",
      )}
    >
      <div className="inline-block bg-primary px-1.5 text-[10px] font-bold tracking-wide text-primary-foreground">AO VIVO</div>
      <div className="text-lg font-semibold text-foreground">Show de lançamento</div>
    </div>
  );
}

function Transport({ pos, setPos, playing, setPlaying, remaining, extra }: {
  pos: number; setPos: (n: number) => void; playing: boolean; setPlaying: (b: boolean) => void; remaining: string; extra?: React.ReactNode;
}) {
  const fmt = (n: number) => `0:${String(Math.floor(n)).padStart(2, "0")}`;
  return (
    <div className="flex h-9 items-center gap-1 px-2">
      <button className={cn(btn, "h-6 w-6 px-0")} onClick={() => setPos(0)} aria-label="Reiniciar"><RotateCcw className="h-3 w-3" /></button>
      {[-10, -5].map((d) => (
        <button key={d} className={cn(btn, "h-6 px-1.5 font-mono")} onClick={() => setPos(Math.max(0, pos + d))}>{d}</button>
      ))}
      <button className={cn(btn, "h-6 w-6 px-0")} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pausar" : "Tocar"}>
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>
      {[5, 10].map((d) => (
        <button key={d} className={cn(btn, "h-6 px-1.5 font-mono")} onClick={() => setPos(Math.min(60, pos + d))}>+{d}</button>
      ))}
      <span className="ml-2 font-mono text-[11px] text-muted-foreground">{fmt(pos)}</span>
      <input type="range" min={0} max={60} step={0.1} value={pos} onChange={(e) => setPos(+e.target.value)}
        className="mx-1 h-1 min-w-0 flex-1 accent-primary" aria-label="Posição" />
      <span className="font-mono text-[11px] font-bold">{remaining}</span>
      <button className={cn(btn, "ml-1 h-6 w-6 border-primary/60 px-0 text-primary")} aria-label="Loop"><Repeat className="h-3 w-3" /></button>
      {extra}
    </div>
  );
}

function usePlayhead(start: number) {
  const [pos, setPos] = useState(start);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPos((p) => (p >= 60 ? 0 : p + 0.25)), 250);
    return () => clearInterval(t);
  }, [playing]);
  return { pos, setPos, playing, setPlaying };
}

/* ---------- Audio ---------- */
function useMeters(sources: Source[]) {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const ref = useRef(sources);
  ref.current = sources;
  useEffect(() => {
    const t = setInterval(() => {
      const next: Record<string, number> = {};
      let sum = 0;
      for (const s of ref.current) {
        const v = s.mute || !s.img ? 0 : Math.min(1, (s.gain / 100) * (0.55 + Math.random() * 0.5));
        next[s.id] = v;
        if (s.master) sum = Math.max(sum, v);
      }
      next["master"] = sum;
      next["fone"] = sum * 0.8;
      next["a"] = sum * 0.6;
      next["b"] = sum * 0.4;
      setLevels(next);
    }, 90);
    return () => clearInterval(t);
  }, []);
  return levels;
}

function VU({ level, className }: { level: number; className?: string }) {
  const segs = 24;
  const lit = Math.round(level * segs);
  return (
    <div className={cn("flex w-1.5 flex-col-reverse gap-px", className)}>
      {Array.from({ length: segs }).map((_, i) => (
        <div key={i} className={cn("flex-1 rounded-[1px]",
          i < lit ? (i >= segs - 3 ? "bg-tally-pgm" : i >= segs - 7 ? "bg-warn" : "bg-tally-pvw") : "bg-muted")} />
      ))}
    </div>
  );
}

const DB_MARKS = ["+6", "0", "-6", "-12", "-24", "-48"];

function Fader({ value, onChange, level, label }: { value: number; onChange: (n: number) => void; level: number; label: string }) {
  return (
    <div className="flex h-44 items-stretch gap-1">
      <div className="flex flex-col justify-between py-1 font-mono text-[8px] text-muted-foreground">
        {DB_MARKS.map((m) => <span key={m}>{m}</span>)}
      </div>
      <div className="relative w-6 rounded bg-background">
        <div className="absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 bg-muted" />
        <input type="range" min={0} max={100} value={value} aria-label={`Fader ${label}`}
          onChange={(e) => onChange(+e.target.value)}
          className="vfader absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <div className="pointer-events-none absolute left-0 right-0 h-3 rounded-sm border border-border bg-gradient-to-b from-foreground to-muted-foreground shadow"
          style={{ bottom: `calc(${value}% * 0.9)` }}>
          <div className="mx-auto mt-[5px] h-px w-4 bg-background" />
        </div>
      </div>
      <VU level={level} />
      <VU level={level * 0.94} />
    </div>
  );
}

const toDb = (v: number) => (v === 0 ? "-∞" : ((v - 75) * 0.4).toFixed(1));

/* ---------- Main ---------- */
export function Switcher({ nativeAudio = [], nativeAudioVolume, nativeAudioMute, nativeAudioCue, nativeAudioRemove, nativeMasterChange, nativeBusVolume, nativeBusSend, nativeSources = [], nativeProgram = null, nativeProgramStream, nativeCut, nativeFade, nativeManualTransition, nativeGetTransform, nativeSetTransform, nativeRecord, nativeRecording = false, nativeOpenTransmissionSettings, nativePerformance, advancedOpen = false, onToggleAdvanced, nativeAdd, nativeRemove, nativeRename, obsScenes = [], obsConnected = false, obsTake, obsPrepare, obsProgram = "", obsPreview = "", obsRecording = false, obsStreaming = false, obsToggleRecording, obsToggleStreaming }: { nativeAudio?: AudioInput[]; nativeAudioVolume?: (id: string, volume: number) => void; nativeAudioMute?: (id: string, muted: boolean) => void; nativeAudioCue?: (id: string, enabled: boolean) => Promise<void>; nativeAudioRemove?: (id: string) => void; nativeMasterChange?: (volume: number, muted: boolean) => void; nativeBusVolume?: (bus: "a" | "b", volume: number) => void; nativeBusSend?: (id: string, bus: "a" | "b", enabled: boolean) => void; nativeSources?: { id: string; name: string; stream: MediaStream }[]; nativeProgram?: string | null; nativeProgramStream?: MediaStream | null; nativeCut?: (id: string) => void; nativeFade?: (id: string, durationMs: number) => void; nativeManualTransition?: (id: string, progress: number) => void; nativeGetTransform?: (id: string) => { mode: "contain" | "cover" | "stretch"; scale: number; x: number; y: number }; nativeSetTransform?: (id: string, patch: Partial<{ mode: "contain" | "cover" | "stretch"; scale: number; x: number; y: number }>) => void; nativeRecord?: () => Promise<void>; nativeRecording?: boolean; nativeOpenTransmissionSettings?: () => void; nativePerformance?: { fps: number; droppedFrames: number }; advancedOpen?: boolean; onToggleAdvanced?: () => void; nativeAdd?: () => Promise<void>; nativeRemove?: (id: string) => void; nativeRename?: (id: string, name: string) => void; obsScenes?: string[]; obsConnected?: boolean; obsTake?: (scene: string, mode: "cut" | "auto", durationMs: number) => Promise<void>; obsPrepare?: (scene: string) => Promise<void>; obsProgram?: string; obsPreview?: string; obsRecording?: boolean; obsStreaming?: boolean; obsToggleRecording?: () => Promise<void>; obsToggleStreaming?: () => Promise<void> }) {
  const [panelLayout, setPanelLayout] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("wmix-panel-layout-v3") || "{}") as Record<string, number>;
      return { preview: saved.preview ?? 50, inputs: saved.inputs ?? 62, upper: saved.upper ?? 410 };
    } catch { return { preview: 50, inputs: 62, upper: 410 }; }
  });
  const upperDeckRef = useRef<HTMLElement>(null);
  const lowerDeckRef = useRef<HTMLElement>(null);
  const layoutRef = useRef(panelLayout);
  layoutRef.current = panelLayout;
  const dragLayout = (event: React.PointerEvent<HTMLElement>, part: "preview" | "inputs" | "upper") => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = layoutRef.current;
    const area = part === "inputs" ? lowerDeckRef.current : upperDeckRef.current;
    const width = Math.max(1, (area?.clientWidth || 1200) - (part === "preview" ? 360 : 6));
    const availableHeight = Math.max(320, (upperDeckRef.current?.parentElement?.clientHeight || window.innerHeight) - 210);
    const move = (e: PointerEvent) => {
      const value = part === "upper" ? Math.max(320, Math.min(availableHeight, start.upper + e.clientY - startY))
        : Math.max(part === "preview" ? 30 : 25, Math.min(part === "preview" ? 70 : 75, (part === "preview" ? start.preview : start.inputs) + (e.clientX - startX) / width * 100));
      setPanelLayout(current => ({ ...current, [part]: value }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = part === "upper" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };
  useEffect(() => { localStorage.setItem("wmix-panel-layout-v3", JSON.stringify(panelLayout)); }, [panelLayout]);
  const [editPreview, setEditPreview] = useState(false);
  const [transformTick, setTransformTick] = useState(0);
  const transformDrag = useRef<{ pointer: number; startX: number; startY: number; x: number; y: number; scale: number; handle: string } | null>(null);
  const [demoSources, setSources] = useState<Source[]>([]);
  const sources: Source[] = nativeAdd ? nativeSources.map((source, i) => ({ ...initialSources[0], id: i + 1, name: source.name, type: "Fonte wMix", remaining: "" })) : obsConnected ? obsScenes.map((name, i) => ({ ...initialSources[0], id: i + 1, name, type: "Cena OBS", remaining: "" })) : demoSources;
  const [lockedInputs, setLockedInputs] = useState<string[]>([]);
  const [obsError, setObsError] = useState("");
  const [obsBusy, setObsBusy] = useState(false);
  const [programId, setProgramId] = useState(0);
  const [previewId, setPreviewId] = useState(0);
  const [transition, setTransition] = useState<TransitionType>("Fade");
  const [durations, setDurations] = useState<Record<TransitionType, number>>({ Fade: 0.5, Merge: 1, Wipe: 1, Slide: 1 });
  const [progress, setProgress] = useState(0);
  const [ftb, setFtb] = useState(false);
  const [overlays, setOverlays] = useState<(number | null)[]>([null, null, null, null]);
  const [autoCut, setAutoCut] = useState(false);
  const [view, setView] = useState<"Inputs" | "Mixer" | "Ambos">("Ambos");
  const [demoRecording, setDemoRecording] = useState(false);
  const [demoStreaming, setDemoStreaming] = useState(false);
  const recording = nativeAdd ? nativeRecording : obsConnected ? obsRecording : demoRecording;
  const streaming = obsConnected ? obsStreaming : demoStreaming;
  const [elapsed, setElapsed] = useState(0);
  const [clock, setClock] = useState("--:--:--");
  const [bus, setBus] = useState({ master: 78, fone: 60, a: 70, b: 70, masterMute: false });
  const [vMode, setVMode] = useState<"safe" | "center" | "track">("center");
  const [zoom, setZoom] = useState(6);
  const [tab, setTab] = useState("Preparar");
  const [manual, setManual] = useState(false);
  const animRef = useRef<number | null>(null);

  const currentProgramId = nativeAdd ? (nativeSources.findIndex(s => s.id === nativeProgram) + 1) : obsConnected ? (sources.find(s => s.name === obsProgram)?.id ?? 0) : programId;
  const currentPreviewId = nativeAdd ? (sources.find(s => s.id === previewId)?.id ?? sources.find(s => s.id !== currentProgramId)?.id ?? 0) : obsConnected && obsPreview ? (sources.find(s => s.name === obsPreview)?.id ?? previewId) : previewId;
  const liveStream = (id: number) => nativeSources[id - 1]?.stream;
  const renderFrame = (source?: Source, className?: string) => source && nativeAdd && liveStream(source.id) ? <LiveFrame stream={liveStream(source.id)!} className={className} /> : <Frame s={source} className={className} />;
  const renderProgram = (className?: string) => nativeAdd && nativeProgramStream ? <LiveFrame stream={nativeProgramStream} className={className} /> : renderFrame(pgm, className);
  const pgm = sources.find((s) => s.id === currentProgramId);
  const pvw = sources.find((s) => s.id === currentPreviewId);
  const levels = useMeters(sources);
  const pvwHead = usePlayhead(11);
  const pgmHead = usePlayhead(24);

  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
      setElapsed((e) => (recording || streaming ? e + 1 : e));
    }, 1000);
    return () => clearInterval(t);
  }, [recording, streaming]);

  const complete = useCallback(() => {
    setProgramId(previewId);
    setPreviewId(programId);
    setProgress(0);
  }, [previewId, programId]);

  const cut = useCallback(() => {
    if (nativeAdd && nativeCut) {
      const source = nativeSources[currentPreviewId - 1];
      if (source) { nativeCut(source.id); setPreviewId(currentProgramId || previewId); }
      return;
    }
    if (obsConnected) {
      const scene = sources.find(s => s.id === (obsPreview ? currentPreviewId : previewId))?.name;
      if (!scene || !obsTake || obsBusy) return;
      setObsBusy(true); setObsError("");
      void obsTake(scene, "cut", 0).catch(e => setObsError(String(e))).finally(() => setObsBusy(false));
      return;
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
    complete();
  }, [complete, obsConnected, obsTake, obsBusy, previewId, currentPreviewId, obsPreview, sources, nativeSources, nativeCut, currentProgramId]);

  const auto = useCallback(() => {
    if (nativeAdd && nativeFade) { const source = nativeSources[currentPreviewId - 1]; if (source) { nativeFade(source.id, Math.round(durations[transition] * 1000)); setPreviewId(currentProgramId || previewId); } return; }
    if (obsConnected) {
      const scene = sources.find(s => s.id === previewId)?.name;
      if (!scene || !obsTake || obsBusy) return;
      setObsBusy(true); setObsError("");
      void obsTake(scene, "auto", Math.round(durations[transition] * 1000)).catch(e => setObsError(String(e))).finally(() => setObsBusy(false));
      return;
    }
    if (animRef.current) return;
    const dur = durations[transition] * 1000;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setProgress(p);
      if (p < 1) animRef.current = requestAnimationFrame(step);
      else {
        animRef.current = null;
        complete();
      }
    };
    animRef.current = requestAnimationFrame(step);
  }, [durations, transition, complete, obsConnected, obsTake, obsBusy, previewId, currentPreviewId, sources, nativeSources, nativeFade, currentProgramId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter") { e.preventDefault(); auto(); }
      else if (e.code === "Space") { e.preventDefault(); cut(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auto, cut]);

  const onTbar = (v: number) => {
    if (nativeAdd && nativeManualTransition) {
      const source = nativeSources[currentPreviewId - 1];
      if (source) {
        nativeManualTransition(source.id, v);
        setProgress(v >= 1 ? 0 : v);
        if (v >= 1) setPreviewId(currentProgramId || previewId);
      }
      return;
    }
    if (v >= 1) complete();
    else setProgress(v);
  };

  const update = (id: number, patch: Partial<Source>) =>
    setSources((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const toggleOverlay = (slot: number, id: number) => {
    setOverlays((o) => o.map((v, i) => (i === slot ? (v === id ? null : id) : v)));
  };

  const addInput = () => {
    if (obsConnected) { setObsError("Crie a cena no OBS Studio e reconecte para atualizar a lista."); return; }
    const id = Math.max(0, ...sources.map((s) => s.id)) + 1;
    const src = initialSources[(id - 1) % 10]!;
    setSources((ss) => [...ss, { ...src, id, name: `Input ${id}`, remaining: "-0:00", overlay: null }]);
  };

  const fmtElapsed = (n: number) =>
    [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60].map((x) => String(x).padStart(2, "0")).join(":");

  // transition style for incoming layer on program monitor
  const incoming: React.CSSProperties =
    transition === "Wipe" ? { clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }
    : transition === "Slide" ? { transform: `translateX(${(1 - progress) * 100}%)` }
    : transition === "Merge" ? { opacity: progress, transform: `scale(${1.15 - progress * 0.15})` }
    : { opacity: progress };

  const titleOnAir = overlays.includes(11);
  const tabs = ["Preparar", "Editor", "Teleprompter", "Automações", "Ferramentas"];

  return (
    <div className="flex h-screen min-h-0 min-w-[900px] flex-col gap-1.5 overflow-hidden bg-background p-2 font-sans text-foreground">
      {obsError && <div role="alert" className="rounded bg-red-900 px-3 py-1 text-xs text-white">Erro de transmissão: {obsError}</div>}
      {/* ===== Top bar ===== */}
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/60 pb-1">
        <div className="flex items-center gap-2 border-r border-border/70 pr-3">
          <div className="relative grid h-7 w-7 place-items-center rounded-md border border-border bg-secondary">
            <span className="text-xs font-black italic text-primary">w</span>
            {streaming && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-tally-pgm" />}
          </div>
          <span className="text-sm font-black italic tracking-tight">w<span className="text-primary">M</span>ix</span>
          <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold",
            streaming ? "bg-tally-pgm text-destructive-foreground" : "border border-primary text-primary")}>
            {streaming ? "AO VIVO" : "PRONTO"}
          </span>
        </div>
        <button className={cn(btn, "h-8 w-24 justify-between")}>
          <span className="flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" />Show de lançamento</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(btn, "h-8 px-2.5 text-[11px]", tab === t && "border-slate-500/60 bg-accent text-foreground")}>{t}</button>
          ))}
        </nav>
        <button onClick={() => setManual(!manual)}
          className={cn(btn, "h-8 w-32", manual ? "border-warn text-warn" : "text-muted-foreground")}>
          <Hand className="h-3.5 w-3.5" />{manual ? "Manual ativo" : "Assumir manual"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button className={cn(btn, "h-8 border-border/70 bg-secondary/60 px-3 text-muted-foreground")}><Sparkles className="h-3.5 w-3.5" />Copilot</button>
          <button className={cn(btn, "h-8 w-8 px-0")} aria-label="Configurações"><Settings className="h-4 w-4" /></button>
          <button type="button" onClick={onToggleAdvanced} aria-expanded={advancedOpen} aria-label="Controles avançados" title="Controles avançados" className={cn(btn, "h-8 gap-1 px-2", advancedOpen && "border-primary text-primary")}><SlidersHorizontal className="h-3.5 w-3.5" /><span className="hidden xl:inline">Avançado</span></button>
          <button className={cn(btn, "h-8 w-44 justify-between")}><span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Conta</span><ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
      </header>

      <div className="flex shrink-0 justify-end">
        <button type="button" title="Restaurar tamanhos padrão dos painéis" onClick={() => setPanelLayout({ preview: 50, inputs: 62, upper: 410 })} className="rounded border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Restaurar layout</button>
      </div>
      {/* ===== Upper deck ===== */}
      <section ref={upperDeckRef} className="grid min-h-[320px] shrink-0 gap-1" style={{ height: panelLayout.upper, gridTemplateColumns: `minmax(0,${panelLayout.preview}fr) 6px 224px minmax(0,${100 - panelLayout.preview}fr) 130px` }}>
        {/* Preview */}
        <div className="glow-pvw flex min-w-0 flex-col overflow-hidden rounded-md bg-card">
          <div className="flex h-7 items-center gap-2 px-2 text-xs">
            <span className="rounded bg-tally-pvw px-2 py-0.5 text-[10px] font-bold text-primary-foreground">PREVIEW</span>
            <span className="font-mono text-muted-foreground">{previewId}</span><span className="min-w-0 flex-1 truncate font-medium">{pvw?.name}</span>
            {nativeGetTransform && nativeSetTransform && <button type="button" aria-pressed={editPreview} onClick={() => setEditPreview(v => !v)} className={cn(btn, "h-6 shrink-0 px-2 text-[10px]", editPreview && "border-red-500 text-red-400")}><Pencil className="h-3 w-3" />{editPreview ? "Concluir" : "Transformar"}</button>}
          </div>
          <div className="relative mx-2 aspect-video overflow-hidden rounded-sm bg-background">
            {renderFrame(pvw)}
            {editPreview && nativeGetTransform && nativeSetTransform && (() => {
              const selected = nativeSources[currentPreviewId - 1];
              if (!selected) return null;
              const t = nativeGetTransform(selected.id);
              const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
              const start = (e: React.PointerEvent<HTMLDivElement>, handle: string) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                transformDrag.current = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, x: t.x, y: t.y, scale: t.scale, handle };
              };
              const move = (e: React.PointerEvent<HTMLDivElement>) => {
                const drag = transformDrag.current;
                if (!drag || drag.pointer !== e.pointerId) return;
                const rect = e.currentTarget.closest("[data-transform-area]")?.getBoundingClientRect();
                if (!rect) return;
                const dx = (e.clientX - drag.startX) / Math.max(1, rect.width);
                const dy = (e.clientY - drag.startY) / Math.max(1, rect.height);
                if (drag.handle === "move") nativeSetTransform(selected.id, { x: Math.max(-1, Math.min(1, drag.x + dx)), y: Math.max(-1, Math.min(1, drag.y + dy)) });
                else {
                  const sx = drag.handle.includes("w") ? -1 : drag.handle.includes("e") ? 1 : 0;
                  const sy = drag.handle.includes("n") ? -1 : drag.handle.includes("s") ? 1 : 0;
                  const delta = sx && sy ? (dx * sx + dy * sy) / 2 : sx ? dx * sx : dy * sy;
                  nativeSetTransform(selected.id, { scale: Math.max(0.1, Math.min(5, drag.scale + delta * 2)) });
                }
                setTransformTick(n => n + 1);
              };
              void transformTick;
              return <div data-transform-area className="absolute inset-0 touch-none overflow-hidden">
                <div className="absolute border-2 border-red-500" style={{ width: `${t.scale * 100}%`, height: `${t.scale * 100}%`, left: `${50 + t.x * 100}%`, top: `${50 + t.y * 100}%`, transform: "translate(-50%, -50%)" }}>
                  <div className="absolute inset-0 cursor-move" onPointerDown={e => start(e, "move")} onPointerMove={move} onPointerUp={() => { transformDrag.current = null; }} onPointerCancel={() => { transformDrag.current = null; }} />
                  {handles.map(h => <div key={h} role="presentation" className="absolute z-10 h-3 w-3 touch-none border border-red-700 bg-red-500" style={{ left: h.includes("w") ? "0%" : h.includes("e") ? "100%" : "50%", top: h.includes("n") ? "0%" : h.includes("s") ? "100%" : "50%", transform: "translate(-50%, -50%)", cursor: h === "n" || h === "s" ? "ns-resize" : h === "e" || h === "w" ? "ew-resize" : "nwse-resize" }} onPointerDown={e => start(e, h)} onPointerMove={move} onPointerUp={() => { transformDrag.current = null; }} onPointerCancel={() => { transformDrag.current = null; }} />)}
                </div>
                <span className="pointer-events-none absolute bottom-1 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">Transformação · {Math.round(t.scale * 100)}%</span>
              </div>;
            })()}
          </div>
          <Transport {...pvwHead} remaining={pvw?.remaining || "--"}
            extra={<>{["IN", "OUT", "CUE"].map((x) => <button key={x} className={cn(btn, "h-6 px-1.5 text-[10px] font-semibold")}>{x}</button>)}</>} />
        </div>

        <div role="separator" aria-label="Redimensionar Preview e Program" aria-orientation="vertical" title="Arraste para ajustar Preview e Program" onPointerDown={e => dragLayout(e, "preview")} className="cursor-col-resize rounded bg-border/50 hover:bg-slate-500 active:bg-slate-400" />
        {/* Center console — live switching desk */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-2">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div className="min-w-0"><div className="font-mono text-base font-bold tabular-nums tracking-wide">{clock}</div><div className="font-mono text-[10px] text-muted-foreground">{fmtElapsed(elapsed)}</div></div>
            <span className={cn("shrink-0 rounded border px-2 py-1 text-[10px] font-semibold", recording || streaming ? "border-primary text-primary" : "border-border text-muted-foreground")}>{recording ? "● REC" : streaming ? "● LIVE" : "EM ESPERA"}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_38px] gap-2">
            <div className="flex min-w-0 flex-col gap-2">
              <button onClick={auto} className="flex min-h-12 flex-col justify-center rounded-md bg-primary px-3 py-2 text-left text-primary-foreground hover:brightness-110">
                <div className="flex items-center justify-between gap-2"><span className="text-base font-bold">AUTO</span><span className="text-[10px] opacity-80">Enter</span></div>
                <span className="block truncate text-[10px]" title={pvw?.name || "Sem fonte"}>{pvw?.name || "Sem fonte"} · {transition} {durations[transition]}s</span>
              </button>
              <button onClick={cut} className="flex min-h-11 items-center justify-between rounded-md border border-border bg-secondary px-3 py-2 text-left hover:bg-accent">
                <span className="text-base font-bold">CUT</span><span className="text-[10px] text-muted-foreground">Espaço</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Tipo de transição">
                {(Object.keys(durations) as TransitionType[]).map((t) => (
                  <div key={t} className={cn("flex min-w-0 items-center rounded-md border", transition === t ? "border-primary bg-primary/10" : "border-border bg-secondary")}>
                    <button type="button" onClick={() => setTransition(t)} aria-pressed={transition === t} className={cn("min-w-0 flex-1 truncate px-1.5 py-2 text-left text-[11px] font-medium", transition === t && "text-primary")}>{t}</button>
                    <input type="number" step={0.1} min={0.1} max={5} value={durations[t]} aria-label={`Duração de ${t} em segundos`} onChange={e => setDurations(d => ({...d, [t]: Math.max(0.1, Math.min(5, Number(e.target.value) || 0.1))}))} className="w-9 shrink-0 border-l border-border bg-transparent py-2 pr-1 text-right font-mono text-[10px] text-muted-foreground outline-none" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-center rounded-md border border-border/60 bg-background/40 px-1 py-2">
              <span className="text-[9px] font-bold tracking-wide text-muted-foreground">T-BAR</span>
              <div className="relative mt-2 h-36 w-5 rounded-md border border-border bg-background shadow-inner">
                <div className="absolute inset-x-1/2 inset-y-1 w-px bg-border" />
                <input type="range" min={0} max={1} step={0.01} value={progress} aria-label="T-Bar" onChange={e => onTbar(+e.target.value)} className="vfader absolute inset-0 h-full w-full cursor-grab opacity-0" />
                <div className="pointer-events-none absolute -left-1.5 h-4 w-8 rounded border border-slate-400 bg-gradient-to-b from-slate-100 to-slate-500 shadow-md" style={{ top: `calc(${progress * 100}% * 0.85)` }} />
              </div>
              <span className="mt-2 font-mono text-[10px] text-muted-foreground">{Math.round(progress * 100)}%</span>
            </div>
          </div>
          <div className="border-t border-border/60 pt-2">
            <button onClick={() => setFtb(!ftb)} aria-pressed={ftb} className={cn("flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-bold", ftb ? "border-tally-pgm bg-tally-pgm text-destructive-foreground" : "border-border bg-secondary hover:bg-accent")}><Square className="h-3.5 w-3.5" />FTB · Fade to Black</button>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sobreposições</div>
            <div className="grid grid-cols-2 gap-1.5">
              {overlays.map((o, i) => {
                const source = sources.find(x => x.id === o);
                return <button key={i} type="button" onClick={() => setOverlays(ov => ov.map((v,j) => j === i ? (v ? null : previewId || null) : v))} aria-pressed={!!o} title={source?.name || `Sobreposição ${i + 1}`} className={cn("flex min-h-11 min-w-0 flex-col justify-center rounded-md border px-2 py-1 text-left", o ? "border-warn bg-warn/20 text-foreground" : "border-border bg-secondary hover:bg-accent")}>
                  <span className="text-[10px] font-bold">Overlay {i + 1}</span>
                  <span className={cn("block w-full truncate text-[10px]", o ? "text-warn" : "text-muted-foreground")}>{o ? source?.name || "Ativo" : "Livre"}</span>
                </button>;
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border/60 pt-2">
            <button type="button" onClick={() => setAutoCut(!autoCut)} aria-pressed={autoCut} className={cn(btn, "h-9 min-w-0 flex-1 justify-start px-2 text-[11px]", autoCut && "border-primary text-primary")}><Mic className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Auto corte: {autoCut ? "Ligado" : "Desligado"}</span></button>
          </div>
        </div>
        {/* Program */}
        <div className="glow-pgm flex min-w-0 flex-col overflow-hidden rounded-md bg-card">
          <div className="flex h-7 items-center gap-2 px-2 text-xs">
            <span className="rounded bg-tally-pgm px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">PROGRAMA</span>
            <span className="font-mono text-muted-foreground">{currentProgramId || "—"}</span><span className="font-medium">{pgm?.name}</span>
            {streaming && <span className="ml-auto animate-pulse text-[10px] font-bold text-tally-pgm">● NO AR</span>}
          </div>
          <div className="relative mx-2 aspect-video overflow-hidden rounded-sm bg-background">
            {renderProgram("absolute inset-0")}
            {progress > 0 && <div className="absolute inset-0" style={incoming}><Frame s={pvw} /></div>}
            <LowerThird show={titleOnAir} />
            <div className={cn("pointer-events-none absolute inset-0 bg-background transition-opacity duration-700", ftb ? "opacity-100" : "opacity-0")} />
          </div>
          <Transport {...pgmHead} remaining={pgm?.remaining || "--"} />
        </div>

        {/* Vertical */}
        <div className="flex min-h-0 flex-col overflow-y-auto rounded-md border border-border bg-card p-2">
          <div className="text-[10px] font-bold tracking-wider">VERTICAL</div>
          <div className="relative mx-auto mt-1 aspect-[9/16] w-full overflow-hidden rounded-sm bg-background">
            {pgm?.img ? (
              <img src={pgm.img} alt="" className="h-full w-full object-cover" draggable={false}
                style={{ filter: pgm.filter, objectPosition: vMode === "track" ? `${30 + (pgmHead.pos % 40)}% 50%` : vMode === "safe" ? "20% 50%" : "50% 50%" }} />
            ) : renderProgram("h-full")}
            {vMode === "safe" && <div className="absolute inset-[8%_6%_14%] rounded border border-dashed border-primary/70" />}
            <div className={cn("pointer-events-none absolute inset-0 bg-background transition-opacity duration-700", ftb ? "opacity-100" : "opacity-0")} />
          </div>
          <div className="mt-1.5 text-center text-[9px] leading-tight text-muted-foreground">
            <div>Tela inteira: {pgm?.name}</div>
            <div>REC V: <span className={recording ? "text-tally-pgm" : ""}>{recording ? "Gravando" : "Parado"}</span> · LIVE V: <span className={streaming ? "text-tally-pgm" : ""}>{streaming ? "No ar" : "Parado"}</span></div>
          </div>
          <div className="mt-1.5 flex justify-center gap-1">
            {([["safe", ScanLine, "Área segura"], ["center", Crosshair, "Centralizado"], ["track", Activity, "Tracking"]] as const).map(([k, Icon, l]) => (
              <button key={k} title={l} aria-label={l} onClick={() => setVMode(k)}
                className={cn(btn, "h-6 w-7 px-0", vMode === k && "border-primary text-primary")}><Icon className="h-3 w-3" /></button>
            ))}
          </div>
        </div>
      </section>

      <div role="separator" aria-label="Redimensionar altura dos monitores" aria-orientation="horizontal" title="Arraste para ajustar a altura dos monitores" onPointerDown={e => dragLayout(e, "upper")} className="h-1.5 shrink-0 cursor-row-resize rounded bg-border/50 hover:bg-slate-500" />
      {/* ===== Lower deck ===== */}
      <div className="flex shrink-0 gap-1 border-b border-border">
        {([["Inputs", LayoutGrid], ["Mixer", SlidersHorizontal], ["Ambos", Layers]] as const).map(([v, Icon]) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("flex items-center gap-1.5 border-b-2 px-4 py-1.5 text-xs",
              view === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" />{v}
          </button>
        ))}
      </div>

      <section ref={lowerDeckRef} className="grid min-h-0 flex-1 gap-1" style={{gridTemplateColumns: view === "Ambos" ? `minmax(0,${panelLayout.inputs}fr) 6px minmax(0,${100-panelLayout.inputs}fr)` : "minmax(0,1fr)"}}>
        {view !== "Mixer" && (
          <div className="flex min-h-0 flex-col rounded-md border border-border bg-panel">
            <div className="flex items-center gap-1 p-2">
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground">INPUTS</span>
              <span className="ml-auto" />
              <button className={cn(btn, "h-6 w-6 px-0")} aria-label="Diminuir" onClick={() => setZoom((z) => Math.min(8, z + 1))}><ZoomOut className="h-3 w-3" /></button>
              <button className={cn(btn, "h-6 w-6 px-0")} aria-label="Aumentar" onClick={() => setZoom((z) => Math.max(3, z - 1))}><ZoomIn className="h-3 w-3" /></button>
              <button className={cn(btn, "h-6 w-6 px-0")} aria-label="Grade"><LayoutGrid className="h-3 w-3" /></button>
              <button className={cn(btn, "h-6 w-6 px-0")} aria-label="Destacar"><ExternalLink className="h-3 w-3" /></button>
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto px-2 pb-2"
              style={{ gridTemplateColumns: `repeat(${zoom}, minmax(0, 1fr))` }}>
              {sources.map((s) => {
                const isPgm = s.id === currentProgramId, isPvw = s.id === currentPreviewId;
                return (
                  <div key={s.id}
                    className={cn("rounded-md border bg-card p-1 transition-shadow",
                      isPgm ? "glow-pgm border-transparent" : isPvw ? "glow-pvw border-transparent" : "border-border")}>
                    <button className="relative block aspect-video w-full overflow-hidden rounded-sm bg-background"
                      onClick={() => { setPreviewId(s.id); if (obsConnected && obsPrepare) void obsPrepare(s.name).catch(e => setObsError(String(e))); }} onDoubleClick={() => { if (nativeSources.length && nativeCut) { nativeCut(nativeSources[s.id - 1].id); } else if (!obsConnected) { setPreviewId(s.id); setTimeout(cut, 0); } else if (obsTake && !obsBusy) { setObsBusy(true); void obsTake(s.name, "cut", 0).catch(e => setObsError(String(e))).finally(() => setObsBusy(false)); } }}
                      title="Clique: preview · Duplo clique: corte">
                      {renderFrame(s)}
                      {s.remaining && <span className="absolute bottom-0.5 right-1 rounded bg-background/80 px-1 font-mono text-[9px] font-bold">{s.remaining}</span>}
                      <div className="absolute bottom-0 left-0 h-0.5 bg-primary" style={{ width: `${(levels[s.id] ?? 0) * 100}%` }} />
                    </button>
                    <div className="mt-1 flex items-center gap-1 text-[10px]">
                      <span className={cn("grid h-4 min-w-4 place-items-center rounded-sm px-0.5 font-mono font-bold",
                        isPgm ? "bg-tally-pgm text-destructive-foreground" : isPvw ? "bg-tally-pvw text-primary-foreground" : "text-muted-foreground")}>{s.id}</span>
                      <span className="min-w-0 flex-1 truncate font-medium" title={`${s.name} · ${s.type}`}>{s.name}</span>
                      <span className="shrink-0 text-[8px] text-muted-foreground">{s.type}</span>
                      {nativeRename && nativeSources[s.id - 1] && <button type="button" aria-label={`Renomear input ${s.name}`} title="Renomear input" className={cn(btn, "h-5 px-1")} onClick={() => { const source = nativeSources[s.id - 1]; if (!source) return; const name = window.prompt("Novo nome do input:", source.name); if (name === null) return; if (!name.trim()) { setObsError("Informe um nome válido para o input."); return; } nativeRename(source.id, name); }}><Pencil className="h-3 w-3" /></button>}
                      {nativeRemove && nativeSources[s.id - 1] && <button type="button" aria-label={`${lockedInputs.includes(nativeSources[s.id - 1].id) ? "Desbloquear" : "Bloquear"} input ${s.name}`} title={lockedInputs.includes(nativeSources[s.id - 1].id) ? "Desbloquear exclusão" : "Proteger contra exclusão"} aria-pressed={lockedInputs.includes(nativeSources[s.id - 1].id)} className={cn(btn, "h-5 px-1", lockedInputs.includes(nativeSources[s.id - 1].id) && "border-primary text-primary")} onClick={() => { const id = nativeSources[s.id - 1]?.id; if (id) setLockedInputs(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }}>{lockedInputs.includes(nativeSources[s.id - 1].id) ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}</button>}
                      {nativeRemove && nativeSources[s.id - 1] && <button type="button" aria-label={`Excluir input ${s.name}`} title={lockedInputs.includes(nativeSources[s.id - 1].id) ? "Input protegido: desbloqueie antes de excluir" : `Excluir ${s.name}`} disabled={lockedInputs.includes(nativeSources[s.id - 1].id)} className={cn(btn, "h-5 px-1 text-destructive disabled:cursor-not-allowed disabled:opacity-30")} onClick={() => {
                        const source = nativeSources[s.id - 1];
                        if (!source) return;
                        const warning = source.id === nativeProgram ? "Esta fonte está no PROGRAM. " : "";
                        if (window.confirm(`${warning}Excluir o input "${source.name}"? A captura será encerrada.`)) {
                          nativeRemove(source.id);
                          setPreviewId(0);
                          setOverlays(current => current.map(value => value === s.id ? null : value));
                        }
                      }}>✕</button>}

                    </div>
                    <div className="mt-1 flex gap-0.5">
                      {[0, 1, 2, 3].map((i) => (
                        <button key={i} onClick={() => toggleOverlay(i, s.id)}
                          className={cn(btn, "h-5 flex-1 px-0 text-[9px]", overlays[i] === s.id && "border-warn bg-warn text-primary-foreground")}>{i + 1}</button>
                      ))}
                      <button onClick={() => update(s.id, { mute: !s.mute })} aria-label="Mudo"
                        className={cn(btn, "h-5 flex-1 px-0", s.mute && "border-tally-pgm text-tally-pgm")}>
                        {s.mute ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
                      <button onClick={() => update(s.id, { cue: !s.cue })} aria-label="Fone"
                        className={cn(btn, "h-5 flex-1 px-0", s.cue && "border-warn text-warn")}><Headphones className="h-3 w-3" /></button>
                    </div>
                    <input type="range" min={0} max={100} value={s.gain} aria-label={`Ganho ${s.name}`}
                      onChange={(e) => update(s.id, { gain: +e.target.value })} className="mt-1 h-1 w-full accent-primary" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "Ambos" && <div role="separator" aria-label="Redimensionar Inputs e Mixer" aria-orientation="vertical" title="Arraste para ajustar Inputs e Mixer" onPointerDown={e => dragLayout(e, "inputs")} className="cursor-col-resize rounded bg-border/50 hover:bg-slate-500 active:bg-slate-400" />}
        {view !== "Inputs" && (
          <div className="flex min-h-0 flex-col rounded-md border border-border bg-panel">
            <div className="flex items-center gap-1 p-2">
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground">MIXER DE ÁUDIO</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Buses: A–B</span>
              <button className={cn(btn, "h-6 w-6 px-0")} aria-label="Destacar"><ExternalLink className="h-3 w-3" /></button>
            </div>
            <div className="flex min-h-0 flex-1 gap-1.5 overflow-x-auto px-2 pb-2">
              {/* Bus strips */}
              {([["MASTER", "master"], ["FONE", "fone"], ["BUS A", "a"], ["BUS B", "b"]] as const).map(([label, k]) => (
                <div key={k} className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded border border-border bg-card p-1.5">
                  <span className="text-[10px] font-bold">{label}</span>
                  {(k === "a" || k === "b") && <div className="flex w-full gap-0.5"><button className={cn(btn, "h-5 flex-1 px-0 text-[9px]")}>M</button><button className={cn(btn, "h-5 flex-1 px-0")}><Volume2 className="h-3 w-3" /></button></div>}
                  <Fader label={label} value={bus[k]} onChange={(v) => { setBus({ ...bus, [k]: v }); if (k === "master") nativeMasterChange?.(v / 100, bus.masterMute); if (k === "a" || k === "b") nativeBusVolume?.(k, v / 100); }}
                    level={k === "master" && bus.masterMute ? 0 : (levels[k] ?? 0) * (bus[k] / 80)} />
                  <span className="font-mono text-[9px] text-muted-foreground">{toDb(bus[k])} dB</span>
                  {k === "master" && <button onClick={() => { setBus({ ...bus, masterMute: !bus.masterMute }); nativeMasterChange?.(bus.master / 100, !bus.masterMute); }}
                    className={cn(btn, "h-6 w-full", bus.masterMute && "border-tally-pgm bg-tally-pgm text-destructive-foreground")}>Mudo</button>}
                  {k === "fone" && <button className={cn(btn, "h-6 w-full border-warn text-warn")}><Headphones className="h-3 w-3" /></button>}
                  {(k === "a" || k === "b") && <button className={cn(btn, "h-6 w-full")}><Copy className="h-3 w-3" /></button>}
                </div>
              ))}
              {/* Real wMix audio channels inside the official Lovable mixer. */}
              {nativeAudio.map(input => (
                <div key={input.id} className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded border border-primary/60 bg-card p-1.5">
                  <span className="w-full truncate text-center text-[10px] font-semibold" title={input.name}>{input.name}</span>
                  <div className="flex w-full items-center justify-between gap-1"><span className="text-[9px] text-primary">MIC • wMix</span><button type="button" title="Remover canal" aria-label={`Remover ${input.name}`} onClick={() => nativeAudioRemove?.(input.id)} className={cn(btn, "h-5 px-1 text-[9px]")}>×</button></div>
                  <button type="button" onClick={() => nativeAudioMute?.(input.id, !input.muted)}
                    className={cn(btn, "h-6 w-full", input.muted && "border-tally-pgm bg-tally-pgm text-destructive-foreground")}
                    aria-label={input.muted ? "Ativar microfone" : "Silenciar microfone"}>
                    {input.muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                    {input.muted ? " Mudo" : " Ativo"}
                  </button>
                  <button type="button" onClick={() => { void nativeAudioCue?.(input.id, !input.cue).catch(error => setObsError(String(error))); }}
                    aria-label={input.cue ? "Desativar pré-escuta" : "Ativar pré-escuta"}
                    className={cn(btn, "h-6 w-full", input.cue && "border-warn bg-warn text-primary-foreground")}>
                    <Headphones className="h-3 w-3" /> {input.cue ? "CUE ON" : "CUE"}
                  </button>
                  <div className="w-full" title={`Pico: ${(20 * Math.log10(Math.max(input.peak, 0.00001))).toFixed(1)} dBFS`}>
                    <div className="h-1.5 w-full overflow-hidden rounded bg-secondary">
                      <div className={cn("h-full transition-[width] duration-75", input.clipping ? "bg-destructive" : input.peak > 0.85 ? "bg-warn" : "bg-primary")}
                        style={{ width: `${Math.min(100, input.peak * 100)}%` }} />
                    </div>
                    <span className={cn("text-[9px] font-mono", input.clipping ? "text-destructive font-bold" : "text-muted-foreground")}>{input.clipping ? "CLIP!" : `${(20 * Math.log10(Math.max(input.peak, 0.00001))).toFixed(0)} dBFS`}</span>
                  </div>
                  <Fader label={input.name} value={Math.round(input.volume * 100)}
                    onChange={value => nativeAudioVolume?.(input.id, value / 100)} level={input.muted ? 0 : input.level} />
                  <span className="font-mono text-[9px] text-muted-foreground">{toDb(Math.round(input.volume * 100))} dB</span>
                  <div className="flex w-full gap-1">
                    {(["a", "b"] as const).map(busKey => <button key={busKey} type="button"
                      aria-label={`Enviar ${input.name} ao BUS ${busKey.toUpperCase()}`}
                      onClick={() => nativeBusSend?.(input.id, busKey, !(busKey === "a" ? input.busA : input.busB))}
                      className={cn(btn, "h-6 flex-1 px-0 font-bold", (busKey === "a" ? input.busA : input.busB) && "border-primary bg-primary text-primary-foreground")}>
                      {busKey.toUpperCase()}
                    </button>)}
                  </div>
                </div>
              ))}
              {/* Channel strips */}
              {sources.filter((s) => s.img).map((s) => (
                <div key={s.id} className={cn("flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded border bg-card p-1.5",
                  s.id === programId ? "border-tally-pgm" : "border-border")}>
                  <span className="w-full truncate text-center text-[10px] font-semibold" title={s.name}>{s.name}</span>
                  <div className="flex w-full gap-0.5">
                    <button className={cn(btn, "h-5 flex-1 px-0 text-[8px] border-primary/60 text-primary")}>Auto</button>
                    <button onClick={() => update(s.id, { mute: !s.mute })} aria-label="Mudo"
                      className={cn(btn, "h-5 flex-1 px-0", s.mute && "border-tally-pgm bg-tally-pgm text-destructive-foreground")}>
                      {s.mute ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}</button>
                    <button onClick={() => update(s.id, { cue: !s.cue })} aria-label="Cue"
                      className={cn(btn, "h-5 flex-1 px-0", s.cue && "border-warn text-warn")}><Headphones className="h-3 w-3" /></button>
                  </div>
                  <Fader label={s.name} value={s.gain} onChange={(v) => update(s.id, { gain: v })} level={levels[s.id] ?? 0} />
                  <span className="font-mono text-[9px] text-muted-foreground">{toDb(s.gain)} dB</span>
                  <div className="flex w-full gap-0.5">
                    {([["M", "master"], ["A", "busA"], ["B", "busB"]] as const).map(([l, key]) => (
                      <button key={l} onClick={() => update(s.id, { [key]: !s[key] })}
                        className={cn(btn, "h-6 flex-1 px-0 text-[10px] font-bold", s[key] && "border-primary bg-primary text-primary-foreground")}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== Bottom bar ===== */}
      <footer className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2">
        <button onClick={() => { if (nativeAdd) { try { void Promise.resolve(nativeAdd()).catch(e => setObsError(String(e))); } catch (e) { setObsError(String(e)); } } else addInput(); }} className={cn(btn, "h-7 px-4")}><Plus className="h-3.5 w-3.5" />Adicionar input</button>
        <div className="flex">
          <button onClick={() => { if (nativeRecord) { void nativeRecord().catch(e => setObsError(String(e))); } else if (obsConnected) { if (!obsToggleRecording || obsBusy) return; setObsBusy(true); setObsError(""); void obsToggleRecording().catch(e => setObsError(String(e))).finally(() => setObsBusy(false)); } else setDemoRecording(!demoRecording); }}
            className={cn(btn, "h-7 rounded-r-none px-5 font-semibold", recording && "border-tally-pgm bg-tally-pgm text-destructive-foreground")}>
            <span className={cn("h-2 w-2 rounded-full bg-tally-pgm", recording && "animate-pulse bg-destructive-foreground")} />
            {recording ? `Gravando ${fmtElapsed(elapsed)}` : "Gravar"}
          </button>
          <button className={cn(btn, "h-7 rounded-l-none border-l-0 px-3")}>H <ChevronDown className="h-3 w-3" /></button>
        </div>
        <div className="flex">
          <button onClick={() => { if (nativeAdd) { setObsError(""); nativeOpenTransmissionSettings?.(); } else if (obsConnected) { if (!obsToggleStreaming || obsBusy) return; setObsBusy(true); setObsError(""); void obsToggleStreaming().catch(e => setObsError(String(e))).finally(() => setObsBusy(false)); } else setDemoStreaming(!demoStreaming); }}
            className={cn(btn, "h-7 rounded-r-none px-5 font-semibold", streaming && "border-tally-pgm bg-tally-pgm text-destructive-foreground")}>
            <Radio className="h-3.5 w-3.5" />{streaming ? "Encerrar" : "Transmitir"}
          </button>
          <button className={cn(btn, "h-7 rounded-l-none border-l-0 px-3")}>H+V <ChevronDown className="h-3 w-3" /></button>
        </div>
        <button className={cn(btn, "h-7 px-3")}><ExternalLink className="h-3.5 w-3.5" />Saídas<ChevronDown className="h-3 w-3" /></button>
        <button className={cn(btn, "h-7 px-3")}><MonitorPlay className="h-3.5 w-3.5" />Monitores<ChevronDown className="h-3 w-3" /></button>
        <button className={cn(btn, "h-7 px-3")}>Checar saída</button>
        <div className="ml-auto flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span className="rounded border border-border px-3 py-1" role="status" aria-label="Desempenho de renderização"><Activity className="mr-1 inline h-3 w-3 text-primary" />{nativePerformance ? `FPS ${nativePerformance.fps} · Frames perdidos ${nativePerformance.droppedFrames}` : "Desempenho indisponível"}</span>
          <span className="flex items-center gap-1"><Wifi className={cn("h-3 w-3", streaming ? "text-tally-pvw" : "")} />RTMP {streaming ? "transmitindo via OBS" : "ocioso"}</span>
          <span>PTZ · inativo</span>
        </div>
      </footer>
    </div>
  );
}
