# Primeiro teste do wMix no Windows

## Obter o instalador

1. Abra [Windows desktop build](https://github.com/Washington92/Pulsebroadcast/actions/workflows/windows.yml).
2. Escolha uma execução **concluída com sucesso** da branch `develop`.
3. Em **Artifacts**, baixe `wmix-windows-installer` e extraia o arquivo ZIP.
4. Execute o instalador NSIS `.exe` em um computador Windows 10/11 de teste.

> O instalador só estará disponível se o pipeline tiver concluído com sucesso. Os artefatos expiram após 14 dias. O aplicativo ainda não possui assinatura de código; valide a origem do arquivo no GitHub antes de executar. O Windows pode exibir um aviso de reputação.

## Checklist de validação local

- [ ] Aplicativo abre pelo menu Iniciar, sem terminal ou navegador externo.
- [ ] Interface principal carrega e mantém o layout do Switcher.
- [ ] Permissão de câmera e microfone é solicitada quando necessário.
- [ ] Webcam USB aparece e produz imagem.
- [ ] Duas fontes podem ser adicionadas e selecionadas.
- [ ] Preview e Program exibem cenas independentes.
- [ ] CUT e FADE alternam fontes sem travar.
- [ ] PiP exibe uma segunda fonte.
- [ ] Mixer recebe áudio, aplica volume e mute.
- [ ] Gravação WebM inicia e para; arquivo abre em um player.
- [ ] Interrupção inesperada do gravador informa o erro e tenta recuperar os dados já capturados.
- [ ] Ao fechar e reabrir, o aplicativo não fica preso em segundo plano.

## Registro de falhas

Para cada falha, anote: versão do Windows, modelo da câmera/interface de áudio, etapa do checklist, mensagem exibida, passos para reproduzir e se acontece sempre ou ocasionalmente. Não inclua senhas, tokens nem dados pessoais.

## Limitações atuais

- A composição de vídeo usa APIs web dentro do WebView2 do Windows; a compatibilidade de dispositivos e permissões precisa ser testada no aplicativo instalado.
- O WebM é montado em memória e baixado ao encerrar. A recuperação parcial não protege contra queda de energia ou encerramento forçado do processo.
- O build do instalador não prova estabilidade de uso prolongado nem qualidade broadcast.
- Não há dependência obrigatória do OBS para as funções básicas do motor.
