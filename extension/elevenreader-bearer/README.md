# FFTrans ElevenReader Bearer Bridge

Chrome extension that captures ElevenReader bearer tokens and sends them to FFTrans via WebSocket.

## How it works

1. FFTrans starts a WebSocket server on `ws://127.0.0.1:39393/ext`
2. Extension auto-connects and maintains a persistent connection (auto-reconnect + keepalive)
3. When you use ElevenReader, the extension intercepts API requests and forwards bearer tokens instantly
4. No manual configuration needed — just install and go

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `extension/elevenreader-bearer`

## Usage

1. Start FFTrans
2. The extension badge shows **ON** (green) when connected
3. Visit `https://elevenreader.io` and use the Reader — tokens are forwarded automatically

## Notes

- Watches `https://api.elevenlabs.io/*` for Authorization headers
- Forwards `Authorization`, `xi-app-check-token`, and `Device-ID`
- Data only sent to `ws://127.0.0.1:39393/ext` (localhost)
- Auto-reconnects if FFTrans restarts
