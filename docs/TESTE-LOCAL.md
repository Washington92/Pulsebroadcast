# Como testar o PULSE Broadcast v0.1

## Interface web (prévia do aplicativo)
Requisitos: Node.js 20+ e npm.

```powershell
git clone https://github.com/Washington92/Pulsebroadcast.git
cd Pulsebroadcast
git checkout develop
npm install
npm run dev
```

Abra o endereço local exibido pelo Vite, normalmente http://localhost:5173.

## Conectar ao OBS
1. Instale e execute OBS Studio 28+.
2. Ative o servidor WebSocket em **Ferramentas > Configurações do servidor WebSocket**.
3. Use a porta 4455, senha forte e endereço local `ws://127.0.0.1:4455`.
4. No painel OBS do PULSE, informe a senha e conecte.
5. Selecione uma cena e use **Enviar cena ao Program do OBS**.

**Atenção:** Preview, Program, Dual Canvas e áudio do PULSE ainda são simulações. A troca de cenas no OBS é a primeira operação real a validar. A transmissão do OBS não deve ser iniciada sem configurar e verificar o destino.

## Teste de compilação
```powershell
npm run build
```

A integração Tauri e a geração de instalador Windows ainda dependem de validação em ambiente Windows. A pipeline do GitHub Actions valida apenas o frontend, não o instalador.
