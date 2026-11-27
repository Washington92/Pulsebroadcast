# OBS WebSocket v5 — adaptador experimental

Arquivo: `src/integrations/obs/ObsWebSocketClient.ts`.

## Escopo implementado

- Conexão explícita a URL `ws://` ou `wss://`.
- Handshake OBS v5 (Hello/Identify/Identified), com autenticação challenge-response SHA-256 quando exigida.
- Solicitações RPC com IDs correlacionados, timeout e rejeição de pendências na desconexão.
- Consulta de Studio Mode, cena atual de Program, cena de Preview e lista de cenas.
- Eventos de alteração de cenas Preview/Program e Studio Mode.
- Comandos `SetStudioModeEnabled`, `SetCurrentPreviewScene`, `SetCurrentProgramScene` e `TriggerStudioModeTransition`.
- Painel opcional no wMix para preparar Preview, executar CUT direto para Program e TAKE com a transição atualmente selecionada no OBS.

## Limites

O painel é um controle remoto do OBS Studio. Ele **não captura nem transporta o vídeo do OBS para os monitores Preview/Program do wMix**. O compositor local do wMix continua independente; a integração nativa libobs e os displays HWND no Tauri ainda estão em desenvolvimento. Não há reconexão automática.

O TAKE exige Studio Mode ativo e utiliza a transição selecionada no OBS. CUT usa `SetCurrentProgramScene` para trocar Program diretamente.

Credenciais são fornecidas apenas em memória. **Não salve senhas em localStorage, URL, logs ou repositório.** Não exponha a porta WebSocket à internet; prefira loopback.

## Validação automatizada

`tests/obs.test.mjs` usa um WebSocket simulado para verificar handshake, snapshot Preview/Program, listagem de cenas, preparação de Preview, CUT, TAKE, validação de URL e limpeza das requisições pendentes. Isso não substitui um teste manual com OBS Studio 28+ ativo.

## Checklist de homologação manual

1. Habilitar OBS WebSocket v5 e testar conexão local com e sem autenticação.
2. Atualizar a lista de cenas e confirmar Preview/Program no painel.
3. Ativar Studio Mode, preparar outra cena e verificar o Preview no OBS.
4. Executar CUT e confirmar alteração imediata de Program no OBS.
5. Executar TAKE e confirmar que a transição selecionada no OBS é utilizada.
6. Desligar o OBS durante uma requisição e conferir a desconexão e a limpeza do estado.
7. Testar no Windows 10/11 com Tauri; build CI não equivale a homologação física.
