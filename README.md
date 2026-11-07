# wMix

Aplicativo em desenvolvimento para produção audiovisual no Windows 10/11, com fluxo de trabalho inspirado em switchers de vídeo. **Ainda não é um produto pronto para transmissão profissional.**

## Estado real do protótipo

O frontend React + TypeScript (Vite) utiliza um motor de composição **Canvas no navegador, sem dependência do OBS**. Há captura de câmera e tela (mediante permissões), seleção Preview/Program, CUT, FADE, PiP, presets de layout, mixer Web Audio e gravação local WebM quando o navegador oferece suporte. A gravação e as capturas dependem das APIs e codecs disponíveis no ambiente.

O Preview de cenas preparadas usa Canvas independente; permite selecionar a câmera principal e uma fonte PiP. O FADE compõe a cena anterior em movimento quando a fonte anterior permanece disponível e recorre a um quadro congelado quando não permanece. A transição ainda requer testes com fontes físicas e cenários de perda de sinal.

**OBS:** integração OBS WebSocket, controle de cenas/Preview/Program do OBS e sincronização de estado **ainda não estão implementados**. A integração será um adaptador opcional, sem substituir o motor independente. Não confundir o Preview/Program do motor Canvas com o modo Studio do OBS.

**Desktop:** há dependência de CLI Tauri, mas o empacotamento e a compatibilidade Windows 10/11 ainda precisam de validação real. Não há garantia de distribuição pronta.

## Desenvolvimento

Requisitos: Node.js 20+ e npm.

```bash
npm ci
npm run build
npm run dev
```

O build executa `tsc -b && vite build`. Para conferir resultados automatizados, consulte a aba Actions do GitHub; aprovação de build não equivale a teste com câmera, áudio, gravação ou OBS reais.

## Roteiro técnico

1. Garantir build e testes de regressão de CUT, FADE, PiP, remoção de fonte e gravação.
2. Melhorar a transição entre composições completas com fontes em movimento, tratamento de fonte indisponível e medição de desempenho.
3. Adicionar um adaptador OBS WebSocket opcional com conexão configurável, autenticação e consulta de Preview/Program (OBS Studio Mode); nunca expor credenciais no frontend publicado.
4. Validar o empacotamento Tauri em Windows 10/11 e permissões de captura; depois testar integração OBS em ambiente real.
5. Documentar limites de codecs, formatos de gravação, recuperação de falhas e requisitos de hardware.

## Branches

- `main`: estável; não recebe alterações experimentais diretamente.
- `develop`: desenvolvimento e validação.

O projeto não incorpora código proprietário do vMix ou do OBS.
