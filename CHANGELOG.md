# Changelog

All notable changes to the **Grid** extension will be documented in this file.

## [0.2.0] - 2026-03-14

### Added

- **Multi-Grid Tabs** — New grid tab auto-created when terminal count exceeds `grid.maxTerminalsPerGrid` (default: 9)
- **Rename Grid Tabs** — Double-click the grid name in toolbar, or use `Grid: Rename Grid Tab` command
- **CWD in Titles** — Terminal titles show the current working directory (configurable via `grid.showCwdInTitle`)
- **Close All** — "✕ Close All" button in toolbar to destroy all terminals in a grid tab at once
- **Close All Grids** command — `Grid: Close All Terminals` to close every grid tab and terminal
- New settings: `grid.maxTerminalsPerGrid`, `grid.showCwdInTitle`

## [0.1.0] - 2026-03-14

### Added

- Terminal grid view with auto-sizing CSS Grid layout (`ceil(sqrt(n))` columns)
- Real PTY-backed terminals via Python's `pty.fork()` — colors, interactive programs, and job control work
- Terminal rendering with `xterm.js` v5 and `FitAddon` for auto-resize
- Broadcast mode — type once, send input to all terminals simultaneously
- Terminal Profile Provider — register "Grid" as a selectable terminal profile
- Intercept mode (opt-in) — redirect new terminals from other extensions into the grid
- Configurable: shell, font size, font family, initial terminal count via VS Code settings
- Keyboard shortcuts: `Cmd+Shift+\`` to open, `Cmd+Shift+T` to add, `Cmd+Shift+W` to close
- Webview panel serialization — persists across VS Code restarts
- Output channel logging for troubleshooting
- Zero native dependencies — no `node-pty`, no compiled C++ modules (~165 KB VSIX)

### Platform Support

- macOS: ✅ Verified
- Linux: ✅ Expected to work
- Windows: ⚠️ Basic shell support (no PTY)
