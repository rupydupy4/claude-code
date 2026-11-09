// Draws the Family Chores icon (an original design: a white house with a tick, on a teal
// gradient) and renders every icon and splash image the web app and the store apps need.
// Usage: npm run icons   (then `npx capacitor-assets generate --android --ios` turns the files
// in assets/ into the native icon sets and splash screens; `npm run assets` does both).
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const TEAL_LIGHT = '#14b8a6';
const TEAL = '#0f766e';
const TEAL_DARK = '#0b5c56';

/** The artwork on a 1024 × 1024 canvas. `scale` shrinks the house; `bg` adds the teal square. */
function svg({ scale = 0.84, bg = true, radius = 0 } = {}) {
  const art = `
    <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
      <polygon points="512,232 812,488 740,488 740,792 284,792 284,488 212,488" fill="#ffffff" stroke="#ffffff" stroke-width="48" stroke-linejoin="round"/>
      <path d="M388 626 L478 716 L648 546" fill="none" stroke="${TEAL}" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  const back = bg
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TEAL_LIGHT}"/><stop offset="0.55" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL_DARK}"/></linearGradient></defs>
       <rect width="1024" height="1024" rx="${radius}" fill="url(#g)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${back}${art}</svg>`;
}

const png = (s, size) => sharp(Buffer.from(s)).resize(size, size).png().toBuffer();
const out = (rel, data) => writeFile(new URL(rel, root), data);

async function splash(canvas) {
  const icon = await png(svg({ radius: 228 }), 640);
  return sharp({ create: { width: 2732, height: 2732, channels: 4, background: canvas } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toBuffer();
}

await mkdir(new URL('assets/', root), { recursive: true });
// Source images for @capacitor/assets (native icons and splash screens).
await out('assets/icon.svg', svg());
await out('assets/icon-only.png', await png(svg(), 1024));
await out('assets/icon-foreground.png', await png(svg({ bg: false, scale: 0.6 }), 1024));
await out('assets/icon-background.png', await png(svg({ scale: 0 }).replace(/<g[\s\S]*<\/g>/, ''), 1024));
await out('assets/splash.png', await splash('#f7f7f5'));
await out('assets/splash-dark.png', await splash('#111316'));
// The web app (GitHub Pages / home screen).
await out('public/icon.svg', svg({ radius: 228 }));
await out('public/icon-192.png', await png(svg({ radius: 228 }), 192));
await out('public/icon-512.png', await png(svg({ radius: 228 }), 512));
await out('public/icon-maskable-512.png', await png(svg({ scale: 0.62 }), 512));
await out('public/apple-touch-icon.png', await png(svg(), 180));
console.log('Icons and splash screens written to assets/ and public/.');
