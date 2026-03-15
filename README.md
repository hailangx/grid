# Grid

A VS Code extension that provides a grid view of terminals, replacing the default terminal split layout.

## Features

- **Grid Layout**: Terminals are displayed in an auto-sizing grid instead of vertical/horizontal splits
- **Auto-Layout**: Grid columns auto-adjust based on count — `ceil(sqrt(n))` columns
- **Broadcast Mode**: Type in one terminal and input is sent to all terminals simultaneously
- **Keyboard Shortcuts**:
  - `Ctrl+Shift+\`` / `Cmd+Shift+\`` — Open Grid
  - `Ctrl+Shift+T` / `Cmd+Shift+T` — Add new terminal (when grid is focused)
  - `Ctrl+Shift+W` / `Cmd+Shift+W` — Close active terminal (when grid is focused)

## How It Works

1. **Extension Host** spawns real shell processes via `node-pty`
2. **Webview Panel** renders a CSS Grid of `xterm.js` terminal instances
3. I/O is routed bidirectionally via VS Code's `postMessage` API
4. Each terminal cell auto-resizes using the xterm `FitAddon`

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node.js)                    │
│  ┌─────────────┐  ┌─────────────────────────────┐    │
│  │ PtyManager   │  │ TerminalGridPanel            │   │
│  │ (node-pty)   │◄─┤ (WebviewPanel controller)    │   │
│  └──────┬──────┘  └──────────┬──────────────────┘    │
│         │ spawn/write/resize │ postMessage            │
└─────────┼────────────────────┼───────────────────────┘
          │                    │
          ▼                    ▼
┌──────────────────────────────────────────────────────┐
│  Webview (Browser)                                   │
│  ┌──────────────────────────────────────────────┐    │
│  │ Terminal Grid UI                              │    │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐       │    │
│  │ │ xterm.js │ │ xterm.js │ │ xterm.js │       │    │
│  │ │ + Fit    │ │ + Fit    │ │ + Fit    │       │    │
│  │ └──────────┘ └──────────┘ └──────────┘       │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agentGrid.defaultShell` | `""` | Shell to use (empty = system default) |
| `agentGrid.initialCount` | `1` | Number of terminals on grid open |
| `agentGrid.fontSize` | `13` | Font size for terminal text |
| `agentGrid.fontFamily` | `'Cascadia Code', ...` | Font family for terminal text |

## Development

```bash
npm install
npm run compile     # Build once
npm run watch       # Build + watch
npm run build       # Production build
```

Press `F5` in VS Code to launch the Extension Development Host.

## Requirements

- VS Code 1.85+
- Node.js 18+ (for building)
- Platform build tools for `node-pty` (Xcode CLT on macOS, build-essential on Linux)
