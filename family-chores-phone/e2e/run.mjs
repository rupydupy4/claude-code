// Browser test of the built app, served under the same sub-path as GitHub Pages.
// Usage: npm run build && npm run test:e2e   (screenshots in e2e/screenshots/)
import { chromium, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const shots = fileURLToPath(new URL('./screenshots/', import.meta.url));
const BASE = '/claude-code/family-chores/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(BASE)) return res.writeHead(404).end();
  let rel = normalize(url.pathname.slice(BASE.length)) || 'index.html';
  if (rel.endsWith('/') || rel === '.') rel = join(rel, 'index.html');
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(await readFile(join(root, rel)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const APP = `http://localhost:${server.address().port}${BASE}`;
await mkdir(shots, { recursive: true });

let failures = 0;
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(`  ✓ ${name}`); } catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e.message ?? e).split('\n').slice(0, 8).join('\n      ')}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
// 32×32 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NMQEAAAjDMMC/56ECjiYK2tm7EwAAAAAAAAAAAAAAAPAA0R4AAUjCN+sAAAAASUVORK5CYII=', 'base64');

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text()) && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${shots}${n}.png`, fullPage: true });
const fits = async (where) => {
  const vw = page.viewportSize().width;
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(sw <= vw + 1, `${where}: wider than the screen (${sw} > ${vw})`);
};
const go = (hash) => page.goto(`${APP}#${hash}`);
const switchTo = async (name, pin) => {
  await page.getByRole('button', { name: /switch user/i }).first().click();
  await page.getByRole('button', { name: new RegExp(`^.?\\s*${name}`) }).click();
  if (pin) {
    await page.getByLabel('Parent PIN').fill(pin);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
};

await check('set up a household', async () => {
  await page.goto(APP);
  await page.getByRole('heading', { name: 'Set up your household' }).waitFor();
  await shot('01-welcome');
  await page.getByLabel('Household name').fill('The Test Family');
  await page.getByLabel('Your first name').fill('Morgan');
  await page.getByLabel('Parent PIN').fill('2468');
  await page.getByLabel('Confirm PIN').fill('2468');
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('heading', { name: /, Morgan$/ }).waitFor();
  await page.getByText('Your household is ready').waitFor();
  await fits('dashboard');
});

await check('add a child', async () => {
  await page.getByRole('link', { name: 'Add child' }).click();
  await page.getByLabel('First name').fill('Robin');
  await page.getByRole('radio', { name: 'violet' }).click();
  await page.getByRole('button', { name: 'Add child' }).click();
  await page.getByText('Robin has been added').waitFor();
  await fits('children');
});

await check('create and assign a chore', async () => {
  await go('/parent/chores/new');
  await page.getByLabel('Chore').fill('Water the plants');
  await page.getByLabel(/Instructions/).fill('Water every plant in the kitchen and living room.');
  assert((await page.getByRole('button', { name: 'Robin' }).getAttribute('aria-pressed')) === 'true', 'only child not preselected');
  await page.getByLabel('Amount (€)').fill('3');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.getByLabel(/Due date/).fill(today);
  await shot('02-create-chore');
  await page.getByRole('button', { name: 'Create chore' }).click();
  await page.getByText('Chore created and assigned.').waitFor();
});

await check('child picks their name, sees the chore, and can’t open the parent area', async () => {
  await switchTo('Robin');
  await page.getByRole('heading', { name: 'Hi Robin' }).waitFor();
  await page.getByText('You have 1 chore for today.').waitFor();
  await fits('child home');
  await shot('03-child-home');
  await go('/parent');
  await page.getByRole('heading', { name: 'Hi Robin' }).waitFor();
});

await check('child hands it in with a photo', async () => {
  await page.getByRole('link', { name: 'Open and mark as done' }).click();
  await page.getByText('Water every plant in the kitchen and living room.').waitFor();
  await page.getByLabel('Choose a photo').setInputFiles({ name: 'plants.png', mimeType: 'image/png', buffer: PNG });
  await page.getByAltText('Your photo').waitFor();
  await page.getByLabel(/Note/).fill('All watered');
  await shot('04-hand-in');
  await page.getByRole('button', { name: 'I’ve done it' }).click();
  await page.getByText('Handed in!').waitFor();
  await page.getByRole('heading', { name: /Waiting for approval/ }).waitFor();
});

await check('parent needs the PIN', async () => {
  await page.getByRole('button', { name: /switch user/i }).first().click();
  await page.getByRole('button', { name: /Morgan/ }).click();
  await page.getByLabel('Parent PIN').fill('0000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('That PIN isn’t right.').waitFor();
  await page.getByLabel('Parent PIN').fill('2468');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('1 chore is waiting for your approval.').waitFor();
});

await check('parent sees the photo and asks for changes', async () => {
  await page.getByRole('link', { name: /Review/ }).click();
  await page.getByRole('heading', { name: 'Robin says it’s done' }).waitFor();
  await page.getByText('“All watered”').waitFor();
  const img = page.getByAltText('Photo proof for Water the plants');
  await img.waitFor();
  assert((await img.evaluate((i) => i.naturalWidth)) > 0, 'photo did not load');
  await shot('05-review');
  await page.getByRole('button', { name: 'Needs changes' }).click();
  await page.getByLabel('What needs changing?').fill('Please water the hall plant too');
  await page.getByRole('button', { name: 'Send back' }).click();
  await page.getByText('Sent back with your note.').waitFor();
});

await check('child sees feedback and resubmits', async () => {
  await switchTo('Robin');
  await page.getByText('“Please water the hall plant too”').waitFor();
  await page.getByRole('link', { name: 'Fix and hand in again' }).click();
  await page.getByRole('button', { name: 'Hand it in again' }).click();
  await page.getByText('Handed in!').waitFor();
});

await check('parent approves and the reward is recorded', async () => {
  await switchTo('Morgan', '2468');
  await go('/parent/chores?tab=review');
  await page.getByRole('link', { name: /Water the plants/ }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByText('Approved. The reward has been recorded.').waitFor();
  await go('/parent/rewards');
  await page.getByRole('heading', { name: 'History' }).waitFor();
  await page.getByText('Water the plants').waitFor();
  await fits('rewards');
  await shot('06-parent-rewards');
});

await check('child sees it approved with the reward', async () => {
  await switchTo('Robin');
  await page.getByRole('heading', { name: 'Recently approved' }).waitFor();
  await go('/child/rewards');
  await page.getByRole('heading', { name: 'History' }).waitFor();
  await page.getByText('€3').first().waitFor();
  await page.getByText('Water the plants').waitFor();
  await shot('07-child-rewards');
});

await check('data is kept after closing and reopening, and works offline', async () => {
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Hi Robin' }).waitFor();
  await context.setOffline(false);
});

await check('every screen fits the phone', async () => {
  await switchTo('Morgan', '2468');
  for (const p of ['/parent', '/parent/chores', '/parent/children', '/parent/rewards', '/parent/settings']) { await go(p); await page.locator('main h1').first().waitFor(); await fits(p); }
  await switchTo('Robin');
  for (const p of ['/child', '/child/chores', '/child/rewards', '/child/settings']) { await go(p); await page.locator('main h1').first().waitFor(); await fits(p); }
});

await check('demo household', async () => {
  const demo = await browser.newContext({ ...devices['iPhone 13'] });
  await demo.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await demo.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(APP);
  await p.getByRole('button', { name: 'Try the demo' }).click();
  await p.getByRole('heading', { name: 'Who’s using Family Chores?' }).waitFor();
  await p.screenshot({ path: `${shots}08-who.png`, fullPage: true });
  await p.getByRole('button', { name: /Sarah/ }).click();
  await p.getByLabel('Parent PIN').fill('1234');
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('heading', { name: /, Sarah$/ }).waitFor();
  for (const t of ['Clean bedroom', 'Take out bins', 'Feed the dog']) await p.getByText(t).first().waitFor();
  await p.screenshot({ path: `${shots}09-demo-parent.png`, fullPage: true });
  await demo.close();
});

await check('no errors in the console', async () => assert(errors.length === 0, errors.join('\n')));

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(failures ? `\n${failures} failed` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
