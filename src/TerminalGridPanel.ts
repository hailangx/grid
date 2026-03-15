import * as vscode from 'vscode';
import * as path from 'path';
import { PtyManager } from './PtyManager';
import { log } from './log';

export class TerminalGridPanel {
  public static readonly viewType = 'grid';

  // ── Multi-panel management ─────────────────────────────
  private static panels: TerminalGridPanel[] = [];
  private static globalTerminalCounter = 0;
  private static panelCounter = 0;

  public static get currentPanel(): TerminalGridPanel | undefined {
    return TerminalGridPanel.panels[TerminalGridPanel.panels.length - 1];
  }

  /** Find the best panel to add a terminal to (or create a new one). */
  public static getAvailablePanel(context: vscode.ExtensionContext): TerminalGridPanel {
    const config = vscode.workspace.getConfiguration('grid');
    const maxPerGrid = config.get<number>('maxTerminalsPerGrid') ?? 9;

    // Find an existing panel with room
    const available = TerminalGridPanel.panels.find(p => p.terminalCount < maxPerGrid);
    if (available) {
      available.panel.reveal();
      return available;
    }

    // All full (or none exist) — create a new one
    return TerminalGridPanel.createNew(context);
  }

  public static createOrShow(context: vscode.ExtensionContext): TerminalGridPanel {
    log('createOrShow called');

    // If panels exist, reveal the last one
    if (TerminalGridPanel.panels.length > 0) {
      const last = TerminalGridPanel.panels[TerminalGridPanel.panels.length - 1];
      log('Panel already exists, revealing');
      last.panel.reveal();
      return last;
    }

    return TerminalGridPanel.createNew(context);
  }

