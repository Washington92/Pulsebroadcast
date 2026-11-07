# wMix — roteiro de homologação do MVP no Windows

**Objetivo:** comprovar o caminho câmera + microfone → Preview → Program → WebM/IPC → FFmpeg → RTMP local, antes de ampliar o catálogo de inputs.

## Preparação

1. Instale o FFmpeg e confirme no PowerShell: `ffmpeg -version` e `ffprobe -version`.
2. Baixe o instalador de uma execução **Windows desktop build** que corresponda ao commit que deseja homologar. Não confunda um instalador anterior com a versão atual de `develop`.
3. Conecte uma webcam e um microfone e autorize o acesso do Windows/WebView2 aos dispositivos.
4. Inicie um receptor RTMP local compatível com `rtmp://127.0.0.1:1935/live/test` (por exemplo MediaMTX com RTMP habilitado). **O receptor deve estar rodando antes de iniciar a transmissão.**
5. Abra o wMix e adicione câmera e microfone. Confirme imagem no Preview e sinal de áudio; coloque a cena no Program.

## Ensaio mínimo (10 minutos)

- [ ] Preview exibe câmera ao vivo sem tela preta.
- [ ] Program recebe a câmera após o comando de transição.
- [ ] Microfone apresenta áudio no Program e não fica mudo na transmissão.
- [ ] Iniciar transmissão experimental para `rtmp://127.0.0.1:1935/live/test`.
- [ ] Receptor informa publicação ativa e reproduz vídeo e áudio.
- [ ] `ffprobe` ou o receptor confirma H.264 e AAC.
- [ ] Voz e movimento dos lábios permanecem sincronizados por 10 minutos.
- [ ] Alternar Preview/Program repetidas vezes sem interromper a transmissão.
- [ ] Parar transmissão; verificar que FFmpeg encerrou e a câmera foi liberada.
- [ ] Iniciar uma segunda transmissão na mesma sessão sem reiniciar o wMix.
- [ ] Desligar o receptor durante um ensaio separado; registrar mensagem de erro e comportamento da interface.

## Evidências obrigatórias

Registrar: versão/commit do wMix; versão do Windows; versão do FFmpeg; dispositivo de câmera e microfone; logs do receptor; captura da interface; codecs observados; duração; erros; uso de CPU/RAM; resultado de cada item.

## Critérios de aprovação

Aprovado somente se a publicação RTMP real transmitir áudio e vídeo simultaneamente durante 10 minutos, sem falha de encoder, com transições funcionais, sincronismo aceitável e parada/reinício bem-sucedidos.

**Limitações conhecidas:** os testes automáticos com fontes sintéticas não comprovam permissões WebView2, captura de hardware, sincronização real, estabilidade prolongada nem integração de Tauri IPC. Não habilitar destinos RTMP externos ou chaves de transmissão reais nesta fase.
