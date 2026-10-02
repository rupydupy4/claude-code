/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Emits sw.js with the exact files to precache, so the app works offline from the home screen. */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
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

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  build: { target: 'es2022' },
  test: { environment: 'jsdom', include: ['src/tests/**/*.test.ts'] },
});
