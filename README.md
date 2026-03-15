# Grid

A VS Code extension that replaces the default terminal split view with a configurable grid of real PTY-backed terminals.

## Features

- **Grid Layout** — Terminals displayed in an auto-sizing CSS Grid instead of vertical/horizontal splits. Columns = `ceil(sqrt(n))`.
- **Real PTY** — Full pseudo-terminal support via Python's `pty.fork()`. Colors, interactive programs, and job control all work.
- **Broadcast Mode** — Type in one terminal and input is sent to all terminals simultaneously.
- **Terminal Profile Provider** — Registers "Grid" as a selectable terminal profile. Set it as your default so every new terminal opens in the grid.
- **Intercept Mode** (opt-in) — Redirects new terminals created by other extensions or tasks into the grid.
- **Configurable** — Shell, font size, font family, initial terminal count, all via VS Code settings.
- **Zero native dependencies** — No `node-pty` or compiled C++ modules. Uses Python's built-in `pty` module via `child_process.spawn`.
- **Tiny package** — ~164 KB VSIX.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+\`` / `Ctrl+Shift+\`` | Open Grid |
| `Cmd+Shift+T` / `Ctrl+Shift+T` | Add new terminal (when grid is focused) |
| `Cmd+Shift+W` / `Ctrl+Shift+W` | Close active terminal (when grid is focused) |

## Commands

| Command | Description |
|---|---|
| `Grid: Open Grid` | Open the terminal grid panel |
| `Grid: Add Terminal to Grid` | Add a new terminal cell to the grid |
| `Grid: Toggle Intercept New Terminals` | Toggle whether new terminals are redirected into Grid |

## How It Works

1. **Extension Host** spawns shell processes via Python's `pty.fork()` (real PTY, no native modules)
2. **Webview Panel** renders a CSS Grid of `xterm.js` terminal instances
3. I/O is routed bidirectionally via VS Code's `postMessage` API
4. Each terminal cell auto-resizes using the xterm `FitAddon`

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node.js)                    │
│  ┌─────────────┐  ┌─────────────────────────────┐    │
│  │ PtyManager   │  │ TerminalGridPanel            │   │
│  │ (python pty) │◄─┤ (WebviewPanel controller)    │   │
│  └──────┬──────┘  └──────────┬──────────────────┘    │
│         │ spawn/write        │ postMessage            │
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

## Make Grid Your Default Terminal

Add to your `settings.json`:

```json
"terminal.integrated.defaultProfile.osx": "Grid"
```

Or enable intercept mode to redirect **all** new terminals into the grid:

```json
"grid.interceptNewTerminals": true
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `grid.defaultShell` | `""` | Shell to use (empty = system default) |
| `grid.initialCount` | `1` | Number of terminals to create when opening the grid |
| `grid.fontSize` | `13` | Font size for terminal text |
| `grid.fontFamily` | `'Cascadia Code', ...` | Font family for terminal text |
| `grid.interceptNewTerminals` | `false` | Redirect new terminals from other extensions into Grid |

## Development

```bash
npm install
npm run compile     # Build once
npm run watch       # Build + watch
npm run build       # Production build
```

Press `F5` in VS Code to launch the Extension Development Host.

### Package & Install Locally

```bash
npm install -g @vscode/vsce
vsce package --allow-missing-repository
code --install-extension grid-0.1.0.vsix
```

### Publish to Marketplace

```bash
vsce login hailangx
vsce publish
```

## Requirements

- VS Code 1.85+
- macOS or Linux (uses Python's `pty` module for PTY allocation)
- Python 3 (pre-installed on macOS and most Linux distros)
- Node.js 18+ (for building from source)

## Platform Support

| Platform | Status | PTY Method |
|---|---|---|
| macOS | ✅ Verified | `python3 pty.fork()` |
| Linux | ✅ Expected to work | `python3 pty.fork()` |
| Windows | ⚠️ Basic (no PTY) | `child_process.spawn` with shell |

## License

MIT
