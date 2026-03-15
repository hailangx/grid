import * as os from 'os';
import * as pty from 'node-pty';

export class PtyManager {
  private terminals = new Map<string, pty.IPty>();
  private nextId = 0;
  private onDataCallback: (id: string, data: string) => void;

  constructor(onData: (id: string, data: string) => void) {
    this.onDataCallback = onData;
  }

  createTerminal(cwd: string, shell?: string): string {
    const id = `term-${++this.nextId}`;

    const resolvedShell =
      shell ||
      (os.platform() === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/zsh');

    const term = pty.spawn(resolvedShell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env } as Record<string, string>,
    });

    term.onData((data: string) => {
      this.onDataCallback(id, data);
    });

    term.onExit(({ exitCode }) => {
      this.terminals.delete(id);
    });

    this.terminals.set(id, term);
    return id;
  }

  write(id: string, data: string) {
    this.terminals.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number) {
    if (cols > 0 && rows > 0) {
      try {
        this.terminals.get(id)?.resize(cols, rows);
      } catch {
        // Terminal may have been destroyed
      }
    }
  }

  destroyTerminal(id: string) {
    const term = this.terminals.get(id);
    if (term) {
      term.kill();
      this.terminals.delete(id);
    }
  }

  dispose() {
    this.terminals.forEach((term) => {
      try {
        term.kill();
      } catch {
        // Ignore cleanup errors
      }
    });
    this.terminals.clear();
  }
}
