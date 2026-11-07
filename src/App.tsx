import { useCallback, useEffect, useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import ObsPanel, { type ObsMonitorState } from "./components/ObsPanel";
import { type ObsClient } from "./services/obs";

export default function App() {
  const [showObs, setShowObs] = useState(false);
  const [obs, setObs] = useState<ObsClient | null>(null);
  const [scenes, setScenes] = useState<string[]>([]);
  const [monitor, setMonitor] = useState<ObsMonitorState>({ connected: false, studio: false, preview: "", program: "" });
  const onClientChange = useCallback((client: ObsClient | null) => {
    setObs(client);
    if (!client) { setScenes([]); return; }
    void client.scenes().then(list => setScenes(list.map(s => s.sceneName))).catch(() => setScenes([]));
  }, []);
  useEffect(() => {
    if (!obs) return;
    let active = true;
    const refresh = async () => {
      try {
        const list = await obs.scenes();
        if (active) setScenes(list.map(scene => scene.sceneName));
      } catch { /* OBS connection state is handled by ObsPanel. */ }
    };
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [obs]);
  const onMonitorChange = useCallback((state: ObsMonitorState) => setMonitor(state), []);
  const prepare = useCallback(async (scene: string) => {
    if (!obs) throw new Error("Conecte o OBS primeiro.");
    if (!monitor.studio) return; // Studio disabled: selecting a tile only selects it locally.
    await obs.setCurrentPreviewScene(scene);
  }, [obs, monitor.studio]);
  const take = useCallback(async (scene: string, mode: "cut" | "auto", durationMs: number) => {
    if (!obs) throw new Error("Conecte o OBS primeiro.");
    if (monitor.studio) {
      await obs.setCurrentPreviewScene(scene);
      const transitionName = mode === "cut" ? "Cut" : "Fade";
      const list = await obs.getSceneTransitionList();
      const found = list.transitions.find(t => t.transitionName.toLowerCase() === transitionName.toLowerCase());
      if (found) {
        await obs.setCurrentSceneTransition(found.transitionName);
        if (!found.transitionFixed && mode === "auto") await obs.setCurrentSceneTransitionDuration(durationMs);
      } else {
        throw new Error(`A transição ${transitionName} não está disponível no OBS.`);
      }
      await obs.triggerStudioTransition();
    } else {
      await obs.setProgram(scene);
    }
    const state = await obs.getCurrentProgramScene();
    setMonitor(previous => ({ ...previous, program: state.currentProgramSceneName }));
  }, [obs, monitor.studio]);
  return (
    <>
      <Switcher obsConnected={!!obs && monitor.connected} obsScenes={scenes} obsTake={take} obsPrepare={prepare} obsProgram={monitor.program} obsPreview={monitor.preview} />
      <div className="wmix-demo-note" role="status">{monitor.connected ? "OBS conectado • CUT/AUTO e seleção de cenas integrados • Vídeo e mixer ainda demonstrativos" : "Switcher em demonstração • Conecte o OBS para controlar cenas reais"}</div>
      {!showObs && <button className="wmix-obs-toggle" onClick={() => setShowObs(true)} aria-expanded={false}>{monitor.connected ? "OBS conectado • Configurar" : "Conectar / controlar OBS"}</button>}
      <aside className="wmix-obs-drawer" aria-label="Painel de controle OBS" style={{ display: showObs ? "block" : "none" }}>
        <button className="wmix-obs-close" onClick={() => setShowObs(false)}>Fechar painel ✕</button>
        <ObsPanel onClientChange={onClientChange} onMonitorChange={onMonitorChange} />
      </aside>
    </>
  );
}
