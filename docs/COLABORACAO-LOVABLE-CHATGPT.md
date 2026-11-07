# Protocolo de colaboração — wMix

## Objetivo
Construir o wMix em conjunto: Lovable responsável principalmente pela interface/UX e ChatGPT responsável principalmente pela integração OBS WebSocket v5, Tauri, arquitetura e validação. Este arquivo é o ponto de comunicação assíncrona entre as ferramentas.

## Regras de trabalho
- Branch de integração: `develop`. Preservar `main` até revisão e validação.
- Antes de editar, consultar o estado atual de `develop` e evitar substituir alterações de outro agente.
- Lovable: trabalhar em componentes de UI, estilos e documentação visual. Não substituir `src/services/obs.ts` nem `src/components/ObsPanel.tsx` sem alinhar neste documento.
- ChatGPT: trabalhar na integração, serviços, build e documentação técnica; preservar decisões de design do Lovable.
- Em mudanças de arquivos compartilhados (`src/App.tsx`, `package.json`, estilos globais), registrar aqui a intenção antes da alteração e revisar conflitos.
- Não descrever botões simulados como funcionalidades reais. Streaming, gravação, áudio, medidores e previews de vídeo devem indicar claramente quando são demonstrações.
- Não colocar senhas do OBS, tokens ou chaves de transmissão no repositório.

## Estado confirmado em 2026-11-07
- `main` contém README e `docs/wmix-interface.png`; não contém o código React/Tauri do aplicativo.
- `develop` contém o projeto React + Vite + Tauri, serviço OBS e `WMIX_SWITCHER.md` enviado pelo Lovable.
- Código do Lovable extraído para `src/components/pulse/Switcher.tsx` e `src/components/pulse/data.ts`; utilitário `src/lib/utils.ts` criado.
- A nova interface ainda NÃO está ativa no `App.tsx`, nem foi validada em build. Dependências e estilos Tailwind ainda exigem integração.
- O Switcher fornecido pelo Lovable usa controles simulados; comandos reais OBS permanecem no painel existente.

## Próximas entregas propostas
1. **Lovable:** publicar os estilos necessários ao Switcher (tokens, Tailwind, classes customizadas) e documentar assets, breakpoints e telas. Preferir arquivos de UI isolados e indicar arquivos alterados.
2. **ChatGPT:** configurar dependências, integrar Switcher ao aplicativo sem perder ObsPanel, mapear estados do Switcher para comandos reais OBS, executar validação de build.
3. **Ambos:** revisar funcionamento e diferenças entre screenshot e implementação; registrar bugs e melhorias neste documento ou em issues.

## Registro de passagem entre agentes
### Para o Lovable
A referência visual está em `docs/wmix-interface.png` e o código entregue em `WMIX_SWITCHER.md`. O Switcher foi extraído para arquivos reais em `develop`. Por favor, envie/commite os estilos e configurações exatas necessários para reproduzir a interface, sem reescrever o serviço OBS. Registre aqui o que foi alterado, o que está simulado e o que precisa de integração.

### Para o ChatGPT
Ao retomar, consultar commits novos e este protocolo antes de alterar a UI. Priorizar build e integração progressiva com OBS; não declarar recursos operacionais sem teste real.
