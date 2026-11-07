import {useEffect,useRef,useState} from "react";
import {ObsClient,type ObsScene,type ObsState} from "../services/obs";

export default function ObsPanel(){
  const client=useRef<ObsClient|null>(null);
  const [status,setStatus]=useState<ObsState>("disconnected");
  const [url,setUrl]=useState("ws://127.0.0.1:4455");
  const [password,setPassword]=useState("");
  const [scenes,setScenes]=useState<ObsScene[]>([]);
  const [selected,setSelected]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [studio,setStudio]=useState(false);
  const [programScene,setProgramScene]=useState("");
  const [previewScene,setPreviewScene]=useState("");
  const [streaming,setStreaming]=useState(false);
  const [recording,setRecording]=useState(false);
  useEffect(()=>()=>client.current?.disconnect(),[]);
  useEffect(()=>{
    if(status!=="connected")return;
    let active=true;
    const refresh=async()=>{
      const obs=client.current;
      if(!obs)return;
      try{
        const [stream,record,mode,program]=await Promise.all([obs.getStreamStatus(),obs.getRecordStatus(),obs.getStudioModeEnabled(),obs.getCurrentProgramScene()]);
        const preview=mode.studioModeEnabled?await obs.getCurrentPreviewScene():null;
        if(active){setStreaming(stream.outputActive);setRecording(record.outputActive);setStudio(mode.studioModeEnabled);setProgramScene(program.currentProgramSceneName);setPreviewScene(preview?.currentPreviewSceneName||"");}
      }catch{/* The connection handler reports transport errors; transient polls are ignored. */}
    };
    const timer=setInterval(()=>{void refresh();},3000);
    return ()=>{active=false;clearInterval(timer);};
  },[status]);
  async function connect(){
    setError("");setBusy(true);
    try{
      const obs=new ObsClient();
      client.current=obs;
      obs.onStateChange=setStatus;
      await obs.connect(url,password);
      setPassword("");
      const list=await obs.scenes();
      setScenes(list);
      setSelected(list[0]?.sceneName||"");
      const [mode,stream,record,program]=await Promise.all([obs.getStudioModeEnabled(),obs.getStreamStatus(),obs.getRecordStatus(),obs.getCurrentProgramScene()]);
      const preview=mode.studioModeEnabled?await obs.getCurrentPreviewScene():null;
      setStudio(mode.studioModeEnabled);setStreaming(stream.outputActive);setRecording(record.outputActive);setProgramScene(program.currentProgramSceneName);setPreviewScene(preview?.currentPreviewSceneName||"");
    }catch(e){setError(e instanceof Error?e.message:String(e));client.current?.disconnect();client.current=null;}
    finally{setBusy(false);}
  }
  async function take(){
    if(!selected||!client.current)return;
    setBusy(true);setError("");
    try{await client.current.setProgram(selected);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function action(fn:()=>Promise<unknown>){setBusy(true);setError("");try{await fn();const obs=client.current;if(obs){const [stream,record]=await Promise.all([obs.getStreamStatus(),obs.getRecordStatus()]);setStreaming(stream.outputActive);setRecording(record.outputActive);}}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  function disconnect(){client.current?.disconnect();client.current=null;setScenes([]);setSelected("");setStreaming(false);setRecording(false);setStudio(false);setProgramScene("");setPreviewScene("");}
  return <section className="obs-panel" aria-label="Conexão OBS Studio">
    <h3>OBS STUDIO <span className={"obs-status "+status}>{status==="connected"?"Conectado":status==="connecting"?"Conectando...":status==="error"?"Erro":"Desconectado"}</span></h3>
    <p className="obs-note">Controle experimental de cenas via OBS WebSocket v5. O vídeo continua sendo processado pelo OBS.</p>
    <label>Endereço WebSocket<input value={url} onChange={e=>setUrl(e.target.value)} disabled={status==="connected"} placeholder="ws://127.0.0.1:4455"/></label>
    {status!=="connected"&&<label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off"/></label>}
    <div className="obs-actions">{status==="connected"?<button onClick={disconnect}>Desconectar</button>:<button disabled={busy} onClick={connect}>Conectar OBS</button>}</div>
    {status==="connected"&&<><p className="obs-note" aria-live="polite">Transmissão: {streaming?"ATIVA":"inativa"} • Gravação: {recording?"ATIVA":"inativa"} • Program OBS: {programScene||"sem cena"} • Preview OBS: {studio?(previewScene||"sem cena"):"Modo Studio desligado"} • Estados atualizados a cada 3 segundos</p><label>Cena do OBS<select value={selected} onChange={e=>setSelected(e.target.value)}>{scenes.map(s=><option key={s.sceneName} value={s.sceneName}>{s.sceneName}</option>)}</select></label><button disabled={busy||!selected} onClick={take}>Enviar cena ao Program do OBS</button><div className="obs-actions"><button disabled={busy} onClick={()=>action(async()=>{await client.current!.setStudioModeEnabled(!studio);setStudio(!studio);})}>Modo Studio: {studio?"Ligado":"Desligado"}</button>{studio&&<button disabled={busy||!selected} onClick={()=>action(async()=>{await client.current!.setCurrentPreviewScene(selected);setPreviewScene(selected);await client.current!.triggerStudioTransition();})}>Preview → Program (OBS)</button>}</div><div className="obs-actions"><button disabled={busy} onClick={()=>action(()=>recording?client.current!.stopRecord():client.current!.startRecord())}>{recording?"Parar gravação OBS":"Gravar no OBS"}</button><button disabled={busy} onClick={()=>{if(!streaming&&!window.confirm("Confirma iniciar transmissão para o destino configurado no OBS?"))return;void action(()=>streaming?client.current!.stopStream():client.current!.startStream());}}>{streaming?"Parar transmissão OBS":"Transmitir pelo OBS"}</button></div><p className="obs-note">A gravação e a transmissão são realizadas pelo OBS, não pelo PULSE. Confira o destino antes de iniciar.</p></>}
    {error&&<p role="alert" className="obs-error">{error}</p>}
  </section>;
}
