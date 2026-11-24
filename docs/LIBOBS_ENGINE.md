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
5. No pacote OBS 33.0.1, carregar explicitamente os módulos core necessários com `obs_load_plugins()` usando `OBS_MODULE_TYPE_CORE`, verificar `obs_module_failure_info` e chamar `obs_post_load_modules()`. Este probe headless não usa `obs_load_all_modules()` (API depreciada neste caminho) nem `obs_load_core_modules()` (que pode tentar iniciar módulos de frontend e hardware que o processo não hospeda).
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
- Configura áudio estéreo a 48 kHz e carrega os módulos core mínimos `image-source` e `win-dshow` por `obs_load_plugins()` com `OBS_MODULE_TYPE_CORE`, verificando falhas e chamando `obs_post_load_modules()`. A rotina depreciada `obs_load_all_modules()` é vazia em OBS 33.0.1.
- Evita `obs_load_core_modules()` no probe headless: esse carregador tenta inicializar também módulos de frontend e hardware opcionais. O teste carrega apenas `core/image-source/image-source.dll`, verifica o contador de falhas e depois confirma o registro da fonte ao criar `color_source_v3`.
- Mantém o diretório de trabalho em `bin/64bit`, pois o caminho do módulo core é relativo a esse diretório: `../../core/<module>/<module>.dll`, com dados em `../../core/<module>/data`.
- Usa a assinatura oficial do OBS 33.0.1 `obs_display_create(gs_init_data*, uint32_t background_color)`; a cor inicial é passada na criação e pode ser atualizada depois por `obs_display_set_background_color()`.
- Mantém o estado de exibição da fonte com `obs_source_inc_showing()`/`obs_source_dec_showing()`.

O teste completo cria duas fontes sintéticas `color_source_v3` (branca e preta) e dois `HWND`/`obs_display` independentes. O display Preview mantém a fonte preta; o display Program começa com a fonte branca. O smoke test registra callbacks de desenho nos dois displays, troca a fonte do Program para a mesma fonte exibida no Preview e verifica a mudança medida na luminância NV12 da saída, além de confirmar que ambos os displays continuam recebendo callbacks. Isso valida um **CUT sintético entre duas fontes no processo isolado**. Ainda **não** prova troca de cenas reais, captura de webcam, integração com Tauri, janelas-filhas incorporadas na interface ou o processo sidecar final. O modo `-CompileOnly` compila as declarações C# de interoperabilidade sem carregar OBS. O workflow `wMix engine validation (Windows)` baixa a distribuição portátil oficial OBS 33.0.1 x64 e executa o smoke test real em `windows-latest`; o resultado deve ser consultado no job `libobs-runtime-smoke` de cada commit.

## Licenciamento

A libobs é distribuída sob GPL-2.0-or-later. Antes de distribuir instaladores, revisar obrigações de licença, avisos, plugins e disponibilização do código correspondente.

## Limites deste incremento

A correção do identificador D3D11 reduz uma incompatibilidade com o contrato de `obs_video_info`, mas não comprova que o runtime inicializa em uma máquina Windows. Os testes unitários e o build ainda dependem da execução do workflow; nenhuma câmera, janela nativa ou transição Preview/Program foi validada neste incremento.


## Resolução de DLLs no smoke test Windows

O processo isolado registra `bin/64bit` com `AddDllDirectory`, define `LOAD_LIBRARY_SEARCH_DEFAULT_DIRS` e muda o diretório de trabalho para `bin/64bit` antes de carregar `obs.dll`. Em OBS 33.0.1, os módulos oficiais são carregados pelo loader core a partir de `core/<module>/<module>.dll`; o carregador nativo usa `LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR` para resolver dependências junto ao módulo. O caminho legado `obs-plugins/64bit` não é requisito para o pacote portátil 33.0.1. O cookie de `bin/64bit` é removido ao final do teste.


## DirectShow module smoke test (OBS 33.0.1)

The Windows engine workflow also verifies the official core module at `core/win-dshow/win-dshow.dll`. The isolated probe loads `image-source` and `win-dshow` as core modules with `obs_load_plugins()`, then creates a non-visible `dshow_input` source and inspects its `video_device_id` property list.

The probe logs each DirectShow device name and identifier returned by the module. A count of zero is accepted on hosted CI runners without physical capture hardware; in that case the default test proves module loading, source registration, and availability of the device property, **not** camera capture or frame delivery. The default CI invocation intentionally does not pass `-CaptureCamera`.

For a physical Windows 10/11 x64 acceptance test, run the probe on a machine with an available camera that is not in use:

```powershell
pwsh -NoProfile -File tests/libobs_preview_cut_smoke.ps1 -ObsRoot "C:\Program Files\obs-studio" -CaptureCamera
```

With `-CaptureCamera`, the probe selects the first non-disabled DirectShow device, updates `video_device_id`, activates it, and renders that source in the Preview display while Program remains on the synthetic source. It then performs CUT to the same camera source in Program and checks source dimensions, continued Preview/Program draw callbacks, the Program output-source pointer, and raw video frames. The mode fails if no device is listed or no frames arrive; it is deliberately opt-in because hosted CI runners generally have no physical camera. This validates camera-to-Preview/Program inside the isolated probe, **not yet embedding those HWND displays into the Tauri interface**.

The test destroys the properties object and releases the temporary source before `obs_shutdown()`. In the default mode it does not mark the DirectShow source as showing or start a capture stream.
