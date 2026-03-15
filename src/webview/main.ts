import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

function wlog(msg: string) {
  console.log(`[Grid Webview] ${msg}`);
}

interface TerminalCell {
  id: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  element: HTMLElement;
}

interface GridConfig {
  fontSize: number;
  fontFamily: string;
}

class TerminalGrid {
  private terminals = new Map<string, TerminalCell>();
  private gridContainer: HTMLElement;
  private activeTerminalId: string | null = null;
  private broadcastMode = false;
  private config: GridConfig = {
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', Menlo, Monaco, monospace",
  };

  constructor() {
    wlog('TerminalGrid constructor');
    this.gridContainer = document.getElementById('grid')!;
    this.setupMessageHandler();
    this.setupResizeObserver();
    this.setupToolbar();
    this.setupKeyboardShortcuts();

    wlog('Sending ready message to extension host');
    vscode.postMessage({ type: 'ready' });
  }

  private setupToolbar() {
    wlog('setupToolbar: looking for #add-terminal');
    const addBtn = document.getElementById('add-terminal');
    wlog(`setupToolbar: addBtn=${!!addBtn}`);
    addBtn?.addEventListener('click', () => {
      wlog('+ New Terminal button clicked');
      vscode.postMessage({ type: 'requestNewTerminal' });
    });

    const broadcastBtn = document.getElementById('broadcast')!;
    broadcastBtn.addEventListener('click', () => {
      this.broadcastMode = !this.broadcastMode;
      broadcastBtn.classList.toggle('active', this.broadcastMode);
    });
  }

  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + T = new terminal
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        vscode.postMessage({ type: 'requestNewTerminal' });
      }
      // Ctrl/Cmd + Shift + W = close active terminal
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key === 'W' &&
        this.activeTerminalId
      ) {
        e.preventDefault();
        vscode.postMessage({
          type: 'closeTerminal',
          id: this.activeTerminalId,
        });
      }
    });
  }

  private setupMessageHandler() {
    window.addEventListener('message', (event) => {
      const message = event.data;
      wlog(`Received message: type=${message.type}, id=${message.id || 'none'}`);
      switch (message.type) {
        case 'config':
          this.config.fontSize = message.fontSize ?? this.config.fontSize;
          this.config.fontFamily = message.fontFamily ?? this.config.fontFamily;
          break;
        case 'output':
          this.terminals.get(message.id)?.terminal.write(message.data);
          break;
        case 'addTerminal':
          this.createTerminalCell(message.id, message.title);
          break;
        case 'removeTerminal':
          this.removeTerminalCell(message.id);
          break;
      }
    });
  }

  private createTerminalCell(id: string, title: string) {
    wlog(`createTerminalCell: id=${id}, title=${title}`);
    // Cell container
    const cell = document.createElement('div');
    cell.className = 'terminal-cell';
    cell.dataset.id = id;

    // Header bar
    const header = document.createElement('div');
    header.className = 'terminal-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'terminal-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'terminal-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Close terminal';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'closeTerminal', id });
    });
    header.appendChild(closeBtn);

    cell.appendChild(header);

    // Terminal wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    cell.appendChild(wrapper);

    this.gridContainer.appendChild(cell);

    // Create xterm instance
    const terminal = new Terminal({
      fontSize: this.config.fontSize,
      fontFamily: this.config.fontFamily,
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(wrapper);

    // Focus handling
    cell.addEventListener('mousedown', () => {
      this.setActiveTerminal(id);
    });

    // Input handling — supports broadcast mode
    terminal.onData((data) => {
      if (this.broadcastMode) {
        this.terminals.forEach((_, tid) => {
          vscode.postMessage({ type: 'input', id: tid, data });
        });
      } else {
        vscode.postMessage({ type: 'input', id, data });
      }
    });

    // Store the cell
    const termCell: TerminalCell = { id, terminal, fitAddon, element: cell };
    this.terminals.set(id, termCell);

    // Update layout then fit
    this.updateGridLayout();
    this.updateTerminalCount();

    requestAnimationFrame(() => {
      fitAddon.fit();
      vscode.postMessage({
        type: 'resize',
        id,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    });

    this.setActiveTerminal(id);
  }

  private removeTerminalCell(id: string) {
    const cell = this.terminals.get(id);
    if (!cell) return;

    cell.terminal.dispose();
    cell.element.remove();
    this.terminals.delete(id);

    this.updateGridLayout();
    this.updateTerminalCount();

    if (this.activeTerminalId === id) {
      const first = this.terminals.keys().next();
      if (!first.done) {
        this.setActiveTerminal(first.value);
      } else {
        this.activeTerminalId = null;
      }
    }
  }

  private setActiveTerminal(id: string) {
    this.terminals.forEach((cell) => {
      cell.element.classList.remove('active');
    });

    const cell = this.terminals.get(id);
    if (cell) {
      cell.element.classList.add('active');
      cell.terminal.focus();
      this.activeTerminalId = id;
    }
  }

  private updateGridLayout() {
    const count = this.terminals.size;
    if (count === 0) {
      this.gridContainer.style.gridTemplateColumns = '1fr';
      this.gridContainer.style.gridTemplateRows = '1fr';
      return;
    }

    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    this.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    requestAnimationFrame(() => this.fitAll());
  }

  private updateTerminalCount() {
    const countEl = document.getElementById('terminal-count');
    if (countEl) {
      const n = this.terminals.size;
      countEl.textContent = `${n} terminal${n !== 1 ? 's' : ''}`;
    }
  }

  private setupResizeObserver() {
    const observer = new ResizeObserver(() => {
      this.fitAll();
    });
    observer.observe(this.gridContainer);
  }

  private fitAll() {
    this.terminals.forEach((cell) => {
      try {
        cell.fitAddon.fit();
        vscode.postMessage({
          type: 'resize',
          id: cell.id,
          cols: cell.terminal.cols,
          rows: cell.terminal.rows,
        });
      } catch {
        // Ignore fit errors during layout transitions
      }
    });
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      wlog('DOMContentLoaded, creating TerminalGrid');
      new TerminalGrid();
    } catch (e: any) {
      console.error('[Grid Webview] CRASH in constructor:', e);
    }
  });
} else {
  try {
    wlog('Document ready, creating TerminalGrid');
    new TerminalGrid();
  } catch (e: any) {
    console.error('[Grid Webview] CRASH in constructor:', e);
  }
}
