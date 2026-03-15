// @ts-check
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Extension host bundle (Node.js)
  const extCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode', 'node-pty'],
    logLevel: 'info',
  });

  // Webview bundle (browser, includes xterm.js)
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'info',
  });

  if (watch) {
    console.log('Watching for changes...');
    await Promise.all([extCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extCtx.dispose(), webviewCtx.dispose()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
