import { useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import ObsPanel from "./components/ObsPanel";

/** Lovable visual switcher is a demo; OBS commands remain in the dedicated real-control panel. */
export default function App() {
  const [showObs, setShowObs] = useState(false);
  return (
    <>
      <Switcher />
      <div className="wmix-demo-note" role="status">Switcher visual em demonstração • Controle real disponível no painel OBS</div>
      {!showObs && <button className="wmix-obs-toggle" onClick={() => setShowObs(true)} aria-expanded={false}>Conectar / controlar OBS</button>}
      {showObs && <aside className="wmix-obs-drawer" aria-label="Painel de controle OBS">
        <button className="wmix-obs-close" onClick={() => setShowObs(false)}>Fechar painel ✕</button>
        <ObsPanel />
      </aside>}
    </>
  );
}
