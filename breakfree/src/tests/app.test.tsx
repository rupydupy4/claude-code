import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App';
import * as store from '../services/store';
import { buildBackup } from '../services/exportImport';
import { emptyData } from '../services/schema';
import { STORAGE_KEY } from '../services/storage';
import { todayKey } from '../utils/dates';
import { makeHabit } from './fixtures';

function onboardedData() {
  const d = emptyData();
  d.prefs.onboarded = true;
  return d;
}

function renderAt(path: string) {
  window.location.hash = `#${path}`;
  return render(<App />);
}

const dialog = () => screen.getAllByRole('dialog').at(-1)!;

beforeEach(() => {
  localStorage.clear();
  store.resetStoreForTests(onboardedData());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('onboarding', () => {
  it('walks through setup, survives a refresh mid-way and saves preferences', async () => {
    store.resetStoreForTests(emptyData());
    const user = userEvent.setup();
    const { unmount } = renderAt('/');
    expect(screen.getByRole('heading', { name: 'Take control of your habits.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.click(screen.getByRole('button', { name: 'Sleep' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // Refresh: progress is restored.
    unmount();
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'How do you like to track?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reduce frequency/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Your data stays with you' })).toBeInTheDocument();
    expect(screen.getByText(/not/, { selector: 'strong' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox'), 'Sam');
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }));
    const prefs = store.getState().prefs;
    expect(prefs).toMatchObject({ onboarded: true, interests: ['sleep'], preferredModes: ['frequency'], name: 'Sam' });
    expect(await screen.findByRole('heading', { name: 'Habit Library' })).toBeInTheDocument();
  });

  it('can be skipped', async () => {
    store.resetStoreForTests(emptyData());
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getAllByRole('button', { name: 'Skip setup' })[0]);
    expect(store.getState().prefs.onboarded).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Take control of your habits.' })).not.toBeInTheDocument();
  });
});

describe('habits', () => {
  it('adds a habit from the library with validation', async () => {
    const user = userEvent.setup();
    renderAt('/library');
    await user.type(await screen.findByRole('searchbox'), 'smoking cig');
    await user.click(screen.getByRole('button', { name: 'Add Smoking cigarettes' }));
    const form = dialog();
    await user.click(within(form).getByRole('button', { name: 'Add habit' }));
    expect(within(form).getByText(/Set a daily or weekly limit/)).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/Daily limit/), '5');
    await user.click(within(form).getByRole('button', { name: 'Add habit' }));
    expect(await screen.findByRole('heading', { name: 'Smoking cigarettes', level: 1 })).toBeInTheDocument();
    const h = store.getState().habits[0];
    expect(h).toMatchObject({ name: 'Smoking cigarettes', mode: 'frequency', goal: { daily: 5 }, templateId: 'substances-smoking-cigarettes' });
  });

  it('every library category is present and searchable', async () => {
    const user = userEvent.setup();
    renderAt('/library');
    for (const cat of ['Digital', 'Substances', 'Productivity', 'Sleep', 'Eating', 'Activity', 'Emotional', 'Social', 'Financial', 'Organisation', 'Communication', 'Custom']) {
      await user.click(await screen.findByRole('button', { name: cat }));
      expect(screen.getAllByRole('button', { name: /^Add / }).length).toBeGreaterThan(0);
    }
  });

  it('creates a custom abstinence habit, requiring a success rule, then changes its tracking mode', async () => {
    const user = userEvent.setup();
    renderAt('/habits?custom=1');
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByLabelText('Name'), 'Nail biting');
    await user.selectOptions(within(form).getByLabelText('Tracking method'), 'abstinence');
    await user.click(within(form).getByRole('button', { name: 'Add habit' }));
    expect(within(form).getByText(/Describe what a successful day means/)).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/A successful day means/), 'No biting all day');
    await user.click(within(form).getByRole('button', { name: 'Add habit' }));
    await waitFor(() => expect(store.getState().habits).toHaveLength(1));
    const id = store.getState().habits[0].id;
    expect(store.getState().habits[0]).toMatchObject({ mode: 'abstinence', successRule: 'No biting all day' });

    cleanup();
    renderAt(`/habits/${id}`);
    await user.click(await screen.findByRole('button', { name: /Edit settings/ }));
    const edit = dialog();
    await user.selectOptions(within(edit).getByLabelText('Tracking method'), 'time');
    await user.type(within(edit).getByLabelText(/Daily limit/), '10');
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(store.getState().habits[0]).toMatchObject({ mode: 'time', goal: { daily: 10 }, successRule: '' });
  });

  it('records, edits and deletes events, updating the detail page and dashboard', async () => {
    const user = userEvent.setup();
    const id = store.addHabit({ ...makeHabit('frequency', { daily: 3 }), name: 'Vaping' });
    renderAt(`/habits/${id}`);
    await user.click((await screen.findAllByRole('button', { name: /Record an event/ }))[0]);
    let form = dialog();
    await user.type(within(form).getByLabelText('How many times'), '2');
    await user.selectOptions(within(form).getByLabelText(/What was going on/), 'stress');
    await user.click(within(form).getByRole('button', { name: 'Log it' }));
    expect(await screen.findByText(/— 2 times/)).toBeInTheDocument();
    expect(store.getState().events[0]).toMatchObject({ amount: 2, trigger: 'stress', date: todayKey() });

    await user.click(screen.getByRole('button', { name: 'Edit entry' }));
    form = dialog();
    const amount = within(form).getByLabelText('How many times');
    await user.clear(amount);
    await user.type(amount, '4');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(store.getState().events[0].amount).toBe(4);
    expect(await screen.findByText(/— 4 times/)).toBeInTheDocument();

    cleanup();
    renderAt('/');
    expect(await screen.findByText(/limit 3/)).toBeInTheDocument();
    expect(screen.getByText('Over today’s limit — tomorrow is a fresh start.')).toBeInTheDocument();

    cleanup();
    renderAt(`/habits/${id}`);
    await user.click(await screen.findByRole('button', { name: 'Delete entry' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(store.getState().events).toHaveLength(0);
  });

  it('completes and corrects a daily check-in without duplicating it', async () => {
    const user = userEvent.setup();
    const id = store.addHabit({ ...makeHabit('abstinence'), name: 'Smoking' });
    renderAt(`/habits/${id}`);
    await user.click((await screen.findAllByRole('button', { name: /Complete today’s check-in/ }))[0]);
    await user.click(within(dialog()).getByRole('radio', { name: /Goal met/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save check-in' }));
    expect((await screen.findAllByText('1 day')).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: /Complete today’s check-in/ })[0]);
    await user.click(within(dialog()).getByRole('radio', { name: /Partly met/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Save check-in' }));
    expect(store.getState().checkIns).toHaveLength(1);
    expect(store.getState().checkIns[0].status).toBe('partial');
  });

  it('archives, restores and deletes a habit after confirmation', async () => {
    const user = userEvent.setup();
    const id = store.addHabit({ ...makeHabit('observation'), name: 'Daydreaming' });
    renderAt(`/habits/${id}`);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    expect(store.getState().habits[0].archived).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(store.getState().habits[0].archived).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().habits).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete permanently' }));
    expect(store.getState().habits).toHaveLength(0);
  });
});

describe('missions, focus, journal and goals', () => {
  it('creates and completes a mission', async () => {
    const user = userEvent.setup();
    renderAt('/missions?new=1');
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByLabelText('Title'), 'Read 10 pages');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Complete Read 10 pages' }));
    expect(store.getState().missionCompletions).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: 'Complete Read 10 pages' }));
    expect(store.getState().missionCompletions).toHaveLength(0);
  });

  it('runs a focus session to completion using the clock', async () => {
    renderAt('/focus');
    await screen.findByRole('button', { name: '15 min' });
    // Switch to a controllable clock once the page has loaded.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], now: Date.now() });
    fireEvent.click(screen.getByRole('button', { name: '15 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000 + 1_000); });
    const s = store.getState().focusSessions;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ status: 'completed', focusedMin: 15 });
    expect(screen.getAllByText('15 min').length).toBeGreaterThan(0);
  });

  it('writes, pins, searches and deletes a journal entry', async () => {
    const user = userEvent.setup();
    renderAt('/journal?new=1');
    const form = await screen.findByRole('dialog');
    await user.click(within(form).getByRole('button', { name: 'What went well today?' }));
    await user.type(within(form).getByLabelText('What went well today?'), 'Took a walk instead of scrolling.');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Took a walk instead of scrolling.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pin entry' }));
    expect(store.getState().journal[0].pinned).toBe(true);
    await user.type(screen.getByRole('searchbox'), 'nothing-matches');
    expect(screen.getByText('No matching entries')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(store.getState().journal).toHaveLength(0);
  });

  it('creates a numeric goal and updates its progress', async () => {
    const user = userEvent.setup();
    renderAt('/goals');
    await user.click(await screen.findByRole('button', { name: /New goal/ }));
    const form = dialog();
    await user.type(within(form).getByLabelText('Title'), 'Save for a bike');
    await user.type(within(form).getByLabelText('Target'), '200');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await user.type(await screen.findByLabelText('Amount for Save for a bike'), '50');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(store.getState().goals[0].progress).toBe(50);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});

describe('settings and data', () => {
  it('changes the theme and keeps it after a refresh', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    unmount();
    store.initStore();
    expect(store.getState().prefs.theme).toBe('light');
  });

  it('persists records across a page refresh', async () => {
    store.addHabit({ ...makeHabit('replacement', { daily: 1 }), name: 'Read instead' });
    store.initStore(); // simulate reload from localStorage
    renderAt('/habits');
    expect(await screen.findByRole('link', { name: 'Read instead' })).toBeInTheDocument();
  });

  it('imports a valid backup after confirmation and rejects an invalid one without changing data', async () => {
    const user = userEvent.setup();
    store.addHabit({ ...makeHabit('frequency', { daily: 2 }), name: 'Current habit' });
    renderAt('/settings');
    const input = (await screen.findByLabelText('Choose a backup file')) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['{bad'], 'bad.json', { type: 'application/json' })] } });
    expect(await screen.findByText(/That backup wasn’t imported/)).toBeInTheDocument();
    expect(store.getState().habits[0].name).toBe('Current habit');

    const backup = onboardedData();
    backup.habits = [{ ...makeHabit('time', { daily: 30 }), name: 'Imported habit' }];
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(buildBackup(backup))], 'b.json', { type: 'application/json' })] } });
    await user.click(await screen.findByRole('button', { name: 'Replace my data' }));
    expect(store.getState().habits.map((h) => h.name)).toEqual(['Imported habit']);
  });

  it('deletes all data only after confirmation', async () => {
    const user = userEvent.setup();
    store.addHabit(makeHabit('observation'));
    renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: /Delete all data/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().habits).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /Delete all data/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete everything' }));
    expect(store.getState().habits).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).habits).toEqual([]);
  });

  it('every navigation item opens a real screen', async () => {
    const pages: [string, string][] = [
      ['/', 'Good'], ['/habits', 'My Habits'], ['/library', 'Habit Library'], ['/toolkit', 'Pause. Reset. Choose.'],
      ['/missions', 'Daily Missions'], ['/goals', 'Goals'], ['/journal', 'Journal'], ['/stats', 'Statistics'],
      ['/settings', 'Settings'], ['/focus', 'Focus timer'], ['/privacy', 'Your data stays on your device'],
    ];
    for (const [path, heading] of pages) {
      renderAt(path);
      expect(await screen.findByRole('heading', { level: 1, name: new RegExp(heading.replace(/[.]/g, '\\.')) })).toBeInTheDocument();
      cleanup();
    }
  });
});
