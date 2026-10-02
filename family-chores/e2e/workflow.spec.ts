import { test, expect, type Page, type Browser, devices } from '@playwright/test';

/**
 * The complete chore workflow, as a real parent and child in two separate browsers:
 * sign up → add child → create & assign chore → child signs in → hands in with a photo →
 * parent asks for changes → child resubmits → parent approves → reward appears for both.
 */

const run = Date.now().toString(36);
const parentEmail = `parent-${run}@test.invalid`;
const childName = `Robin${run.slice(-4)}`;
const pin = '135790';
// 32×32 teal PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NMQEAAAjDMMC/56ECjiYK2tm7EwAAAAAAAAAAAAAAAPAA0R4AAUjCN+sAAAAASUVORK5CYII=', 'base64');

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  expect(sw, 'page is wider than the screen').toBeLessThanOrEqual(vw + 1);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  return context.newPage();
}

test('full workflow: parent and child', async ({ browser }) => {
  const parent = await newPage(browser);
  const child = await newPage(browser);
  const parentErrors = watchErrors(parent);
  const childErrors = watchErrors(child);

  // 1. Parent creates a household
  await parent.goto('/signup');
  await parent.getByLabel('Your first name').fill('Morgan');
  await parent.getByLabel('Household name').fill('The Test Family');
  await parent.getByLabel('Email').fill(parentEmail);
  await parent.getByLabel('Password').fill('a-good-password');
  await parent.getByRole('button', { name: 'Create household' }).click();
  await expect(parent.getByRole('heading', { name: /, Morgan$/ })).toBeVisible();
  await expect(parent.getByText('Start by adding your children')).toBeVisible();
  await noHorizontalScroll(parent);
  await parent.screenshot({ path: 'e2e/screenshots/01-parent-empty.png', fullPage: true });

  // 2. Parent adds a child
  await parent.getByRole('link', { name: 'Add child' }).click();
  await parent.getByLabel('First name').fill(childName);
  await parent.getByRole('radio', { name: 'violet' }).click();
  await parent.getByLabel('PIN').fill(pin);
  await parent.getByRole('button', { name: 'Add child' }).click();
  await expect(parent.getByText(`${childName} has been added`)).toBeVisible();
  const code = (await parent.getByLabel(/^Household code/).textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await noHorizontalScroll(parent);

  // 3–4. Parent creates a chore and assigns it
  await parent.goto('/parent/chores/new');
  await parent.getByLabel('Chore').fill('Water the plants');
  await parent.getByLabel(/Instructions/).fill('Water every plant in the kitchen and living room.');
  await expect(parent.getByRole('button', { name: childName })).toHaveAttribute('aria-pressed', 'true');
  await parent.getByLabel('Amount (€)').fill('3');
  const today = await parent.evaluate(() => new Intl.DateTimeFormat('en-CA').format(new Date()));
  await parent.getByLabel(/Due date/).fill(today);
  await noHorizontalScroll(parent);
  await parent.screenshot({ path: 'e2e/screenshots/02-create-chore.png', fullPage: true });
  await parent.getByRole('button', { name: 'Create chore' }).click();
  await expect(parent.getByText('Chore created and assigned.')).toBeVisible();
  await expect(parent.getByRole('link', { name: /Water the plants/ })).toBeVisible();

  // 5. Child signs in
  await child.goto('/login');
  await child.getByRole('link', { name: 'I’m a child' }).click();
  await child.getByLabel('Household code').fill(code.toLowerCase());
  await child.getByLabel('Your first name').fill(childName.toLowerCase());
  await child.getByLabel('PIN').fill('000000');
  await child.getByRole('button', { name: 'Sign in' }).click();
  await expect(child.getByText(/household code, name or PIN isn’t right/)).toBeVisible();
  await child.getByLabel('PIN').fill(pin);
  await child.getByRole('button', { name: 'Sign in' }).click();

  // 6. Child sees the chore
  await expect(child.getByRole('heading', { name: `Hi ${childName}` })).toBeVisible();
  await expect(child.getByText('You have 1 chore for today.')).toBeVisible();
  await noHorizontalScroll(child);
  await child.screenshot({ path: 'e2e/screenshots/03-child-home.png', fullPage: true });

  // A child can't open the parent area
  await child.goto('/parent');
  await expect(child).toHaveURL(/\/child$/);

  // 7–8. Child completes it with a photo
  await child.getByRole('link', { name: 'Open and mark as done' }).click();
  await expect(child.getByText('Water every plant in the kitchen and living room.')).toBeVisible();
  await child.getByLabel('Choose a photo').setInputFiles({ name: 'plants.png', mimeType: 'image/png', buffer: PNG });
  await expect(child.getByAltText('Your photo')).toBeVisible();
  await child.getByLabel(/Note/).fill('All watered');
  await noHorizontalScroll(child);
  await child.screenshot({ path: 'e2e/screenshots/04-child-hand-in.png', fullPage: true });
  await child.getByRole('button', { name: 'I’ve done it' }).click();
  await expect(child.getByText('Handed in: Water the plants')).toBeVisible();
  await expect(child.getByRole('heading', { name: /Waiting for approval/ })).toBeVisible();

  // 9. Parent sees the submission, with the private photo
  await parent.goto('/parent');
  await expect(parent.getByText('1 chore is waiting for your approval.')).toBeVisible();
  await parent.getByRole('link', { name: /Review submissions/ }).click();
  await expect(parent.getByRole('heading', { name: `${childName} says it’s done` })).toBeVisible();
  await expect(parent.getByText('“All watered”')).toBeVisible();
  const photo = parent.getByAltText('Photo proof for Water the plants');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await photo.getAttribute('src')).toContain('token=');
  await parent.screenshot({ path: 'e2e/screenshots/05-parent-review.png', fullPage: true });

  // 10a. Parent asks for changes
  await parent.getByRole('button', { name: 'Needs changes' }).click();
  await parent.getByLabel('What needs changing?').fill('Please water the hall plant too');
  await parent.getByRole('button', { name: 'Send back' }).click();
  await expect(parent.getByText('Sent back with your note.')).toBeVisible();

  // 11a. Child sees the feedback and resubmits
  await child.goto('/child');
  await expect(child.getByText('“Please water the hall plant too”')).toBeVisible();
  await child.getByRole('link', { name: 'Fix and hand in again' }).click();
  await child.getByRole('button', { name: 'Hand it in again' }).click();
  await expect(child.getByText('Handed in: Water the plants')).toBeVisible();

  // 10b. Parent approves
  await parent.goto('/parent/chores?tab=review');
  await parent.getByRole('link', { name: /Water the plants/ }).click();
  await parent.getByRole('button', { name: 'Approve' }).click();
  await expect(parent.getByText('Approved. The reward has been recorded.')).toBeVisible();
  await parent.goto('/parent/rewards');
  await expect(parent.getByText('€3').first()).toBeVisible();
  await noHorizontalScroll(parent);
  await parent.screenshot({ path: 'e2e/screenshots/06-parent-rewards.png', fullPage: true });

  // 11b–12. Child sees it approved and the reward in their history
  await child.goto('/child');
  await expect(child.getByRole('heading', { name: 'Recently approved' })).toBeVisible();
  await child.getByRole('link', { name: 'Rewards' }).click();
  await expect(child.getByRole('heading', { name: 'Rewards', level: 1 })).toBeVisible();
  await expect(child.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(child.getByText('€3').first()).toBeVisible();
  await expect(child.getByText('Water the plants')).toBeVisible();
  await noHorizontalScroll(child);
  await child.screenshot({ path: 'e2e/screenshots/07-child-rewards.png', fullPage: true });

  expect(parentErrors, parentErrors.join('\n')).toEqual([]);
  expect(childErrors, childErrors.join('\n')).toEqual([]);
});

test('demo household works for parent and child', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.getByText('Demo data has been reset.')).toBeVisible();
  await page.getByRole('button', { name: 'Sarah' }).click();
  await expect(page.getByRole('heading', { name: /, Sarah$/ })).toBeVisible();
  for (const t of ['Clean bedroom', 'Take out bins', 'Feed the dog']) await expect(page.getByText(t).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'e2e/screenshots/08-demo-parent.png', fullPage: true });
  for (const path of ['/parent/chores', '/parent/children', '/parent/rewards', '/parent/settings']) {
    await page.goto(path);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `e2e/screenshots/09-demo${path.replace(/\//g, '-')}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Jamie' }).click();
  await expect(page.getByRole('heading', { name: 'Hi Jamie' })).toBeVisible();
  await expect(page.getByText('Take out bins')).toBeVisible();
  await expect(page.getByText('30 min screen time').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/10-demo-child.png', fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});
