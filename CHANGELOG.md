# Changelog

All notable changes to the **Grid** extension will be documented in this file.

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
- Zero native dependencies — no `node-pty`, no compiled C++ modules (~164 KB VSIX)

### Platform Support

- macOS: ✅ Verified
- Linux: ✅ Expected to work
- Windows: ⚠️ Basic shell support (no PTY)
