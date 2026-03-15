import * as os from 'os';
import * as net from 'net';
import * as childProcess from 'child_process';
import { log } from './log';

interface ManagedTerminal {
  process: childProcess.ChildProcess;
  cols: number;
  rows: number;
}

export class PtyManager {
  private terminals = new Map<string, ManagedTerminal>();
  private nextId = 0;
  private onDataCallback: (id: string, data: string) => void;
  private onExitCallback?: (id: string) => void;

  constructor(
    onData: (id: string, data: string) => void,
    onExit?: (id: string) => void
  ) {
    this.onDataCallback = onData;
    this.onExitCallback = onExit;
  }

  createTerminal(cwd: string, shell?: string): string {
    const id = `term-${++this.nextId}`;
    log(`PtyManager.createTerminal: id=${id}, cwd=${cwd}`);

    const resolvedShell =
      shell ||
      (os.platform() === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/zsh');

    let proc: childProcess.ChildProcess;

    if (os.platform() === 'darwin' || os.platform() === 'linux') {
      // Use Python's pty module to allocate a real PTY.
      // This works even without a controlling terminal (like in VS Code's extension host).
      const pyScript = `
import pty, os, sys, select, signal, struct, fcntl, termios

def set_size(fd, rows, cols):
    s = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, s)

pid, fd = pty.fork()
if pid == 0:
    os.chdir(${JSON.stringify(cwd)})
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    os.execvpe(${JSON.stringify(resolvedShell)}, [${JSON.stringify(resolvedShell)}], env)
else:
    set_size(fd, 24, 80)
    sys.stdout = os.fdopen(sys.stdout.fileno(), 'wb', 0)
    sys.stdin = os.fdopen(sys.stdin.fileno(), 'rb', 0)
    os.set_blocking(fd, False)
    os.set_blocking(0, False)
    try:
        while True:
            rlist, _, _ = select.select([fd, 0], [], [], 0.05)
            if fd in rlist:
                try:
                    data = os.read(fd, 4096)
                    if not data:
                        break
                    sys.stdout.write(data)
                except OSError:
                    break
            if 0 in rlist:
                try:
                    data = os.read(0, 4096)
                    if not data:
                        break
                    os.write(fd, data)
                except OSError:
                    break
            _, status = os.waitpid(pid, os.WNOHANG)
            if status != 0:
                try:
                    leftover = os.read(fd, 4096)
                    if leftover:
                        sys.stdout.write(leftover)
                except OSError:
                    pass
                break
    except KeyboardInterrupt:
        pass
    finally:
        os.close(fd)
`.trim();

      log(`Spawning via python3 pty.fork(), shell=${resolvedShell}`);
      proc = childProcess.spawn('python3', ['-u', '-c', pyScript], {
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      log(`Spawning (Windows): ${resolvedShell}`);
      proc = childProcess.spawn(resolvedShell, [], {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
    }

    const managed: ManagedTerminal = { process: proc, cols: 80, rows: 24 };
    log(`Process spawned: pid=${proc.pid}, stdin=${!!proc.stdin}, stdout=${!!proc.stdout}`);

    proc.stdout?.on('data', (data: Buffer) => {
      this.onDataCallback(id, data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      log(`Process ${id} stderr: ${data.toString().trim()}`);
      this.onDataCallback(id, data.toString());
    });

    proc.on('exit', (code, signal) => {
      log(`Process ${id} exited: code=${code}, signal=${signal}`);
      this.terminals.delete(id);
      this.onExitCallback?.(id);
    });

    proc.on('error', (err) => {
      log(`Process ${id} error: ${err.message}`);
      this.onDataCallback(id, `\r\n\x1b[31mFailed to start shell: ${err.message}\x1b[0m\r\n`);
      this.terminals.delete(id);
      this.onExitCallback?.(id);
    });

    this.terminals.set(id, managed);
    return id;
  }

  write(id: string, data: string) {
    const term = this.terminals.get(id);
    if (term?.process.stdin?.writable) {
      term.process.stdin.write(data);
    }
  }

  resize(id: string, cols: number, rows: number) {
    const term = this.terminals.get(id);
    if (!term || cols <= 0 || rows <= 0) return;
    term.cols = cols;
    term.rows = rows;
    // PTY resize is handled inside the Python script via TIOCSWINSZ
    // We'd need a side-channel to tell the Python process to resize.
    // For now, this is a known limitation — resize doesn't propagate.
  }

  destroyTerminal(id: string) {
    const term = this.terminals.get(id);
    if (term) {
      try {
        term.process.kill('SIGTERM');
      } catch {
        // Already dead
      }
      this.terminals.delete(id);
    }
  }

  dispose() {
    this.terminals.forEach((term) => {
      try {
        term.process.kill('SIGTERM');
      } catch {
        // Ignore cleanup errors
      }
    });
    this.terminals.clear();
  }
}
