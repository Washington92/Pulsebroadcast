# Motor wMix — adoção da libobs (Windows)

## Decisão
O motor principal será a **libobs integrada nativamente**, não o OBS WebSocket. OBS Studio não precisará estar aberto para operar o wMix. A interface React/Tauri continua própria. O Canvas atual permanece temporariamente como fallback, sem ser apresentado como motor nativo.

## Primeiro incremento nesta branch
`src-tauri/src/libobs_probe.rs` oferece o comando Tauri `probe_libobs(path)`, que valida um caminho absoluto para `obs.dll` e retorna disponibilidade do arquivo. Ele **não carrega nem inicializa a DLL** e não valida dependências, arquitetura, codecs ou compatibilidade de ABI. O nome `obs.dll` é o binário da libobs nas distribuições Windows usuais.

Exemplo futuro de chamada frontend: `invoke("probe_libobs", { path: "C:\\\\Program Files\\\\obs-studio\\\\bin\\\\64bit\\\\obs.dll" })`. Não há UI conectada a esse comando ainda.

## Próximos incrementos (ordem obrigatória)
1. CI Windows: `npm ci && npm test && npm run build`, `cargo test` e `cargo check` em `src-tauri`.
2. Gerenciar distribuição de DLLs e plugins, paths de módulos e compatibilidade com a versão da libobs; evitar carregar DLLs de diretórios não confiáveis.
3. Criar bridge nativa C/C++ com lifecycle: `obs_startup`, inicialização de vídeo/áudio, `obs_shutdown`, ownership de fontes e callbacks. Usar FFI Rust apenas com fronteira documentada e segura.
4. Criar fontes de captura e duas composições independentes para Preview e Program, com CUT/FADE e métricas de FPS/latência.
5. Testar captura, GPU, áudio, sincronização, gravação e streaming em Windows 10/11 físicos.

## Licenciamento
A libobs é distribuída sob GPL-2.0-or-later; integrar e distribuir binários com ela implica avaliar as obrigações de código-fonte e licenças de plugins e dependências. Antes de distribuir um instalador, revisar avisos, licença e disponibilização do código correspondente.

## Validação
Este incremento apenas introduz o probe e testes unitários de caminhos inválidos. **Nenhum build, teste Rust ou teste com libobs real foi executado nesta sessão.** O probe não comprova integração funcional.