  private static createNew(context: vscode.ExtensionContext): TerminalGridPanel {
    TerminalGridPanel.panelCounter++;
    const gridName = `Grid ${TerminalGridPanel.panelCounter}`;

    log(`Creating new webview panel: ${gridName}`);
    const panel = vscode.window.createWebviewPanel(
      TerminalGridPanel.viewType,
      gridName,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'node_modules'),
        ],
      }
    );

    const gridPanel = new TerminalGridPanel(panel, context.extensionUri, gridName);
    TerminalGridPanel.panels.push(gridPanel);
    log(`Panel created: ${gridName} (total: ${TerminalGridPanel.panels.length})`);
    return gridPanel;
  }

  public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    TerminalGridPanel.panelCounter++;
    const gridName = `Grid ${TerminalGridPanel.panelCounter}`;
    const gridPanel = new TerminalGridPanel(panel, context.extensionUri, gridName);
    TerminalGridPanel.panels.push(gridPanel);
  }

  public static closeAll() {
    log('Closing all grid panels');
    // Copy array since dispose mutates it
    [...TerminalGridPanel.panels].forEach(p => p.dispose());
  }

  // ── Instance ───────────────────────────────────────────

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly ptyManager: PtyManager;
  private readonly disposables: vscode.Disposable[] = [];
  private terminalCount = 0;
  private gridName: string;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, gridName: string) {
    log('TerminalGridPanel constructor');
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.gridName = gridName;

    this.ptyManager = new PtyManager(
      (id, data) => {
        this.panel.webview.postMessage({ type: 'output', id, data });
      },
      (id) => {
        log(`Terminal ${id} exited`);
        this.terminalCount--;
        this.panel.webview.postMessage({ type: 'removeTerminal', id });
      }
    );

    this.panel.iconPath = new vscode.ThemeIcon('terminal');
    log('Setting webview HTML');
    this.panel.webview.html = this.getHtmlForWebview();
    log('Webview HTML set');

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public addTerminal() {
    log('addTerminal called');
    const cwd =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      process.env.HOME ||
      '/';

    const config = vscode.workspace.getConfiguration('grid');
    const shell = config.get<string>('defaultShell') || undefined;
    const showCwd = config.get<boolean>('showCwdInTitle') ?? true;

    TerminalGridPanel.globalTerminalCounter++;
    this.terminalCount++;

    const num = TerminalGridPanel.globalTerminalCounter;
    const title = showCwd
      ? `${num}: ${path.basename(cwd)}`
      : `Terminal ${num}`;

    log(`Spawning terminal #${num}, cwd=${cwd}, shell=${shell || 'default'}`);
    const id = this.ptyManager.createTerminal(cwd, shell);
    log(`Terminal spawned with id=${id}`);

    this.panel.webview.postMessage({
      type: 'addTerminal',
      id,
      title,
      cwd,
    });
    log(`postMessage(addTerminal) sent for ${id}`);
  }

  public rename(newName: string) {
    this.gridName = newName;
    this.panel.title = newName;
    log(`Panel renamed to: ${newName}`);
  }

  public getTerminalCount(): number {
    return this.terminalCount;
  }

  private handleMessage(message: Record<string, unknown>) {
    const type = message.type;
    const id = typeof message.id === 'string' ? message.id : undefined;
    log(`Webview message: type=${type}, id=${id || 'none'}`);

    switch (type) {
      case 'ready': {
        const config = vscode.workspace.getConfiguration('grid');
        const count = config.get<number>('initialCount') ?? 1;
        const fontSize = config.get<number>('fontSize') ?? 13;
        const fontFamily =
          config.get<string>('fontFamily') ??
          "'Cascadia Code', 'Fira Code', Menlo, Monaco, monospace";
        const showCwd = config.get<boolean>('showCwdInTitle') ?? true;

        this.panel.webview.postMessage({
          type: 'config',
          fontSize,
          fontFamily,
          showCwd,
          gridName: this.gridName,
        });

        for (let i = 0; i < count; i++) {
          this.addTerminal();
        }
        break;
      }

      case 'input':
        if (id && typeof message.data === 'string') {
          this.ptyManager.write(id, message.data);
        }
        break;

      case 'resize':
        if (
          id &&
          typeof message.cols === 'number' &&
          typeof message.rows === 'number'
        ) {
          this.ptyManager.resize(id, message.cols, message.rows);
        }
        break;

      case 'requestNewTerminal':
        this.addTerminal();
        break;

      case 'closeTerminal':
        if (id) {
          this.ptyManager.destroyTerminal(id);
          this.terminalCount--;
          this.panel.webview.postMessage({ type: 'removeTerminal', id });
        }
        break;

      case 'closeAllTerminals':
        log('closeAllTerminals requested from webview');
        this.ptyManager.dispose();
        this.terminalCount = 0;
        this.panel.webview.postMessage({ type: 'clearAll' });
        break;

      case 'renameGrid':
        if (typeof message.name === 'string') {
          this.rename(message.name);
        }
        break;
    }
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css')
    );
    const xtermCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'node_modules',
        '@xterm',
        'xterm',
        'css',
        'xterm.css'
      )
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${xtermCssUri}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Grid</title>
</head>
<body>
  <div class="toolbar">
    <span id="grid-name" class="toolbar-grid-name" title="Double-click to rename">${this.gridName}</span>
    <div class="toolbar-separator"></div>
    <button id="add-terminal" class="toolbar-btn" title="Add new terminal (Ctrl+Shift+T)">
      + New
    </button>
    <button id="close-all" class="toolbar-btn toolbar-btn-danger" title="Close all terminals">
      ✕ Close All
    </button>
    <div class="toolbar-separator"></div>
    <button id="broadcast" class="toolbar-btn" title="Broadcast input to all terminals">
      ⌘ Broadcast
    </button>
    <div class="toolbar-spacer"></div>
    <span id="terminal-count" class="toolbar-info"></span>
  </div>
  <div id="grid" class="terminal-grid"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    // Remove from static panels array
    const idx = TerminalGridPanel.panels.indexOf(this);
    if (idx !== -1) {
      TerminalGridPanel.panels.splice(idx, 1);
    }
    log(`Panel disposed: ${this.gridName} (remaining: ${TerminalGridPanel.panels.length})`);

    this.ptyManager.dispose();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
