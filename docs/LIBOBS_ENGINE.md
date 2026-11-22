# Motor wMix — adoção da libobs (Windows)

## Decisão de arquitetura

A libobs será o motor audiovisual do wMix; a interface React/Tauri continuará própria. O objetivo de produção é manter o motor em um processo nativo separado e apresentar os monitores por janelas-filhas nativas (`HWND`), sem transportar vídeo bruto por JSON/base64 no IPC do Tauri.

O código atual em `src-tauri/src/libobs_runtime.rs` é uma etapa experimental de inicialização **dentro do processo Tauri**. Não deve ser tratado como arquitetura final nem como prova de Preview/Program nativos.

## Estado atual do runtime experimental

- Valida caminho absoluto para `obs.dll` e restringe a ABI de vídeo à libobs 33.0.1.
- Mantém a DLL carregada enquanto os ponteiros de função são usados e chama `obs_shutdown` antes de descarregá-la.
- Configura tentativa de vídeo D3D11 em 1280×720 a 30 FPS, NV12, Rec. 709.
- `obs_video_info.graphics_module` recebe o identificador `libobs-d3d11`; o caminho físico `libobs-d3d11.dll` é verificado separadamente. A API espera o identificador do módulo, não um caminho absoluto.
- Ainda não configura áudio, não carrega módulos/plugins, não cria fontes de câmera e não cria displays nativos.
- O painel informa explicitamente que Preview/Program e CUT continuam no compositor Canvas.

## Proteção da ABI C no Windows x64

O teste Rust `obs_video_info_matches_obs_33_0_1_x64_abi_layout` fixa o tamanho de `ObsVideoInfo` em 56 bytes e verifica offsets críticos (ponteiro de módulo, FPS, formato, adapter, conversão GPU e enums finais). Ele roda apenas em Windows x64, o mesmo alvo do runtime experimental.

Essa verificação protege contra alterações acidentais no `#[repr(C)]`, mas **não** prova que uma DLL foi carregada, que `obs_reset_video()` funcionou ou que existe renderização. A estrutura de referência é a de OBS 33.0.1; comparar sempre com o cabeçalho da mesma versão instalada. Referências: [OBS Core API](https://docs.obsproject.com/reference-core) e [cabeçalho libobs 33.0.1](https://fossies.org/dox/obs-studio-33.0.1/obs_8h_source.html).

## Sequência técnica obrigatória

Para a integração completa, seguir a sequência documentada pelo OBS para inicializar o core:

1. Preparar caminhos de dados e módulos da mesma instalação/versão da libobs.
2. Chamar `obs_startup()`.
3. Configurar vídeo com `obs_reset_video()`.
4. Configurar áudio com `obs_reset_audio()`.
5. Registrar os caminhos de plugins com `obs_add_module_path()`, executar `obs_load_all_modules()` e `obs_post_load_modules()`.
6. Criar e manter fontes/cenas com ownership explícito.
7. Criar um `obs_display` para cada monitor, usando um `HWND` filho nativo.
8. Conectar Preview, Program, CUT e FADE ao estado de cenas/fontes da libobs.

Referência: [OBS Studio 33.0.1 — Frontends](https://docs.obsproject.com/frontends) e [Core API](https://docs.obsproject.com/reference-core).

## Validação necessária

O build estático e os testes automatizados devem ser confirmados no GitHub Actions para cada commit. Isso não substitui a validação física em Windows 10/11.

Critérios de aceite do primeiro pipeline audiovisual:
- Inicializar libobs e D3D11 sem abrir OBS Studio.
- Carregar os módulos necessários e enumerar `dshow_input`.
- Capturar uma webcam real e mostrar quadros no Preview.
- Executar CUT para Program sem interromper a captura.
- Testar perda/recuperação da câmera, encerramento e reinicialização.
- Registrar build, logs e evidências reais; não usar screenshots de protótipo como prova de execução.

## Smoke test de display e Program

`tests/libobs_preview_cut_smoke.ps1` foi ajustado para o contrato do OBS 33.0.1:

- `obs_video_info.graphics_module` usa `libobs-d3d11`, não o caminho do DLL.
- Configura áudio estéreo a 48 kHz e carrega os módulos oficiais de OBS 33.0.1 com `obs_load_core_modules()` seguido de `obs_post_load_modules()`. A rotina depreciada `obs_load_all_modules()` é vazia nessa versão e não deve ser usada.
- Mantém o diretório de trabalho em `bin/64bit`, pois o loader core resolve os módulos em `../../core/<module>/<module>.dll` e os dados em `../../core/<module>/data`. A fonte sintética `color_source_v3` é fornecida pelo módulo core `image-source`.
- Usa a assinatura oficial do OBS 33.0.1 `obs_display_create(gs_init_data*, uint32_t background_color)`; a cor inicial é passada na criação e pode ser atualizada depois por `obs_display_set_background_color()`.
- Mantém o estado de exibição da fonte com `obs_source_inc_showing()`/`obs_source_dec_showing()`.

O teste completo cria duas fontes sintéticas `color_source_v3` (branca e preta) e dois `HWND`/`obs_display` independentes. O display Preview mantém a fonte preta; o display Program começa com a fonte branca. O smoke test registra callbacks de desenho nos dois displays, troca a fonte do Program para a mesma fonte exibida no Preview e verifica a mudança medida na luminância NV12 da saída, além de confirmar que ambos os displays continuam recebendo callbacks. Isso valida um **CUT sintético entre duas fontes no processo isolado**. Ainda **não** prova troca de cenas reais, captura de webcam, integração com Tauri, janelas-filhas incorporadas na interface ou o processo sidecar final. O modo `-CompileOnly` compila as declarações C# de interoperabilidade sem carregar OBS. O workflow `wMix engine validation (Windows)` baixa a distribuição portátil oficial OBS 33.0.1 x64 e executa o smoke test real em `windows-latest`; o resultado deve ser consultado no job `libobs-runtime-smoke` de cada commit.

## Licenciamento

A libobs é distribuída sob GPL-2.0-or-later. Antes de distribuir instaladores, revisar obrigações de licença, avisos, plugins e disponibilização do código correspondente.

## Limites deste incremento

A correção do identificador D3D11 reduz uma incompatibilidade com o contrato de `obs_video_info`, mas não comprova que o runtime inicializa em uma máquina Windows. Os testes unitários e o build ainda dependem da execução do workflow; nenhuma câmera, janela nativa ou transição Preview/Program foi validada neste incremento.


## Resolução de DLLs no smoke test Windows

O processo isolado registra `bin/64bit` com `AddDllDirectory`, define `LOAD_LIBRARY_SEARCH_DEFAULT_DIRS` e muda o diretório de trabalho para `bin/64bit` antes de carregar `obs.dll`. Em OBS 33.0.1, os módulos oficiais são carregados pelo loader core a partir de `core/<module>/<module>.dll`; o carregador nativo usa `LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR` para resolver dependências junto ao módulo. O caminho legado `obs-plugins/64bit` não é requisito para o pacote portátil 33.0.1. O cookie de `bin/64bit` é removido ao final do teste.
