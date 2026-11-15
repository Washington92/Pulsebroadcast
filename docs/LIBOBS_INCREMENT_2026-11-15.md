# Incremento libobs — 2026-11-15

## Alteração
O runtime nativo agora verifica a string exata de versão da libobs **antes** de chamar `obs_startup`. A integração atual usa o layout de `obs_video_info` conferido para OBS 33.0.1, e rejeita outras versões no Windows antes de inicializar estado global. O guard antigo dentro de `initialize_video` foi removido para evitar checagem tardia. Um teste unitário Windows cobre versões aceitas/rejeitadas.

## Validação e limitações
- O código da branch `develop` foi lido diretamente pelo conector GitHub e o commit foi publicado.
- O workflow `.github/workflows/develop-validation.yml` foi inspecionado: executa `npm ci`, `npm test`, `npm run build`, `cargo test` e `cargo check` em `windows-latest`.
- A consulta ao status combinado do commit não retornou verificações. **Não há evidência nesta execução de testes, build ou captura Windows concluídos**.
- A libobs ainda não entrega frames ao Preview/Program da interface. A presença de `obs_reset_video` não significa que o switcher esteja ligado ao motor.
- A comparação `main...develop` indicou branches divergentes (develop 294 commits à frente, 2 atrás no momento da consulta). Nenhuma alteração foi feita na main.

## Próximo bloco
1. Consultar os jobs reais do GitHub Actions e corrigir falhas, se houver.
2. Testar carregamento de OBS 33.0.1 e `obs_reset_video` em Windows físico; registrar logs, GPU e módulos.
3. Configurar carregamento de plugins e fonte de câmera na libobs.
4. Criar Preview e Program nativos e conectar CUT à seleção de cenas, sem substituir a interface existente.
5. Testar vídeo, áudio, encerramento e reinicialização; preparar distribuição e revisão de licença GPL.
