# wMix Engine — arquitetura independente

## Decisão
O wMix não utiliza OBS Studio, OBS WebSocket nem código do OBS como motor de produção. A aplicação padrão monta o `NativeSwitcher` e o `WmixEngine`.

## MVP 0.1 implementado
- Captura real de câmera via `getUserMedia` e tela via `getDisplayMedia` (dependem das permissões e suporte do WebView).
- Gerenciamento de fontes e encerramento dos tracks.
- Preview de fonte, Program composto em canvas 1280×720, corte CUT instantâneo.
- Gravação local WebM por `canvas.captureStream` + `MediaRecorder`, **somente vídeo**.
- Sem simulação de live: transmissão RTMP ainda não está implementada.

## Limitações e próximos marcos
O MVP atual usa APIs web para validar captura/composição sem OBS; **ainda não é um motor Windows nativo em C++/Rust**. Testar no Windows com WebView2 e permissões de câmera/tela. O próximo módulo será um backend de captura Windows nativo (Media Foundation), renderização Direct3D 11, pipeline de áudio WASAPI e sincronização A/V. Depois, gravação/codificação e transmissão com protocolos suportados. Não afirmar suporte profissional antes de testes de estabilidade, latência e dispositivos.

## Teste manual
1. Execute `npm install` e `npm run dev` (ou `npm run tauri dev`).
2. Autorize câmera e/ou captura de tela no Windows.
3. Adicione duas fontes, selecione Preview, pressione CUT e confirme a troca do Program.
4. Grave, pare e valide o arquivo `.webm`.
5. Verifique que nenhum processo OBS precisa estar instalado ou aberto.

## Preservação visual
A identidade de cores e componentes do Lovable continua como referência. O switcher legado permanece no repositório apenas para consulta, sem importação no fluxo padrão.
