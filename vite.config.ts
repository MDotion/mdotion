import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'webview'),
  build: {
    outDir: path.resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    // One stylesheet next to the bundle, linked by WebviewFactory (no runtime <style> injection).
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    // IIFE bundle: VS Code webviews reject ES module graphs + strict CSP more often.
    rollupOptions: {
      input: path.resolve(__dirname, 'webview/src/main.tsx'),
      output: {
        format: 'iife',
        name: 'MdotionWebview',
        entryFileNames: 'assets/index.js',
        inlineDynamicImports: true,
        assetFileNames: (asset) =>
          asset.names?.some((name) => name.endsWith('.css')) ? 'assets/index.css' : 'assets/[name][extname]',
      },
    },
  },
});
