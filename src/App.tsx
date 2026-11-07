import { useState } from "react";
import { Switcher } from "./components/pulse/Switcher";
import NativeSwitcher from "./components/NativeSwitcher";

/** The Lovable design is the official wMix UI. The independent engine is experimental until integrated. */
export default function App() {
  const [engineLab, setEngineLab] = useState(false);
  return <>
    {engineLab ? <NativeSwitcher /> : <Switcher />}
    <button
      type="button"
      onClick={() => setEngineLab(value => !value)}
      className="fixed bottom-3 right-3 z-[120] rounded border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground shadow-lg hover:bg-accent"
    >{engineLab ? "Voltar à interface Lovable" : "Laboratório Engine 0.1"}</button>
    {!engineLab && <div className="wmix-demo-note" role="status">Interface oficial Lovable • Controles audiovisuais ainda em integração com o motor próprio</div>}
  </>;
}
