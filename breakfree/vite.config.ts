/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Emits sw.js with the exact list of built files to precache, so the app works offline
 * from the first visit. The cache name changes whenever the asset list changes.
 */
function serviceWorker(): Plugin {
  return {
    name: 'breakfree-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync(new URL('./public', import.meta.url));
      const files = [...Object.keys(bundle), ...publicFiles].filter((f) => !f.endsWith('.map'));
      const assets = Array.from(new Set(['./', './index.html', ...files.map((f) => `./${f}`)]));
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__PRECACHE__', JSON.stringify(assets))
          .replace('__VERSION__', version),
      });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at any path (e.g. GitHub Pages /<repo>/breakfree/).
  base: './',
  plugins: [react(), serviceWorker()],
  build: { target: 'es2020', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
