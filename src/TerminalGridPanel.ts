import * as vscode from 'vscode';
import { PtyManager } from './PtyManager';
import { log } from './log';

export class TerminalGridPanel {
  public static currentPanel: TerminalGridPanel | undefined;
  public static readonly viewType = 'grid';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly ptyManager: PtyManager;
  private readonly disposables: vscode.Disposable[] = [];
  private terminalCounter = 0;

  public static createOrShow(context: vscode.ExtensionContext) {
    log('createOrShow called');
    const column = vscode.ViewColumn.Active;

    if (TerminalGridPanel.currentPanel) {
      log('Panel already exists, revealing');
      TerminalGridPanel.currentPanel.panel.reveal(column);
      return;
    }

    log('Creating new webview panel');
    const panel = vscode.window.createWebviewPanel(
      TerminalGridPanel.viewType,
      'Grid',
      column,
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

    TerminalGridPanel.currentPanel = new TerminalGridPanel(panel, context.extensionUri);
  }

  public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    TerminalGridPanel.currentPanel = new TerminalGridPanel(panel, context.extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    log('TerminalGridPanel constructor');
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.ptyManager = new PtyManager(
      (id, data) => {
        this.panel.webview.postMessage({ type: 'output', id, data });
      },
      (id) => {
        log(`Terminal ${id} exited`);
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

    this.terminalCounter++;
    log(`Spawning terminal #${this.terminalCounter}, cwd=${cwd}, shell=${shell || 'default'}`);
    const id = this.ptyManager.createTerminal(cwd, shell);
    log(`Terminal spawned with id=${id}`);

    this.panel.webview.postMessage({
      type: 'addTerminal',
      id,
      title: `Terminal ${this.terminalCounter}`,
    });
    log(`postMessage(addTerminal) sent for ${id}`);
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

        this.panel.webview.postMessage({
          type: 'config',
          fontSize,
          fontFamily,
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
          this.panel.webview.postMessage({ type: 'removeTerminal', id });
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
    <button id="add-terminal" class="toolbar-btn" title="Add new terminal (Ctrl+Shift+T)">
      <span class="codicon">+</span> New Terminal
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
    TerminalGridPanel.currentPanel = undefined;
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
