# OBS WebSocket v5 — adaptador experimental

Arquivo: `src/integrations/obs/ObsWebSocketClient.ts`.

## Escopo implementado
- Conexão explícita a URL `ws://` ou `wss://`.
- Handshake OBS v5 (Hello/Identify/Identified), com autenticação challenge-response SHA-256 quando exigida.
- Solicitações RPC com IDs e respostas correlacionadas.
- Consulta de `GetStudioModeEnabled`, `GetCurrentProgramScene` e, quando Studio Mode estiver ativo, `GetCurrentPreviewScene`.
- Eventos de alteração de cenas Preview/Program e Studio Mode.
- Desconexão com rejeição das solicitações pendentes.

## Limites
O adaptador **ainda não está conectado à interface**. Não comanda CUT/TAKE no OBS, não transfere vídeo do OBS para o Canvas, não implementa reconexão automática e não possui timeout individual por requisição. O Preview/Program do Canvas permanece independente.

Credenciais são fornecidas apenas em memória. **Não salve senhas em localStorage, URL, logs ou repositório.** Para aplicativos web hospedados em HTTPS, o navegador pode bloquear `ws://` por conteúdo misto. O ambiente Tauri/Windows e a conectividade com OBS real ainda exigem validação.

## Exemplo de integração futura

```ts
const obs = new ObsWebSocketClient();
obs.onStateChange = state => console.info(state.connected, state.previewScene, state.programScene);
await obs.connect("ws://127.0.0.1:4455", password);
await obs.refresh();
// Ao desmontar o componente:
obs.disconnect();
```

## Checklist de validação pendente
1. `npm ci && npm run build` com Node.js 20+.
2. OBS Studio com WebSocket v5 ativo: testar conexão com e sem autenticação.
3. Ativar/desativar Studio Mode e alternar Preview/Program; verificar eventos e refresh.
4. Desligar OBS durante uma requisição; conferir rejeição e limpeza.
5. Testar Windows 10/11 no Tauri; nunca considerar build web equivalente a teste desktop.
