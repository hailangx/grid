import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Grid');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine(`[Grid] Log initialized at ${new Date().toISOString()}`);
}

export function log(message: string) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${message}`;
  outputChannel?.appendLine(line);
  console.log(`[Grid] ${line}`);
}
