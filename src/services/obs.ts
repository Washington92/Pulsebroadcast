/** OBS WebSocket v5 transport. No credentials are persisted. */
export type ObsState = "disconnected" | "connecting" | "connected" | "error";
export type ObsScene = { sceneName: string; sceneIndex: number };
export class ObsClient {
  private socket: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<string,{resolve:(v:unknown)=>void;reject:(e:Error)=>void}>();
  state: ObsState = "disconnected";
  onStateChange?: (state: ObsState) => void;
  onEvent?: (eventType: string, data: unknown) => void;
  private update(s:ObsState){this.state=s;this.onStateChange?.(s);}
  async connect(url = "ws://127.0.0.1:4455", password = ""):Promise<void>{
    if(this.socket) this.disconnect();
    this.update("connecting");
    return new Promise((resolve,reject)=>{
      const ws = new WebSocket(url);this.socket=ws;
      ws.onmessage=async e=>{
        try {
          const msg=JSON.parse(e.data);
          if(msg.op===0){
            const auth=msg.d.authentication;
            let authentication: string|undefined;
            if(auth){
              const enc=new TextEncoder();
              const hash=async(s:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s)))));
              authentication=await hash((await hash(password+auth.salt))+auth.challenge);
            }
            ws.send(JSON.stringify({op:1,d:{rpcVersion:1,...(authentication?{authentication}:{})}}));
          } else if(msg.op===2){this.update("connected");resolve();}
          else if(msg.op===5){this.onEvent?.(msg.d.eventType,msg.d.eventData);}
          else if(msg.op===7){
            const id=msg.d.requestId;const p=this.pending.get(id);if(!p)return;
            this.pending.delete(id);
            msg.d.requestStatus.result?p.resolve(msg.d.responseData):p.reject(new Error(msg.d.requestStatus.comment||"OBS request failed"));
          }
        }catch(err){this.update("error");reject(err);}
      };
      ws.onerror=()=>{this.update("error");reject(new Error("Não foi possível conectar ao OBS WebSocket"));};
      ws.onclose=()=>{this.socket=null;this.update("disconnected");for(const p of this.pending.values())p.reject(new Error("Conexão encerrada"));this.pending.clear();};
    });
  }
  request<T=unknown>(requestType:string,requestData:Record<string,unknown>={}):Promise<T>{
    if(this.state!=="connected"||!this.socket) return Promise.reject(new Error("OBS desconectado"));
    const requestId=String(++this.requestId);
    return new Promise<T>((resolve,reject)=>{
      this.pending.set(requestId,{resolve:resolve as (v:unknown)=>void,reject});
      this.socket!.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));
    });
  }
  async scenes():Promise<ObsScene[]>{const data=await this.request<{scenes:ObsScene[]}>("GetSceneList");return data.scenes;}
  async setProgram(sceneName:string){await this.request("SetCurrentProgramScene",{sceneName});}
  async getStreamStatus(){return this.request<{outputActive:boolean;outputTimecode:string;outputDuration:number;outputBytes:number;outputSkippedFrames:number;outputTotalFrames:number}>("GetStreamStatus");}
  async getRecordStatus(){return this.request<{outputActive:boolean;outputPaused:boolean;outputTimecode:string}>("GetRecordStatus");}
  async startRecord(){await this.request("StartRecord");}
  async stopRecord(){await this.request("StopRecord");}
  async getStudioModeEnabled(){return this.request<{studioModeEnabled:boolean}>("GetStudioModeEnabled");}
  async setStudioModeEnabled(studioModeEnabled:boolean){await this.request("SetStudioModeEnabled",{studioModeEnabled});}
  async getCurrentPreviewScene(){return this.request<{currentPreviewSceneName:string}>("GetCurrentPreviewScene");}
  async setCurrentPreviewScene(sceneName:string){await this.request("SetCurrentPreviewScene",{sceneName});}
  async triggerStudioTransition(){await this.request("TriggerStudioModeTransition");}
  async startStream(){await this.request("StartStream");}
  async stopStream(){await this.request("StopStream");}
  disconnect(){this.socket?.close();this.socket=null;this.update("disconnected");}
}
