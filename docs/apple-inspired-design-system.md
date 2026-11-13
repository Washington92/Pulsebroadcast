# Padrão de interface — WMix

> Diretriz inspirada nos princípios de UI/UX Apple. **Não é evidência de execução da skill externa apple-design.**

## Objetivo
Aplicar consistência, clareza, hierarquia, feedback, acessibilidade e acabamento profissional sem substituir a identidade própria do produto.

## Princípios obrigatórios
- Definir tokens reutilizáveis de cor, espaçamento, tipografia, raio, sombra, transição e foco.
- Usar componentes consistentes: botões, inputs, navegação, cartões, tabelas, modais, notificações e estados vazios.
- Exibir estados reais de carregamento, sucesso, erro, indisponibilidade e ações desabilitadas; nunca fingir dados ou funcionalidades.
- Garantir foco de teclado visível, rótulos, contraste adequado e áreas de toque confortáveis.
- Adaptar a interface a desktop e mobile, respeitando a densidade necessária para cada operação.
- Respeitar `prefers-reduced-motion`; animações discretas não podem bloquear tarefas.
- Preservar APIs, arquitetura, funcionalidades, identidade visual e componentes aprovados; não introduzir refatoração fora do escopo.

## Regras específicas
Preservar a disposição de Preview, Program, entradas, áudio e transições. Priorizar legibilidade em operação ao vivo, botões de 44px ou mais, estados de mute/monitor claramente distintos e densidade controlada. Não alterar o motor libobs nem refatorar fluxos funcionais por estética.

## Processo de implementação
1. Inventariar telas e componentes existentes.
2. Criar tokens e componentes base sem regressão funcional.
3. Aplicar por tela com alterações pequenas e revisáveis.
4. Validar build, lint, testes, navegação, teclado, desktop e mobile.
5. Registrar capturas reais antes/depois quando houver ambiente de execução.
6. Trabalhar somente na branch de desenvolvimento; nenhuma publicação ou merge automático.

## Estado
Este documento estabelece o padrão; **não significa que todas as telas foram atualizadas ou testadas**.
