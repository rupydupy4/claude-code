import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, MAX_IMPORT_BYTES } from '../services/exportImport';
import { emptyData, migrate, SCHEMA_VERSION, validateData } from '../services/schema';
import { loadData, RECOVERY_KEY, saveData, STORAGE_KEY } from '../services/storage';
import * as store from '../services/store';
import { dueReminders } from '../services/reminders';
import { checkIn, dataWith, event, makeHabit } from './fixtures';
import type { AppData } from '../models/types';

beforeEach(() => {
  localStorage.clear();
  store.resetStoreForTests();
});

function fullData(): AppData {
  const h = makeHabit('frequency', { daily: 3 });
  const at = new Date().toISOString();
  return dataWith({
    habits: [h],
    checkIns: [checkIn(h.id, '2026-05-01', 'met')],
    events: [event(h.id, '2026-05-01', 2, { trigger: 'stress', intensity: 3 })],
    journal: [{ id: 'j1', date: '2026-05-01', title: 'T', body: 'Body', tag: 'reflection', pinned: true, createdAt: at, updatedAt: at }],
    missions: [{ id: 'm1', title: 'Read', category: 'learning', recurrence: { type: 'weekdays', days: [1, 2] }, reminder: false, archived: false, createdAt: at, updatedAt: at }],
    missionCompletions: [{ id: 'mc1', missionId: 'm1', date: '2026-05-01', completedAt: at }],
    routines: [{ id: 'r1', name: 'Morning', slot: 'morning', steps: [{ id: 's1', missionId: 'm1' }], paused: false, archived: false, createdAt: at, updatedAt: at }],
    focusSessions: [{ id: 'f1', startedAt: at, endedAt: at, plannedMin: 25, focusedMin: 25, status: 'completed', category: '', note: '' }],
    resetSessions: [{ id: 'rs1', startedAt: at, durationSec: 120, completed: true, helped: 'yes' }],
    goals: [{ id: 'g1', title: 'Save', description: '', category: 'savings', kind: 'numeric', target: 100, progress: 10, unit: '£', startDate: '2026-05-01', milestones: [], status: 'active', notes: '', createdAt: at, updatedAt: at }],
    achievements: [{ id: 'first-habit', earnedAt: at }],
    blockedSites: [{ id: 'b1', domain: 'example.com', reason: '', createdAt: at }],
    distractionLogs: [{ id: 'd1', date: '2026-05-01', time: '10:00', site: 'x', note: '', createdAt: at }],
  });
}

describe('export and import', () => {
  it('round-trips every collection without loss', () => {
    const data = fullData();
    data.prefs = { ...data.prefs, name: 'Sam', theme: 'light', onboarded: true };
    const text = JSON.stringify(buildBackup(data));
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(data);
    for (const key of ['habits', 'checkIns', 'events', 'journal', 'missions', 'missionCompletions', 'routines', 'focusSessions', 'resetSessions', 'goals', 'achievements', 'blockedSites', 'distractionLogs']) {
      expect(result.counts[key]).toBe(1);
    }
  });

  it('rejects invalid files with useful messages', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, errors: ['This file is not valid JSON.'] });
    expect(parseBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'BREAKFREE', data: {} })).ok).toBe(false); // no schema version
    const bad = buildBackup(fullData());
    (bad.data.habits[0] as unknown as Record<string, unknown>).mode = 'teleport';
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/unsupported tracking mode/);
  });

  it('rejects bad dates, negative amounts, duplicate ids and orphaned records', () => {
    const mk = (mut: (d: AppData) => void) => {
      const b = buildBackup(fullData());
      mut(b.data);
      return parseBackup(JSON.stringify(b));
    };
    expect(mk((d) => { d.events[0].date = '2026-02-30'; }).ok).toBe(false);
    expect(mk((d) => { d.events[0].amount = -4; }).ok).toBe(false);
    expect(mk((d) => { d.journal.push({ ...d.journal[0] }); }).ok).toBe(false);
    expect(mk((d) => { d.events[0].habitId = 'missing'; }).ok).toBe(false);
  });

  it('rejects files that are too large and backups from a newer version', () => {
    expect(parseBackup('{}', MAX_IMPORT_BYTES + 1).ok).toBe(false);
    const b = { ...buildBackup(fullData()), schemaVersion: SCHEMA_VERSION + 1 };
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/newer version/);
  });
});

