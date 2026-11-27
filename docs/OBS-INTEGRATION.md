# OBS Studio — integração WebSocket v5

## Estado implementado

O wMix possui um adaptador opcional em `src/integrations/obs/ObsWebSocketClient.ts` e um painel de controle remoto em `src/components/pulse/ObsConnectionPanel.tsx`, disponível em **Controles avançados → Motor e conexões**.

O painel permite:

- Conectar explicitamente ao servidor OBS WebSocket v5 (padrão local `ws://127.0.0.1:4455`).
- Autenticar por challenge-response SHA-256 quando o OBS exigir senha.
- Consultar a lista de cenas, Studio Mode, Preview e Program.
- Ativar/desativar Studio Mode.
- Preparar uma cena no Preview do OBS.
- Executar CUT direto para Program com `SetCurrentProgramScene`.
- Executar TAKE usando a transição atualmente selecionada no OBS Studio.

A senha é mantida somente em memória durante a tentativa de conexão; não é persistida nem registrada em logs.

## Preparação

1. Instale OBS Studio 28 ou superior.
2. Em **Ferramentas → Configurações do servidor WebSocket**, habilite o servidor.
3. Configure uma senha forte no OBS e mantenha a porta 4455 restrita à rede local.
4. No wMix, abra **Controles avançados → Motor e conexões → OBS Studio**.
5. Informe o endereço e a senha e conecte.

Para preparar Preview e usar TAKE, o **Studio Mode** do OBS precisa estar ativo. O botão CUT envia `SetCurrentProgramScene` e altera Program diretamente. O botão TAKE define a cena de Preview e chama `TriggerStudioModeTransition`, respeitando a transição selecionada no próprio OBS.

## Limites importantes

- O painel controla o OBS remotamente; não recebe nem incorpora quadros de vídeo do OBS nos monitores Preview/Program do wMix.
- Os monitores e o compositor local do wMix continuam independentes.
- O controle remoto não transforma o OBS em um segundo motor interno do wMix nem cria duas saídas de vídeo independentes.
- Não há reconexão automática; após perda da conexão, conecte novamente.
- A conexão WebSocket real com uma instalação OBS e o uso de CUT/TAKE em hardware ainda exigem homologação manual em Windows 10/11.
- A integração libobs nativa continua experimental; o smoke test isolado não equivale à incorporação de HWND no Tauri.

## Segurança

- Nunca publique senha WebSocket nem stream key.
- Não exponha a porta 4455 diretamente à internet.
- Prefira `127.0.0.1` quando OBS e wMix estiverem na mesma máquina.
- Em aplicações web HTTPS, o navegador pode bloquear `ws://` por conteúdo misto; valide a conexão no desktop Tauri.

## Testes

`tests/obs.test.mjs` cobre handshake, autenticação/validação de URL, atualização do estado, consulta de cenas, comandos Preview/Program/TAKE e limpeza de requisições pendentes com WebSocket simulado. Esses testes validam o protocolo do cliente, não uma sessão com OBS Studio real.
