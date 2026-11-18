# Motor wMix — adoção da libobs (Windows)

## Decisão de arquitetura

A libobs será o motor audiovisual do wMix; a interface React/Tauri continuará própria. O objetivo de produção é manter o motor em um processo nativo separado e apresentar os monitores por janelas-filhas nativas (\`HWND\`), sem transportar vídeo bruto por JSON/base64 no IPC do Tauri.

O código atual em \`src-tauri/src/libobs_runtime.rs\` é uma etapa experimental de inicialização **dentro do processo Tauri**. Não deve ser tratado como arquitetura final nem como prova de Preview/Program nativos.

## Estado atual do runtime experimental

- Valida caminho absoluto para \`obs.dll\` e restringe a ABI de vídeo à libobs 33.0.1.
- Mantém a DLL carregada enquanto os ponteiros de função são usados e chama \`obs_shutdown\` antes de descarregá-la.
- Configura tentativa de vídeo D3D11 em 1280×720 a 30 FPS, NV12, Rec. 709.
- \`obs_video_info.graphics_module\` recebe o identificador \`libobs-d3d11\`; o caminho físico \`libobs-d3d11.dll\` é verificado separadamente. A API espera o identificador do módulo, não um caminho absoluto.
- Ainda não configura áudio, não carrega módulos/plugins, não cria fontes de câmera e não cria displays nativos.
- O painel informa explicitamente que Preview/Program e CUT continuam no compositor Canvas.

## Sequência técnica obrigatória

Para a integração completa, seguir a sequência documentada pelo OBS para inicializar o core:

1. Preparar caminhos de dados e módulos da mesma instalação/versão da libobs.
2. Chamar \`obs_startup()\`.
3. Configurar vídeo com \`obs_reset_video()\`.
4. Configurar áudio com \`obs_reset_audio()\`.
5. Registrar os caminhos de plugins com \`obs_add_module_path()\`, executar \`obs_load_all_modules()\` e \`obs_post_load_modules()\`.
6. Criar e manter fontes/cenas com ownership explícito.
7. Criar um \`obs_display\` para cada monitor, usando um \`HWND\` filho nativo.
8. Conectar Preview, Program, CUT e FADE ao estado de cenas/fontes da libobs.

Referência: [OBS Studio 33.0.1 — Frontends](https://docs.obsproject.com/frontends) e [Core API](https://docs.obsproject.com/reference-core).

## Validação necessária

O build estático e os testes automatizados devem ser confirmados no GitHub Actions para cada commit. Isso não substitui a validação física em Windows 10/11.

Critérios de aceite do primeiro pipeline audiovisual:
- Inicializar libobs e D3D11 sem abrir OBS Studio.
- Carregar os módulos necessários e enumerar \`dshow_input\`.
- Capturar uma webcam real e mostrar quadros no Preview.
- Executar CUT para Program sem interromper a captura.
- Testar perda/recuperação da câmera, encerramento e reinicialização.
- Registrar build, logs e evidências reais; não usar screenshots de protótipo como prova de execução.

## Licenciamento

A libobs é distribuída sob GPL-2.0-or-later. Antes de distribuir instaladores, revisar obrigações de licença, avisos, plugins e disponibilização do código correspondente.

## Limites deste incremento

A correção do identificador D3D11 reduz uma incompatibilidade com o contrato de \`obs_video_info\`, mas não comprova que o runtime inicializa em uma máquina Windows. Os testes unitários e o build ainda dependem da execução do workflow; nenhuma câmera, janela nativa ou transição Preview/Program foi validada neste incremento.