describe('migrations and storage', () => {
  it('migrates unversioned and v1 data to the current schema', () => {
    const v0 = { habits: [{ id: 'h', name: 'Old', category: 'digital', mode: 'time', goal: { daily: 30 }, startDate: '2025-01-01' }] };
    const migrated = migrate(v0);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const { data, errors } = validateData(migrated, 'strict');
    expect(errors).toEqual([]);
    expect(data.habits[0].successRule).toBe('');
    expect(data.habits[0].milestones.length).toBeGreaterThan(0);
    expect(data.prefs.focusDefaults.workMin).toBe(25);
  });

  it('starts fresh on first run', () => {
    expect(loadData().status.kind).toBe('new');
  });

  it('keeps a recovery copy instead of destroying unreadable data', () => {
    localStorage.setItem(STORAGE_KEY, '{broken json');
    const r = loadData();
    expect(r.status.kind).toBe('corrupt');
    expect(JSON.parse(localStorage.getItem(RECOVERY_KEY)!).raw).toBe('{broken json');
  });

  it('repairs individual invalid records, counts them and keeps the original', () => {
    const d = fullData();
    (d.events as unknown[]).push({ id: 'bad', habitId: d.habits[0].id, date: 'nope', time: '10:00', amount: 1 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    const r = loadData();
    expect(r.status).toEqual({ kind: 'repaired', dropped: 1 });
    expect(r.data.events).toHaveLength(1);
    expect(localStorage.getItem(RECOVERY_KEY)).not.toBeNull();
  });

  it('refuses to overwrite data saved by a newer version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(), schemaVersion: SCHEMA_VERSION + 5 }));
    const r = loadData();
    expect(r.writable).toBe(false);
  });

  it('persists and reloads', () => {
    const d = fullData();
    saveData(d);
    expect(loadData().data).toEqual(d);
  });
});

describe('store actions', () => {
  it('prevents duplicate check-ins for the same habit and day', () => {
    const id = store.addHabit({ ...makeHabit('abstinence'), startDate: '2026-05-01' });
    store.setCheckIn(id, '2026-05-01', 'met');
    store.setCheckIn(id, '2026-05-01', 'notMet', 'corrected');
    const cis = store.getState().checkIns.filter((c) => c.habitId === id);
    expect(cis).toHaveLength(1);
    expect(cis[0].status).toBe('notMet');
    store.deleteCheckIn(id, '2026-05-01');
    expect(store.getState().checkIns).toHaveLength(0);
  });

  it('never stores two completions of the same mission on the same day', () => {
    const id = store.saveMission({ title: 'Read', category: 'learning', recurrence: { type: 'daily' }, reminder: false });
    store.toggleMission(id, '2026-05-01', true);
    store.toggleMission(id, '2026-05-01', true);
    expect(store.getState().missionCompletions).toHaveLength(1);
    store.toggleMission(id, '2026-05-01');
    expect(store.getState().missionCompletions).toHaveLength(0);
  });

  it('deleting a habit removes its records and unlinks references', () => {
    const a = store.addHabit(makeHabit('frequency', { daily: 2 }));
    const b = store.addHabit({ ...makeHabit('replacement', { daily: 1 }), linkedHabitId: a });
    store.addEvent({ habitId: a, date: '2026-05-01', time: '10:00', amount: 1, context: '', note: '' });
    store.setCheckIn(a, '2026-05-01', 'met');
    store.saveJournal({ date: '2026-05-01', title: '', body: 'x', tag: 'reflection', pinned: false, habitId: a });
    store.deleteHabit(a);
    const s = store.getState();
    expect(s.events).toHaveLength(0);
    expect(s.checkIns).toHaveLength(0);
    expect(s.habits.find((h) => h.id === b)?.linkedHabitId).toBeUndefined();
    expect(s.journal[0].habitId).toBeUndefined();
  });

  it('awards each achievement only once', () => {
    store.addHabit(makeHabit('observation'));
    store.addHabit(makeHabit('observation'));
    store.addHabit(makeHabit('observation'));
    expect(store.getState().achievements.filter((a) => a.id === 'first-habit')).toHaveLength(1);
  });

  it('rejects invalid goal progress', () => {
    const id = store.saveGoal({ title: 'G', description: '', category: 'other', kind: 'numeric', target: 10, progress: 2, unit: '', startDate: '2026-05-01', milestones: [], status: 'active', notes: '' });
    store.setGoalProgress(id, -5);
    store.setGoalProgress(id, Number.NaN);
    expect(store.getState().goals[0].progress).toBe(2);
  });
});

describe('reminders', () => {
  it('are off by default, respect quiet hours and never repeat on the same day', () => {
    const h = makeHabit('abstinence', {}, { reminder: { enabled: true, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6] } });
    const d = dataWith({ habits: [h] });
    const at = new Date(2026, 4, 10, 20, 1);
    expect(dueReminders(d, at, new Set())).toEqual([]);
    d.prefs = { ...d.prefs, reminders: { ...d.prefs.reminders, enabled: true } };
    const due = dueReminders(d, at, new Set());
    expect(due).toHaveLength(1);
    expect(dueReminders(d, at, new Set([due[0].key]))).toEqual([]);
    d.prefs.reminders.quietStart = '19:00';
    d.prefs.reminders.quietEnd = '07:00';
    expect(dueReminders(d, at, new Set())).toEqual([]);
  });

  it('skips a check-in reminder once the user has checked in', () => {
    const h = makeHabit('abstinence', {}, { reminder: { enabled: true, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6] } });
    const d = dataWith({ habits: [h], checkIns: [checkIn(h.id, '2026-05-10', 'met')] });
    d.prefs = { ...d.prefs, reminders: { ...d.prefs.reminders, enabled: true } };
    expect(dueReminders(d, new Date(2026, 4, 10, 20, 0), new Set())).toEqual([]);
  });
});
