import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

await new Promise((resolve, reject) => {
  const child = spawn('node', ['tests/e2e/esbuild.mjs'], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('e2e esbuild failed'))));
});

// Returns the path of the VS Code executable (cached in .vscode-test). Recent macOS builds
// name it `Code` while some @vscode/test-electron versions expect `Electron`.
// VSCODE_TEST_VERSION=1.85.2 checks the minimum version declared in package.json.
let vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION ?? 'stable');
if (!existsSync(vscodeExecutablePath)) {
  const fallback = path.join(path.dirname(vscodeExecutablePath), 'Code');
  if (existsSync(fallback)) {
    vscodeExecutablePath = fallback;
  }
}

// Terminals inside VS Code/Cursor export this, which would start VS Code as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

await runTests({
  vscodeExecutablePath,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'tests/e2e/out/suite.js'),
  // Startup editors (welcome page, release notes) can take focus from the first editor opened by the suite.
  launchArgs: ['--disable-extensions', '--no-sandbox', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', root],
});
