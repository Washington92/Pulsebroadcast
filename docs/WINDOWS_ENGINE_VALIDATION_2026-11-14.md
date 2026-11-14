# Validação incremental do motor wMix (14/11/2026)

## Objetivo
Manter a interface React/Tauri atual enquanto a libobs é integrada como motor audiovisual nativo, sem exigir OBS Studio aberto. A branch `main` permanece fora do escopo.

## CI Windows
O workflow `.github/workflows/wmix-engine-validation.yml` executa no Windows:
- `npm ci`, `npm test`, `npm run build`;
- `cargo test` e `cargo check` em `src-tauri`.

Se `src-tauri/Cargo.lock` existir, os testes usam `--locked`; caso contrário, a resolução Cargo ocorre normalmente. O CI também pode ser acionado manualmente. Um commit de workflow **não equivale a um resultado verde**; confira o job e os logs em GitHub Actions.

## Estado observado no código
- `src/App.tsx` monta o `NativeEnginePanel` e os controles de Preview/Program existentes.
- `src-tauri/src/libobs_runtime.rs` contém o ciclo de vida experimental de `obs_startup`/`obs_shutdown`, sem configuração de vídeo, áudio ou plugins.
- O Preview/Program da interface ainda usa o compositor frontend; **não há renderização libobs validada**.

## Próximo marco técnico
1. Obter CI verde no Windows e corrigir falhas com evidências.
2. Criar bootstrap de vídeo e áudio libobs, usando cabeçalhos e binários da mesma versão; carregar plugins de diretórios confiáveis.
3. Criar uma cena e uma fonte nativa (primeiro teste com gerador de cor, depois câmera).
4. Renderizar Preview e Program nativamente sem transportar quadros por JSON/base64 via Tauri IPC.
5. Conectar CUT e FADE à troca de cenas libobs; medir FPS, latência e estabilidade em Windows 10/11.
6. Validar empacotamento, licenças GPL e dependências.

Nenhuma execução real da libobs ou screenshot foi realizada ao escrever este documento.
