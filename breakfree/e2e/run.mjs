// Browser tests against the production build, served under a sub-path like GitHub Pages.
// Usage: npm run build && npm run test:e2e   (screenshots go to e2e/screenshots/)
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const shots = fileURLToPath(new URL('./screenshots/', import.meta.url));
const BASE = '/claude-code/breakfree/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(BASE)) { res.writeHead(404).end(); return; }
  let rel = normalize(url.pathname.slice(BASE.length)) || 'index.html';
  if (rel.endsWith('/') || rel === '.') rel = join(rel, 'index.html');
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const ORIGIN = `http://localhost:${server.address().port}`;
const APP = `${ORIGIN}${BASE}`;
await mkdir(shots, { recursive: true });

let failures = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    results.push(`  ✗ ${name}\n      ${String(e.message ?? e).split('\n').slice(0, 12).join('\n      ')}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();

async function session(label, contextOpts) {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) external.push(r.url()); });
  const noOverflow = async (where) => {
    // Mobile browsers widen the layout viewport (zooming out) when content is too wide,
    // so compare against the device width, not just innerWidth.
    const vw = page.viewportSize().width;
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert(sw <= vw + 1 && iw <= vw + 1, `${where}: content wider than the screen (${Math.max(sw, iw)}px > ${vw}px)`);
  };
  const go = async (hash) => { await page.goto(`${APP}#${hash}`); await page.waitForSelector('h1'); };
  const shot = (n) => page.screenshot({ path: `${shots}${label}-${n}.png`, fullPage: true });
  return { context, page, errors, external, noOverflow, go, shot };
}

