import * as vscode from 'vscode';
import { TerminalGridPanel } from './TerminalGridPanel';
import { log, initLog } from './log';

/**
 * Stub Pseudoterminal that lives in VS Code's built-in terminal panel.
 * Shows a redirect message; the real shell runs in the grid webview.
 */
class GridRedirectPty implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  open() {
    this.writeEmitter.fire(
      '\x1b[1;36m⬡ Grid\x1b[0m — This terminal is managed by Grid.\r\n' +
        'The real shell is running in the grid webview panel.\r\n' +
        'You can close this stub terminal.\r\n'
    );
  }

  close() {
    this.closeEmitter.fire();
  }

  handleInput() {
    // Ignore — real terminal is in the grid
  }
}

export function activate(context: vscode.ExtensionContext) {
  initLog(context);
  log('Extension activating...');
  log(`Extension path: ${context.extensionPath}`);
  const interceptEnabled = () =>
    vscode.workspace
      .getConfiguration('grid')
      .get<boolean>('interceptNewTerminals', false);

  // ── Commands ────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('grid.open', () => {
      log('Command: grid.open');
      TerminalGridPanel.createOrShow(context);
    }),

    vscode.commands.registerCommand('grid.addTerminal', () => {
      log('Command: grid.addTerminal');
      if (TerminalGridPanel.currentPanel) {
        TerminalGridPanel.currentPanel.addTerminal();
      } else {
        TerminalGridPanel.createOrShow(context);
      }
    }),

    vscode.commands.registerCommand('grid.toggleIntercept', () => {
      const current = interceptEnabled();
      vscode.workspace
        .getConfiguration('grid')
        .update('interceptNewTerminals', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Grid intercept: ${!current ? 'ON — new terminals will open in the grid' : 'OFF — new terminals use the default panel'}`
      );
    })
  );

  // ── Terminal Profile Provider ───────────────────────────
  // Registers "Grid" as a selectable terminal profile.
  // Users can set it as default via:
  //   "terminal.integrated.defaultProfile.osx": "Grid"
  //   "terminal.integrated.defaultProfile.linux": "Grid"
  //   "terminal.integrated.defaultProfile.windows": "Grid"

  context.subscriptions.push(
    vscode.window.registerTerminalProfileProvider('grid.profile', {
      provideTerminalProfile(
        _token: vscode.CancellationToken
      ): vscode.ProviderResult<vscode.TerminalProfile> {
        log('Terminal profile provider triggered');
        // Open grid and add a terminal cell
        TerminalGridPanel.createOrShow(context);
        setTimeout(() => {
          TerminalGridPanel.currentPanel?.addTerminal();
        }, 200);

        // Return a stub profile for the built-in panel
        return new vscode.TerminalProfile({
          name: 'Grid',
          pty: new GridRedirectPty(),
        });
      },
    })
  );

  // ── Intercept new terminals (opt-in) ───────────────────
  // When enabled, any new terminal opened by extensions/tasks/etc.
  // is redirected into the grid instead.

  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      if (!interceptEnabled()) return;
      // Skip our own stub terminals
      if (terminal.name === 'Grid') return;

      terminal.dispose();
      TerminalGridPanel.createOrShow(context);
      setTimeout(() => {
        TerminalGridPanel.currentPanel?.addTerminal();
      }, 200);
    })
  );

  // ── Webview serializer (restore on reload) ─────────────

  if (vscode.window.registerWebviewPanelSerializer) {
    vscode.window.registerWebviewPanelSerializer(TerminalGridPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        TerminalGridPanel.revive(panel, context);
      },
    });
  }
  log('Extension activated successfully');
}

export function deactivate() {
  log('Extension deactivating');
}
