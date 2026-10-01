/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Standalone build only: emits sw.js with the exact files to precache for offline use. */
function serviceWorker(): Plugin {
  return {
    name: 'jarvis-service-worker',
    apply: 'build',
    generateBundle(_o, bundle) {
      const publicFiles = readdirSync(new URL('./public', import.meta.url));
      const files = [...Object.keys(bundle), ...publicFiles].filter((f) => !f.endsWith('.map'));
      const assets = Array.from(new Set(['./', './index.html', ...files.map((f) => `./${f}`)]));
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
      const tpl = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl.replace('__PRECACHE__', JSON.stringify(assets)).replace('__VERSION__', version) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const claude = mode === 'claude';
  return {
    base: './',
    plugins: [react(), ...(claude ? [] : [serviceWorker()])],
    build: {
      target: 'es2022',
      outDir: claude ? 'dist-claude' : 'dist',
      // The claude.ai build is inlined into one file, so it can't have lazy chunks.
      rollupOptions: claude ? { output: { inlineDynamicImports: true } } : undefined,
      chunkSizeWarningLimit: 4000,
    },
    worker: { format: 'es' },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
