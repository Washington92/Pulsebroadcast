# Critérios de validação — OBS WebSocket v5

## Estado atual
- O PULSE controla cenas, modo Studio, gravação e streaming por comandos OBS WebSocket.
- O painel consulta periodicamente o estado real das saídas e os nomes das cenas.
- Preview e Program exibem **nomes de cenas**, não vídeo renderizado.
- Botões CUT/FADE/WIPE/ZOOM da interface principal ainda são demonstrativos.
- Dual Canvas ainda é demonstrativo; o OBS WebSocket não oferece dois programas independentes automaticamente.

## Testes de integração obrigatórios
1. OBS desligado: conexão falha com mensagem compreensível e sem travamento.
2. Senha incorreta: conexão falha, sem guardar credenciais em disco.
3. OBS ligado e autenticado: listar cenas e identificar Program.
4. Modo Studio ativado: identificar Preview e Program distintos.
5. Trocar cena externamente no OBS: painel reflete a alteração em até 3 segundos.
6. Iniciar/parar gravação no OBS: indicador acompanha estado real.
7. Iniciar transmissão **somente com destino de teste autorizado**: confirmar antes de transmitir e verificar indicador.
8. Desconectar durante requisição: solicitações pendentes são rejeitadas.
9. OBS sem responder: comando expira em até 10 segundos, com erro visível.
10. Reconectar após falha: interface retorna a estado consistente.

## Critérios para release
- `npm run build` passa sem erros.
- Teste manual em Windows 10/11 com OBS Studio 28+.
- Fluxos acima executados e registrados com data, ambiente e resultado.
- Capturas de tela reais obtidas da aplicação em execução.
- Empacotamento Tauri e instalador NSIS validados em Windows.
- Nenhuma simulação rotulada como vídeo real ou transmissão ativa.

Não declarar recursos como testados sem evidência de execução.
