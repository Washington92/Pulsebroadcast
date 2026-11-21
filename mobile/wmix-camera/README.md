# wMix Camera — Android MVP (em desenvolvimento)

Aplicativo Android separado do wMix desktop, com prévia da câmera e recepção de **Tally Light** via WebSocket. **Ainda não envia vídeo ao wMix.** Não foi compilado ou testado em celular real nesta etapa.

## Objetivo da primeira entrega
- Exibir câmera traseira usando CameraX.
- Conectar manualmente a um endpoint WSS do switcher e informar ID da câmera e token de pareamento.
- Receber estados `STANDBY`, `PREVIEW` e `PROGRAM` de uma fonte autorizada; exibir cinza, verde e vermelho respectivamente.
- Em qualquer desconexão, erro ou ausência de mensagens por 5 segundos, mostrar `SEM SINAL TALLY`, **nunca manter falso estado PROGRAM**.

## Abrir
Abra esta pasta no Android Studio (JDK 17, SDK Android 35). Compile o módulo `app`, instale no Android 8+ e conceda permissão de câmera. Requer servidor WSS de Tally disponível na rede para testar sinalização.

## Protocolo inicial (ainda sem servidor implementado)
Conectar via WebSocket seguro `wss://...` com cabeçalho `Authorization: Bearer <token>`. O servidor manda, pelo menos a cada 2 s:
```json
{"type":"tally","cameraId":"cam-01","state":"PROGRAM","sequence":18}
```
`state`: `STANDBY` | `PREVIEW` | `PROGRAM`; `sequence` inteiro crescente dentro da conexão. O cliente descarta ID diferente e sequências antigas. O servidor deve enviar snapshot do estado ao conectar. O estado real deve vir da composição Program/Preview do switcher; `PROGRAM` tem prioridade se uma fonte estiver nos dois.

## Próximos passos
1. Criar receptor de vídeo e transporte de baixa latência para Android → desktop (avaliar WebRTC).
2. Implementar endpoint autenticado no wMix, fonte por cameraId e eventos reais de CUT/Preview.
3. Testar em Windows/Android físicos, incluindo desconexão, perda de Wi-Fi, trocas rápidas e regressão da webcam existente.
4. Somente após validar, adicionar captura de tela, áudio, intercom, zoom e múltiplos celulares.

**Atenção:** um socket WSS exige certificado confiável pelo Android. Nunca inserir senha/token fixo no código ou enviar token por WS sem TLS.
