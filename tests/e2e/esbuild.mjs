import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

await esbuild.build({
  entryPoints: [path.join(root, 'tests/e2e/suite/index.ts')],
  bundle: true,
  outfile: path.join(root, 'tests/e2e/out/suite.js'),
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
});

console.log('[mdotion] e2e suite built');
