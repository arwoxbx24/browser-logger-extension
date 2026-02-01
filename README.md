# Browser Logger Extension

Chrome extension for browser logging — console, network, WebSocket monitoring for AI agents.

## Quick Start (Windows)

### First-time Install

1. Download and run in PowerShell:
```powershell
# Download updater
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/arwoxbx24/browser-logger-extension/main/update-extension.ps1" -OutFile "$env:USERPROFILE\update-extension.ps1"

# Run it (downloads extension to %USERPROFILE%\browser-logger-extension)
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\update-extension.ps1"
```

2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select folder: `%USERPROFILE%\browser-logger-extension`

### Get Updates

Run the updater anytime:
```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\update-extension.ps1"
```

Or run in watch mode (auto-checks every 60 seconds):
```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\update-extension.ps1" -Watch
```

After update, click **Reload** in `chrome://extensions/`

## Files

- `extension/` - Chrome extension source
- `server/` - Node.js log receiver server
- `update-extension.ps1` - Windows auto-updater

## Extension ID

`bffmljbhhebjhejgkfnkjgmmmkbfnmgc`
