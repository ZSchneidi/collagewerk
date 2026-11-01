import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, 'editor.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (c) => (c.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  preview: { port: 4319, strictPort: true },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
