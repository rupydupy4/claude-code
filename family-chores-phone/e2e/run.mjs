// Browser test of the built app at phone size, served under the same sub-path as GitHub Pages.
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
  try { await fn(); results.push(`  ✓ ${name}`); } catch (e) {
    failures++;
    results.push(`  ✗ ${name}\n      ${String(e.message ?? e).split('\n').slice(0, 8).join('\n      ')}`);
    await page.screenshot({ path: `${shots}failed-${failures}.png` }).catch(() => undefined);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
// 32×32 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NMQEAAAjDMMC/56ECjiYK2tm7EwAAAAAAAAAAAAAAAPAA0R4AAUjCN+sAAAAASUVORK5CYII=', 'base64');
const PHONE = devices['iPhone 13'];

// Playwright's own Chromium if it has been downloaded, otherwise Microsoft Edge or Google Chrome
// (already on most PCs), so nothing extra has to be installed.
async function launch() {
  for (const opts of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await chromium.launch(opts); } catch { /* try the next one */ }
  }
  throw new Error('No browser found. Run: npx playwright install chromium');
}
const browser = await launch();
const errors = [];
const contexts = [];
async function newPhone(opts = {}) {
  const ctx = await browser.newContext({ ...PHONE, ...opts });
  contexts.push(ctx);
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => errors.push(String(e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => m.type() === 'error' && !/ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
  return { ctx, p };
}
const { ctx: context, p: page } = await newPhone();
const shot = (n, p = page) => p.screenshot({ path: `${shots}${n}.png`, fullPage: true });
const fits = async (where, p = page) => {
  const vw = p.viewportSize().width;
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  assert(sw <= vw + 1, `${where}: wider than the screen (${sw} > ${vw})`);
};
/** Every visible button is at least 44 px tall and has a name a screen reader can read. */
const touchAndLabels = async (where, p = page) => {
  const bad = await p.evaluate(() => [...document.querySelectorAll('button, [role="radio"], nav a')]
    .filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')
    .map((b) => ({ name: (b.getAttribute('aria-label') || b.textContent || '').trim(), h: b.getBoundingClientRect().height }))
    .filter((b) => b.h < 43.5 || !b.name)
    .map((b) => `${b.name || '(no name)'} ${Math.round(b.h)}px`));
  assert(!bad.length, `${where}: small or unlabelled controls: ${bad.join(', ')}`);
};
const go = (hash, p = page) => p.goto(`${APP}#${hash}`);
const switchTo = async (name, pin, p = page) => {
  await p.getByRole('button', { name: /switch user/i }).first().click();
  await p.getByRole('button', { name: new RegExp(`^.?\\s*${name}`) }).click();
  if (pin) {
    await p.getByLabel('Parent PIN').fill(pin);
    await p.getByRole('button', { name: 'Continue' }).click();
  }
};

await check('set up a household (privacy policy reachable first)', async () => {
  await page.goto(APP);
  await page.getByRole('heading', { name: 'Set up your household' }).waitFor();
  await touchAndLabels('welcome');
  await shot('01-welcome');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await page.getByRole('heading', { name: 'Privacy policy' }).waitFor();
  await page.getByText('Family Chores collects no data.').waitFor();
  await fits('privacy');
  await page.getByRole('button', { name: 'Back' }).click();
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
  await touchAndLabels('children');
});

await check('create a daily chore with points and a due date', async () => {
  await go('/parent/chores/new');
  await page.getByLabel('Chore').fill('Water the plants');
  await page.getByLabel(/Instructions/).fill('Water every plant in the kitchen and living room.');
  assert((await page.getByRole('button', { name: 'Robin' }).getAttribute('aria-pressed')) === 'true', 'only child not preselected');
  await page.getByLabel('Amount (€)').fill('3');
  await page.getByLabel('Points').fill('20');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.getByLabel(/Due date/).fill(today);
  await page.getByRole('button', { name: 'Weekly' }).click();
  await page.getByRole('button', { name: 'Saturday' }).click();
  await page.getByText(/When you approve one, the next is created automatically/).waitFor();
  await page.getByRole('button', { name: 'Daily' }).click();
  await page.getByText('Every day. When you approve one').waitFor();
  await touchAndLabels('chore editor');
  await shot('02-create-chore');
  await page.getByRole('button', { name: 'Create chore' }).click();
  await page.getByText('Chore created and assigned.').waitFor();
  await page.getByRole('heading', { name: /^Today/ }).waitFor();
  await page.getByText('Every day').first().waitFor();
  await page.getByText('20 pts').first().waitFor();
});

await check('child picks their name, sees the chore and progress, and can’t open the parent area', async () => {
  await switchTo('Robin');
  await page.getByRole('heading', { name: 'Hi Robin' }).waitFor();
  await page.getByText('You have 1 chore for today.').waitFor();
  await page.getByRole('region', { name: 'Level 1' }).waitFor();
  await page.getByText('Get a chore approved to start your streak!').waitFor();
  await fits('child home');
  await touchAndLabels('child home');
  await shot('03-child-home');
  await go('/parent');
  await page.getByRole('heading', { name: 'Hi Robin' }).waitFor();
});

await check('child hands it in with a photo', async () => {
  await page.getByRole('link', { name: 'Open and mark as done' }).click();
  await page.getByText('Water every plant in the kitchen and living room.').waitFor();
  await page.getByRole('button', { name: 'Take a photo', exact: true }).waitFor();
  await touchAndLabels('hand in');
  await page.getByLabel('Choose a photo', { exact: true }).setInputFiles({ name: 'plants.png', mimeType: 'image/png', buffer: PNG });
  await page.getByAltText('Your photo').waitFor();
  await page.getByLabel(/Note/).fill('All watered');
  await shot('04-hand-in');
  await page.getByRole('button', { name: 'I’ve done it' }).click();
  await page.getByText('Handed in!').waitFor();
  await page.getByRole('heading', { name: /Waiting for approval/ }).waitFor();
});

await check('parent needs the PIN and sees waiting chores first', async () => {
  await page.getByRole('button', { name: /switch user/i }).first().click();
  await page.getByRole('button', { name: /Morgan/ }).click();
  await page.getByLabel('Parent PIN').fill('0000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('That PIN isn’t right.').waitFor();
  await page.getByLabel('Parent PIN').fill('2468');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('1 chore is waiting for your approval.').waitFor();
  const headings = await page.locator('main h2').allTextContents();
  assert(headings[0].startsWith('Needs approval'), `first section is "${headings[0]}"`);
  assert(headings.indexOf('This week') > 0 && headings.indexOf('Rewards to hand over') > headings.indexOf('This week'), `sections: ${headings.join(' | ')}`);
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

await check('parent approves: reward recorded and the next one created automatically', async () => {
  await switchTo('Morgan', '2468');
  await go('/parent/chores?tab=review');
  await page.getByRole('link', { name: /Water the plants/ }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByText(/Approved\. The reward has been recorded and the next one is due/).waitFor();
  await go('/parent/chores?tab=active');
  await page.getByRole('link', { name: /Water the plants/ }).waitFor();
  await page.getByText(/Due tomorrow/).first().waitFor();
});

await check('weekly summary and marking a reward as paid out', async () => {
  await go('/parent');
  const week = page.getByRole('region', { name: 'Robin this week' });
  await week.getByText('1 approved').waitFor();
  await week.getByText('+20 points').waitFor();
  await week.getByText('1-day streak').waitFor();
  const owed = page.getByRole('region', { name: 'Robin’s rewards' });
  await owed.getByText('€3').waitFor();
  await shot('06-parent-summary');
  await touchAndLabels('dashboard');
  await owed.getByRole('button', { name: 'Mark €3 as paid out to Robin' }).click();
  await owed.getByRole('button', { name: 'Yes, paid out' }).click();
  await owed.getByText('Marked €3 as paid out to Robin.').waitFor();
  await owed.getByText('Nothing owed right now.').waitFor();
  await owed.getByText('Paid out so far: €3').waitFor();
  await go('/parent/rewards');
  await page.getByRole('heading', { name: 'History' }).waitFor();
  await page.getByText('Water the plants').first().waitFor();
  await page.getByText('Paid out', { exact: true }).waitFor();
  await fits('rewards');
});

await check('child sees points, streak and the reward', async () => {
  await switchTo('Robin');
  const progress = page.getByRole('region', { name: 'Level 1' });
  await progress.getByText('Robin, you’re 30 points away from level 2.').waitFor();
  await progress.getByText('Nice work today. Keep it up!').waitFor();
  await page.getByRole('heading', { name: 'Recently approved' }).waitFor();
  await page.getByRole('heading', { name: 'Water the plants', level: 3 }).waitFor(); // tomorrow's one
  await go('/child/rewards');
  await page.getByRole('heading', { name: 'History' }).waitFor();
  await page.getByText('€3').first().waitFor();
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

await check('every screen fits the phone, with big enough labelled buttons', async () => {
  await switchTo('Morgan', '2468');
  for (const p of ['/privacy', '/terms', '/parent', '/parent/chores', '/parent/children', '/parent/rewards', '/parent/settings']) { await go(p); await page.locator('main h1').first().waitFor(); await fits(p); await touchAndLabels(p); }
  await switchTo('Robin');
  for (const p of ['/child', '/child/chores', '/child/rewards', '/child/settings']) { await go(p); await page.locator('main h1').first().waitFor(); await fits(p); await touchAndLabels(p); }
});

let backupPath = '';
await check('parent saves a backup file', async () => {
  await switchTo('Morgan', '2468');
  await go('/parent/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup' }).click()]);
  assert(/^family-chores-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
  backupPath = `${shots}backup.json`;
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert(backup.app === 'family-chores' && backup.data.chores.length === 2, 'backup content');
  assert(Object.values(backup.photos).length === 1, 'photo missing from backup');
  await page.getByText('Backup saved to your downloads.').waitFor();
  await shot('08-settings');
});

await check('restore the backup on a new phone, then delete all data', async () => {
  const { p } = await newPhone();
  await p.goto(APP);
  await p.getByLabel('Choose a backup file').setInputFiles(backupPath);
  await p.getByText('Restored The Test Family.').waitFor();
  await p.getByRole('heading', { name: 'Who’s using Family Chores?' }).waitFor();
  await p.getByRole('button', { name: /Robin/ }).waitFor();
  await p.getByRole('button', { name: /Morgan/ }).click();
  await p.getByLabel('Parent PIN').fill('2468');
  await p.getByRole('button', { name: 'Continue' }).click();
  await go('/parent/chores?tab=approved', p);
  await p.getByRole('link', { name: /Water the plants/ }).click();
  const img = p.getByAltText('Photo proof for Water the plants');
  await img.waitFor();
  assert((await img.evaluate((i) => i.naturalWidth)) > 0, 'restored photo did not load');
  await go('/parent/settings', p);
  await p.getByRole('button', { name: 'Delete all data' }).click();
  await p.getByRole('button', { name: 'Delete everything' }).click();
  await p.getByRole('heading', { name: 'Set up your household' }).waitFor();
  assert(JSON.parse(await p.evaluate(() => localStorage.getItem('family-chores:data'))).household === null, 'data left behind');
});

await check('a household saved by the first version still opens', async () => {
  const { p } = await newPhone();
  await p.goto(APP);
  await p.evaluate(async () => {
    const salt = 'old-salt';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:1357`));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const t = new Date().toISOString();
    localStorage.setItem('family-chores:data', JSON.stringify({
      version: 1,
      household: { name: 'The Old Family', parentPinHash: hash, pinSalt: salt, createdAt: t },
      members: [{ id: 'p1', role: 'parent', name: 'Pat', avatarColor: 'slate', createdAt: t }, { id: 'k1', role: 'child', name: 'Kim', avatarColor: 'rose', createdAt: t }],
      chores: [{ id: 'c1', title: 'Tidy the toys', description: '', assignedTo: 'k1', rewardType: 'money', rewardAmount: 150, rewardNote: null, dueDate: null, status: 'assigned', hasPhoto: false, childNote: null, feedback: null, createdAt: t, submittedAt: null, approvedAt: null }],
    }));
  });
  await p.reload();
  await p.getByRole('heading', { name: 'Who’s using Family Chores?' }).waitFor();
  await p.getByText('The Old Family').waitFor();
  await p.getByRole('button', { name: /Kim/ }).click();
  await p.getByRole('heading', { name: 'Tidy the toys' }).waitFor();
  await p.getByText('10 pts').waitFor();
  await switchTo('Pat', '1357', p);
  await p.getByRole('heading', { name: /, Pat$/ }).waitFor();
  assert(JSON.parse(await p.evaluate(() => localStorage.getItem('family-chores:data'))).version === 2, 'not upgraded');
});

await check('demo household: overdue highlighting and Today / This week / Later groups', async () => {
  const { p } = await newPhone();
  await p.goto(APP);
  await p.getByRole('button', { name: 'Try the demo' }).click();
  await p.getByRole('heading', { name: 'Who’s using Family Chores?' }).waitFor();
  await p.screenshot({ path: `${shots}09-who.png`, fullPage: true });
  await p.getByRole('button', { name: /Sarah/ }).click();
  await p.getByLabel('Parent PIN').fill('1234');
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('heading', { name: /, Sarah$/ }).waitFor();
  for (const t of ['Clean bedroom', 'Take out bins', 'Feed the dog']) await p.getByText(t).first().waitFor();
  await p.getByText('1 overdue').first().waitFor();
  await p.screenshot({ path: `${shots}10-demo-parent.png`, fullPage: true });
  await go('/parent/chores?tab=active', p);
  const h = await p.locator('main h2').allTextContents();
  assert(h.some((x) => x.startsWith('Today')) && h.some((x) => x.startsWith('Later')), `groups: ${h.join(' | ')}`);
  const overdueRow = p.locator('li', { hasText: 'Water the tomatoes' });
  assert(/Overdue/.test(await overdueRow.innerText()), 'overdue chore not labelled');
  assert((await overdueRow.evaluate((li) => getComputedStyle(li).borderLeftWidth)) === '4px', 'overdue chore not highlighted');
});

await check('dark theme follows the phone setting', async () => {
  const { p } = await newPhone({ colorScheme: 'dark' });
  await p.goto(APP);
  await p.getByRole('button', { name: 'Try the demo' }).click();
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(bg === 'rgb(17, 19, 22)', `background is ${bg}`);
  await p.getByRole('button', { name: /Alex/ }).click();
  await p.getByRole('heading', { name: 'Hi Alex' }).waitFor();
  await fits('dark child home', p);
  await p.screenshot({ path: `${shots}11-dark-child.png`, fullPage: true });
  await switchTo('Sarah', '1234', p);
  await p.getByRole('heading', { name: /, Sarah$/ }).waitFor();
  await p.screenshot({ path: `${shots}12-dark-parent.png`, fullPage: true });
});

await check('no errors in the console', async () => assert(errors.length === 0, errors.join('\n')));

for (const c of contexts) await c.close();
await browser.close();
server.close();
console.log(results.join('\n'));
console.log(failures ? `\n${failures} failed` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
