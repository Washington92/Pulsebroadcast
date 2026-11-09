# wMix + libobs — integração nativa incremental

A interface React do wMix permanece visível. O componente `NativeEnginePanel` permite inicializar/encerrar a libobs diretamente no processo Tauri, usando os comandos `start_libobs`, `libobs_status` e `stop_libobs`. Não é necessário iniciar o OBS Studio; **é necessário fornecer uma instalação/distribuição compatível da libobs e dependências**.

## Estado atual (não confundir com motor pronto)
O backend Rust tenta carregar `obs.dll`, resolve os símbolos `obs_startup`, `obs_shutdown` e `obs_get_version_string`, inicializa a biblioteca e expõe o status na interface. Isso é um primeiro passo do ciclo de vida nativo, **não** um pipeline audiovisual. A visualização Preview/Program existente continua usando o Canvas e não é renderizada pela libobs. O painel não mostra vídeo nativo.

## Como validar no Windows (ainda não executado)
1. Instalar Node.js 20+, Rust/MSVC e dependências do Tauri.
2. Executar `npm ci && npm test && npm run build`.
3. Executar `cd src-tauri && cargo test && cargo check`.
4. Executar `npm run tauri dev`; no painel Motor libobs, fornecer caminho absoluto para `obs.dll` de uma instalação confiável do OBS Studio e clicar em Inicializar.
5. Conferir versão e estado, encerrar e repetir; testar também DLL ausente e dependências ausentes. Coletar logs em caso de falha.

**Atenção:** carregar uma DLL executa código nativo com as permissões do aplicativo. Utilize somente binários confiáveis e compatíveis; uma DLL existente não garante dependências corretas. O runtime experimental ainda não trata plenamente lifecycle de plugins, configuração de áudio/vídeo, threads de renderização ou recuperação após falhas. O carregamento de DLL e as operações de inicialização/encerramento exigem revisão de segurança e testes reais antes da distribuição.

## Próximo marco obrigatório
- Adicionar bootstrap de vídeo/áudio (`obs_reset_video`/`obs_reset_audio`) e descoberta de plugins.
- Criar cenas/inputs e gerenciar ownership/referências nativas.
- Expor superfícies de renderização Preview e Program ao frontend sem passar quadros em base64 pelo IPC.
- Migrar CUT/FADE, mixer, gravação e streaming do fallback Canvas para libobs, por etapas.
- Testar em Windows 10/11 com GPU e dispositivos reais, e empacotar bibliotecas/plugins com respeito à GPL.

A branch `main` deve continuar estável. Nenhum build, screenshot ou teste real da libobs foi executado nesta sessão.
