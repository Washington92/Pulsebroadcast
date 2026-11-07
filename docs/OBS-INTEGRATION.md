# OBS WebSocket — integração experimental

O arquivo `src/services/obs.ts` implementa a negociação OBS WebSocket v5, autenticação challenge-response e chamadas básicas de cena e streaming.

## Preparação
1. Instale OBS Studio 28+ no Windows.
2. Em Ferramentas > Configurações do servidor WebSocket, habilite o servidor e configure uma senha.
3. Use `ws://127.0.0.1:4455` localmente.
4. O cliente ainda **não está ligado à interface**. É uma camada de integração inicial, não uma transmissão funcional.

## Segurança
- Nunca publicar senha ou stream key no GitHub.
- Preferir conexão local; não expor a porta 4455 à internet.
- Futuramente armazenar credenciais no cofre seguro do sistema operacional.

## Limitações
- OBS não fornece nativamente dois programas totalmente independentes via WebSocket.
- Dual Canvas e multistream dependem de pipeline adicional e validação de carga/compatibilidade.