// ------------------------------------------------------------------ mobile
{
  const s = await session('mobile', { ...devices['iPhone 13'] });
  const { page } = s;

  await check('mobile: onboarding flow and finish', async () => {
    await page.goto(APP);
    await page.getByRole('heading', { name: 'Take control of your habits.' }).waitFor();
    await s.shot('01-welcome');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Smoking and nicotine' }).click();
    await page.getByRole('button', { name: 'Digital and online habits' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Quit completely/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await s.shot('02-privacy');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox').fill('Alex');
    await page.getByRole('button', { name: 'Open my dashboard' }).click();
    await page.getByRole('heading', { name: 'Habit Library' }).waitFor();
    assert(await page.getByRole('button', { name: 'Suggested', exact: true }).getAttribute('aria-pressed') === 'true', 'suggested filter not active');
  });

  await check('mobile: add an abstinence habit from the library', async () => {
    await page.getByRole('button', { name: 'Add Smoking cigarettes' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Tracking method').selectOption('abstinence');
    await dlg.getByLabel(/A successful day means/).fill('No cigarettes all day');
    await s.shot('03-habit-form');
    await dlg.getByRole('button', { name: 'Add habit' }).click();
    await page.getByRole('heading', { level: 1, name: 'Smoking cigarettes' }).waitFor();
    await s.noOverflow('habit detail');
  });

  await check('mobile: check in and see the streak', async () => {
    await page.getByRole('button', { name: /Complete today’s check-in/ }).first().click();
    await page.getByRole('radio', { name: /Goal met/ }).click();
    await page.getByRole('button', { name: 'Save check-in' }).click();
    await page.getByText('1 day', { exact: true }).first().waitFor();
    await s.shot('04-habit-detail');
  });

  await check('mobile: add a time habit and log a session', async () => {
    await s.go('/library');
    await page.getByRole('searchbox').fill('gaming');
    await page.getByRole('button', { name: 'Add Excessive gaming' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/Daily limit/).fill('60');
    await dlg.getByRole('button', { name: 'Add habit' }).click();
    await page.getByRole('heading', { level: 1, name: 'Excessive gaming' }).waitFor();
    await page.getByRole('button', { name: /Log a session/ }).first().click();
    await page.getByLabel('Duration (minutes)').fill('45');
    await page.getByLabel(/What was going on/).selectOption('boredom');
    await page.getByRole('button', { name: 'Log it' }).click();
    await page.getByText('— 45 min').waitFor();
  });

  await check('mobile: dashboard shows real values and quick actions', async () => {
    await s.go('/');
    await page.getByRole('heading', { name: /Good .*, Alex/ }).waitFor();
    const cards = await page.locator('article.habit-card').count();
    assert(cards === 2, `expected 2 habit cards, got ${cards}`);
    await page.getByText('45', { exact: true }).first().waitFor();
    await s.noOverflow('dashboard');
    await s.shot('05-dashboard');
  });

  await check('mobile: bottom navigation and More menu reach every section', async () => {
    for (const [tab, h] of [['Habits', 'My Habits'], ['Toolkit', 'Pause. Reset. Choose.'], ['Missions', 'Daily Missions'], ['Home', /Good/]]) {
      await page.locator('.tabbar').getByRole('link', { name: tab }).click();
      await page.getByRole('heading', { level: 1, name: h }).waitFor();
      await s.noOverflow(String(tab));
    }
    for (const [item, h] of [['Habit Library', 'Habit Library'], ['Goals', 'Goals'], ['Journal', 'Journal'], ['Statistics', 'Statistics'], ['Settings', 'Settings'], ['Focus timer', 'Focus timer'], ['Privacy', 'Your data stays on your device']]) {
      await page.locator('.tabbar').getByRole('button', { name: 'More' }).click();
      await page.getByRole('dialog').getByRole('link', { name: item }).click();
      await page.getByRole('heading', { level: 1, name: h }).waitFor();
      await s.noOverflow(item);
    }
  });

  await check('mobile: missions — create from suggestion and complete', async () => {
    await s.go('/missions');
    await page.getByRole('button', { name: 'Plan tomorrow' }).click();
    await page.getByRole('checkbox', { name: 'Complete Plan tomorrow' }).check();
    await page.getByText('Today (1/1)').waitFor();
    await s.shot('06-missions');
  });

  await check('mobile: urge toolkit reset timer start/pause/resume/end', async () => {
    await s.go('/toolkit');
    await page.getByRole('button', { name: '1 min' }).first().click();
    await page.getByRole('button', { name: 'Start', exact: true }).first().click();
    await page.waitForTimeout(1300);
    const t1 = await page.locator('.clock').first().textContent();
    assert(t1 !== '1:00', `timer did not move (${t1})`);
    await page.getByRole('button', { name: 'Pause' }).first().click();
    const p1 = await page.locator('.clock').first().textContent();
    await page.waitForTimeout(1200);
    assert((await page.locator('.clock').first().textContent()) === p1, 'paused timer kept moving');
    await page.getByRole('button', { name: 'Resume' }).click();
    await s.shot('07-toolkit');
    // Reload mid-session: the timer resumes from saved timestamps.
    await page.reload();
    await page.getByRole('button', { name: 'Pause' }).first().waitFor();
    await page.getByRole('button', { name: 'End' }).click();
    await s.noOverflow('toolkit');
  });

  await check('mobile: no console errors and no external requests', async () => {
    assert(s.errors.length === 0, `console errors: ${s.errors.join(' | ')}`);
    assert(s.external.length === 0, `external requests: ${s.external.join(', ')}`);
  });
  await s.context.close();
}

// ------------------------------------------------------------------ desktop
{
  const s = await session('desktop', { viewport: { width: 1366, height: 900 } });
  const { page } = s;

  await check('desktop: skip onboarding; sidebar navigation has active states', async () => {
    await page.goto(APP);
    await page.getByRole('button', { name: 'Skip setup' }).first().click();
    const sidebar = page.locator('aside.sidebar');
    assert(await sidebar.isVisible(), 'sidebar not visible');
    await sidebar.getByRole('link', { name: 'Statistics' }).click();
    await page.getByRole('heading', { level: 1, name: 'Statistics' }).waitFor();
    assert((await sidebar.getByRole('link', { name: 'Statistics' }).getAttribute('class'))?.includes('active'), 'no active state');
  });

  await check('desktop: a reduction habit with events, then charts render from real data', async () => {
    await s.go('/library');
    await page.getByRole('searchbox').fill('caffeine consumption');
    await page.getByRole('button', { name: 'Add Excessive caffeine consumption' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/Daily limit/).fill('3');
    await dlg.getByRole('button', { name: 'Add habit' }).click();
    await page.getByRole('heading', { level: 1, name: 'Excessive caffeine consumption' }).waitFor();
    for (const n of ['2', '2']) {
      await page.getByRole('button', { name: /Record an amount/ }).first().click();
      await page.getByLabel(/Amount \(drinks\)/).fill(n);
      await page.getByRole('button', { name: 'Log it' }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
    await page.getByText(/Over today’s limit|Not met|not met/).first().waitFor();
    await s.shot('01-habit-detail');
    await s.go('/stats');
    await page.locator('.recharts-bar-rectangle').first().waitFor();
    await s.shot('02-statistics');
  });

  await check('desktop: focus timer controls', async () => {
    await s.go('/focus');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Start' }).waitFor();
    await s.shot('03-focus');
  });

  await check('desktop: journal entry and light theme persist after reload', async () => {
    await s.go('/journal');
    await page.getByRole('button', { name: 'New entry' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'What helped me redirect my attention?' }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'What helped me redirect my attention?' }).fill('Going for a short walk.');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await s.go('/settings');
    await page.getByRole('button', { name: 'Light' }).click();
    await page.reload();
    await page.waitForSelector('h1');
    assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'theme not persisted');
    await s.go('/journal');
    await page.getByText('Going for a short walk.').waitFor();
    await s.go('/');
    await s.shot('04-dashboard-light');
  });

  await check('desktop: works offline after the first load', async () => {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // now controlled by the service worker
    await page.waitForSelector('h1');
    await s.context.setOffline(true);
    await page.goto(`${APP}#/toolkit`);
    await page.getByRole('heading', { level: 1, name: 'Pause. Reset. Choose.' }).waitFor();
    await s.go('/stats');
    await page.locator('.recharts-bar-rectangle').first().waitFor();
    await s.go('/journal');
    await page.getByText('Going for a short walk.').waitFor();
    await s.context.setOffline(false);
  });

  await check('desktop: export contains real data; delete all data clears it', async () => {
    await s.go('/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).click()]);
    const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
    const backup = JSON.parse(text);
    assert(backup.app === 'BREAKFREE' && backup.data.habits.length === 1 && backup.data.events.length === 2 && backup.data.journal.length === 1, 'backup incomplete');
    await page.getByRole('button', { name: /Delete all data/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await page.getByRole('heading', { name: 'Take control of your habits.' }).waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('breakfree:data')));
    assert(stored.habits.length === 0 && stored.journal.length === 0, 'data not deleted');
  });

  await check('desktop: no console errors and no external requests', async () => {
    assert(s.errors.length === 0, `console errors: ${s.errors.join(' | ')}`);
    assert(s.external.length === 0, `external requests: ${s.external.join(', ')}`);
  });
  await s.context.close();
}

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(failures ? `\n${failures} browser check(s) failed` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
