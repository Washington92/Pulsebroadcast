# Primeiro teste: wMix Camera Android → wMix Desktop (LAN)

**Experimental only.** This bridge sends JPEG images at about 2 FPS and does not transmit audio. It is a connectivity proof, not WebRTC, professional live video, 1080p or 60 FPS. It uses plaintext HTTP, including the bearer token. **Use only on an isolated, trusted LAN**, never publish port 8787 to the internet.

## Prerequisites
- Windows PC and Android phone on the **same trusted LAN** (no client isolation).
- Node.js 20+ on Windows.
- Latest Android debug APK built from `feature/wmix-camera-mvp`.
- wMix Desktop/frontend built from the **same branch**; existing stable installers do not contain this source type.

## Start Windows bridge (PowerShell)

From the cloned repository:

```powershell
$env:WMIX_CAMERA_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
Write-Host "Temporary camera token: $env:WMIX_CAMERA_TOKEN"
node .\tools\wmix-camera-bridge.mjs
```

Keep this terminal open. Allow incoming TCP 8787 **only on the private test network** if Windows Firewall blocks the phone. Obtain the PC's LAN IPv4 using `ipconfig`. Do not use the public IP.

## Android setup
1. Open wMix Camera, tap **Vídeo LAN**.
2. Server: `http://<PC-LAN-IPv4>:8787`, e.g. `http://192.168.1.10:8787`.
3. ID: `cam-01`; token: same temporary token from PowerShell.
4. Tap **Conectar**. This activates a CameraX image analyzer alongside the local preview.

## wMix Desktop
1. Open **Adicionar fonte → wMix Camera LAN**.
2. ID: `cam-01`; enter the same token.
3. Click **Adicionar fonte LAN**.
4. A remote source should show live JPEG snapshots, approximately 2 FPS. Selecting the source in Program sends a red Tally state; removing it from Program sends standby.

### Verification
- Existing USB camera and **Preview → CUT → Program** should continue to work.
- Phone preview remains available; receiver frame updates are intentionally slow.
- The Android Tally polls the Windows bridge each second: **PROGRAM red** / **STANDBY gray**.
- **PREVIEW green is NOT YET linked** to the desktop Preview selection.
- This is not yet native libobs input; the source is adapted into the current MediaStream pipeline.
- The bridge lacks TLS, transport negotiation, adaptive video bitrate, pairing discovery, audio and production-grade security.

## Troubleshooting
- No frames: verify Windows private firewall, IP, port, identical token and ID, and LAN isolation.
- Do not expose TCP 8787 publicly.
- If the Tauri build blocks local HTTP through its CSP, use the Vite desktop dev frontend for this first test until a secure native transport is integrated.
- Always disconnect the Android LAN source and stop the Node bridge when done.
