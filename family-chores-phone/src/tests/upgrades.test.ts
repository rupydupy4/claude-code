import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as S from '../lib/store';
import { getPhoto } from '../lib/photos';
import type { Chore } from '../lib/types';

// Photos in memory: the test IndexedDB doesn't keep Blobs the way browsers do (the browser test
// covers the real thing).
vi.mock('../lib/photos', async (original) => {
  const photos = new Map<string, Blob>();
  return {
    ...(await original<typeof import('../lib/photos')>()),
    putPhoto: async (id: string, b: Blob) => { photos.set(id, b); },
    getPhoto: async (id: string) => photos.get(id),
    deletePhoto: async (id: string) => { photos.delete(id); },
    clearPhotos: async () => { photos.clear(); },
  };
});

const bytesOf = (b: Blob) => new Promise<number[]>((resolve) => {
  const r = new FileReader();
  r.onload = () => resolve([...new Uint8Array(r.result as ArrayBuffer)]);
  r.readAsArrayBuffer(b);
});

// Only the clock is faked (IndexedDB still needs real timers). 2026-11-11 is a Wednesday.
const WED = '2026-11-11';
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);
const setToday = (day: string, hour = 12) => vi.setSystemTime(at(day, hour));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setToday(WED);
});
afterEach(() => vi.useRealTimers());

async function family() {
  S._reset();
  localStorage.clear();
  sessionStorage.clear();
  await S.createHousehold('The Test Family', 'Morgan', '2468');
  const alex = S.addChild('Alex', 'teal');
  const jamie = S.addChild('Jamie', 'violet');
  return { alex, jamie, parentId: S.currentUser()!.id };
}

const input = (assignedTo: string, extra: Partial<S.ChoreInput> = {}): S.ChoreInput => ({
  title: 'Feed the cat', description: '', assignedTo, rewardType: 'money', rewardAmount: 100, rewardNote: null, dueDate: WED, ...extra,
});

/** Hand in as the child, then approve as the parent. Returns the next chore, if one was made. */
async function handInAndApprove(id: string, childId: string, parentId: string) {
  await S.signInAs(childId);
  await S.submitChore(id, {});
  await S.signInAs(parentId, '2468');
  return S.reviewChore(id, true);
}

/** A bare chore for the pure calculations. */
let n = 0;
const make = (extra: Partial<Chore>): Chore => ({
  id: `c${++n}`, title: 'X', description: '', assignedTo: 'kid', rewardType: 'money', rewardAmount: 100, rewardNote: null, dueDate: null,
  status: 'assigned', hasPhoto: false, childNote: null, feedback: null, createdAt: at(WED).toISOString(), submittedAt: null, approvedAt: null,
  repeat: 'none', repeatDays: [], points: 10, seriesId: null, paidAt: null, ...extra,
});
const approvedOn = (day: string, extra: Partial<Chore> = {}) => make({ status: 'approved', submittedAt: at(day, 9).toISOString(), approvedAt: at(day, 20).toISOString(), ...extra });

// ---------------------------------------------------------------- migration

describe('saved data from the first version keeps working', () => {
  const v1 = {
    version: 1,
    household: { name: 'Old Family', parentPinHash: 'abc', pinSalt: 'salt', createdAt: '2026-01-01T00:00:00.000Z' },
    members: [
      { id: 'p', role: 'parent', name: 'Pat', avatarColor: 'slate', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'k', role: 'child', name: 'Kim', avatarColor: 'not-a-colour', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    chores: [
      { id: 'a', title: 'Dishes', description: 'All of them', assignedTo: 'k', rewardType: 'money', rewardAmount: 250, rewardNote: null, dueDate: '2026-11-01', status: 'approved', hasPhoto: false, childNote: null, feedback: null, createdAt: '2026-10-30T10:00:00.000Z', submittedAt: '2026-11-01T10:00:00.000Z', approvedAt: '2026-11-01T18:00:00.000Z' },
      { id: 'b', title: 'Orphan', assignedTo: 'gone', status: 'assigned' },
      { id: 'c', title: 'Bins', assignedTo: 'k', rewardType: 'custom', rewardNote: 'Film night', status: 'weird-status', dueDate: 'not a date' },
    ],
  };

  it('fills in the new fields with safe defaults and drops what can’t be used', () => {
    const d = S.migrate(v1)!;
    expect(d.version).toBe(2);
    expect(d.prefs).toEqual({ haptics: true });
    expect(d.members[1].avatarColor).toBe('teal');
    expect(d.chores.map((c) => c.id)).toEqual(['a', 'c']);
    expect(d.chores[0]).toMatchObject({ repeat: 'none', repeatDays: [], points: 10, seriesId: null, paidAt: null, rewardAmount: 250 });
    expect(d.chores[1]).toMatchObject({ status: 'assigned', dueDate: null, rewardAmount: null, rewardNote: 'Film night' });
  });

  it('upgrades the saved copy on start-up and keeps the original text as a backup', () => {
    localStorage.clear();
    localStorage.setItem('family-chores:data', JSON.stringify(v1));
    S._reset('reload');
    expect(S.getState().data.household?.name).toBe('Old Family');
    expect(JSON.parse(localStorage.getItem('family-chores:data')!).version).toBe(2);
    expect(JSON.parse(localStorage.getItem(S.BACKUP_KEY)!).version).toBe(1);
  });

  it('never overwrites data it can’t read or that came from a newer app', () => {
    localStorage.clear();
    const future = JSON.stringify({ ...v1, version: 99 });
    localStorage.setItem('family-chores:data', future);
    S._reset('reload');
    expect(S.getState().data.household).toBeNull();
    expect(localStorage.getItem(S.BACKUP_KEY)).toBe(future);
    expect(S.migrate('nonsense')).toBeNull();
    expect(S.migrate({ version: 2, members: 'x', chores: [] })).toBeNull();
  });

  it('turns a repeating chore without days or a due date into a one-off', () => {
    const d = S.migrate({ ...v1, chores: [
      { ...v1.chores[0], id: 'w', status: 'assigned', repeat: 'weekly', repeatDays: [9, 0] },
      { ...v1.chores[0], id: 'd', status: 'assigned', repeat: 'daily', dueDate: null },
      { ...v1.chores[0], id: 'ok', status: 'assigned', repeat: 'weekly', repeatDays: [5, 1, 5] },
    ] })!;
    expect(d.chores.map((c) => [c.repeat, c.repeatDays])).toEqual([['none', []], ['none', []], ['weekly', [1, 5]]]);
  });
});

// ---------------------------------------------------------------- repeating chores

describe('repeating chores', () => {
  it('works out the next due date', () => {
    expect(S.nextDueDate(WED, 'daily')).toBe('2026-11-12');
    expect(S.nextDueDate(WED, 'weekly', [3])).toBe('2026-11-18'); // next Wednesday
    expect(S.nextDueDate(WED, 'weekly', [1, 5])).toBe('2026-11-13'); // Friday
    expect(S.nextDueDate('2026-11-15', 'weekly', [1, 5])).toBe('2026-11-16'); // Sunday → Monday
    expect(S.nextDueDate(WED, 'none')).toBeNull();
  });

  it('never schedules the next one in the past, even when approved late', () => {
    expect(S.nextAfterApproval({ dueDate: '2026-11-02', repeat: 'daily', repeatDays: [] }, WED)).toBe('2026-11-12');
    expect(S.nextAfterApproval({ dueDate: '2026-11-20', repeat: 'daily', repeatDays: [] }, WED)).toBe('2026-11-21');
  });

  it('creates the next one when a parent approves, and only then', async () => {
    const { alex, parentId } = await family();
    const c = S.createChore(input(alex.id, { repeat: 'weekly', repeatDays: [3, 6], points: 15 }));
    await S.signInAs(alex.id);
    await S.submitChore(c.id, {});
    await S.signInAs(parentId, '2468');
    S.reviewChore(c.id, false, 'Fill the water bowl too');
    expect(S.getState().data.chores).toHaveLength(1); // sending back makes nothing new

    await S.signInAs(alex.id);
    await S.submitChore(c.id, {});
    await S.signInAs(parentId, '2468');
    const next = S.reviewChore(c.id, true)!;
    expect(next).toMatchObject({ title: 'Feed the cat', status: 'assigned', dueDate: '2026-11-14', points: 15, seriesId: c.id, repeat: 'weekly', repeatDays: [3, 6], paidAt: null, feedback: null });
    expect(next.id).not.toBe(c.id);
    expect(S.getState().data.chores).toHaveLength(2);
    expect(() => S.reviewChore(c.id, true)).toThrow('isn’t waiting'); // no duplicate successors

    const third = (await handInAndApprove(next.id, alex.id, parentId))!;
    expect(third.seriesId).toBe(c.id); // the whole series shares the first id
  });

  it('gives a repeating chore without a date today’s date, and checks the days', async () => {
    const { alex } = await family();
    expect(S.createChore(input(alex.id, { dueDate: null, repeat: 'daily' })).dueDate).toBe(WED);
    expect(S.createChore(input(alex.id, { dueDate: null })).dueDate).toBeNull();
    expect(() => S.createChore(input(alex.id, { repeat: 'weekly', repeatDays: [] }))).toThrow('at least one day');
    expect(() => S.createChore(input(alex.id, { points: 1001 }))).toThrow('Points');
    expect(() => S.createChore(input(alex.id, { points: 2.5 }))).toThrow('Points');
    expect(S.createChore(input(alex.id, { repeat: 'none', repeatDays: [1] })).repeatDays).toEqual([]);
  });
});

// ---------------------------------------------------------------- due dates

describe('due dates', () => {
  it('groups chores into Today (including overdue), This week and Later', () => {
    const chores = [
      make({ id: 'over', dueDate: '2026-11-09' }),
      make({ id: 'today', dueDate: WED }),
      make({ id: 'sun', dueDate: '2026-11-15' }),
      make({ id: 'nextmon', dueDate: '2026-11-16' }),
      make({ id: 'none', dueDate: null }),
    ];
    const g = S.groupByDue(chores, WED);
    expect(g.today.map((c) => c.id)).toEqual(['over', 'today']);
    expect(g.week.map((c) => c.id)).toEqual(['sun']);
    expect(g.later.map((c) => c.id)).toEqual(['nextmon', 'none']);
  });

  it('only open chores can be overdue', () => {
    expect(S.isOverdue(make({ dueDate: '2026-11-10' }), WED)).toBe(true);
    expect(S.isOverdue(make({ dueDate: '2026-11-10', status: 'needs_changes' }), WED)).toBe(true);
    expect(S.isOverdue(make({ dueDate: '2026-11-10', status: 'submitted' }), WED)).toBe(false);
    expect(S.isOverdue(make({ dueDate: WED }), WED)).toBe(false);
    expect(S.isOverdue(make({ dueDate: null }), WED)).toBe(false);
  });
});

// ---------------------------------------------------------------- points and streaks

describe('points, levels and streaks', () => {
  it('counts points from approved chores only, with levels every 50', () => {
    const p = S.computeProgress([approvedOn('2026-11-02', { points: 30 }), approvedOn('2026-11-10', { points: 25 }), make({ points: 100 })], WED);
    expect(p).toMatchObject({ points: 55, pointsThisWeek: 25, level: 2, levelPoints: 5 });
  });

  it('counts days in a row, ending today or yesterday', () => {
    const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
    let p = S.computeProgress(days.map((d) => approvedOn(d)), WED);
    expect(p).toMatchObject({ streak: 4, bestStreak: 4, doneToday: false }); // still alive until tonight
    p = S.computeProgress([...days, WED, WED].map((d) => approvedOn(d)), WED);
    expect(p).toMatchObject({ streak: 5, doneToday: true }); // two on one day still count as one day
    p = S.computeProgress(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-09'].map((d) => approvedOn(d)), WED);
    expect(p).toMatchObject({ streak: 0, bestStreak: 3 }); // broken yesterday
  });

  it('credits the day it was handed in, so a late approval doesn’t break a streak', () => {
    const c = approvedOn('2026-11-10', { approvedAt: at(WED, 8).toISOString() });
    expect(S.creditDay(c)).toBe('2026-11-10');
  });
});

// ---------------------------------------------------------------- parent summary

describe('the parent’s weekly summary and rewards', () => {
  it('reports completion for the week', () => {
    const w = S.weekCompletion([
      approvedOn('2026-11-10', { dueDate: '2026-11-10' }),
      make({ dueDate: '2026-11-12' }),
      make({ dueDate: '2026-11-17' }), // next week
      approvedOn('2026-11-01', { dueDate: '2026-11-01' }), // last week
      approvedOn('2026-11-09', { dueDate: null }),
    ], WED);
    expect(w).toEqual({ due: 2, done: 1, approvedThisWeek: 2 });
  });

  it('splits rewards into owed and paid out', () => {
    const b = S.rewardBalance([
      approvedOn(WED, { rewardAmount: 200 }),
      approvedOn(WED, { rewardAmount: 300, paidAt: at(WED).toISOString() }),
      approvedOn(WED, { rewardType: 'screen_time', rewardAmount: 30 }),
      approvedOn(WED, { rewardType: 'custom', rewardAmount: null, rewardNote: 'Film' }),
      make({ rewardAmount: 999 }), // not approved: not owed
    ]);
    expect(b.owed.moneyCents).toBe(200);
    expect(b.owed.screenMinutes).toBe(30);
    expect(b.owed.custom.map((c) => c.rewardNote)).toEqual(['Film']);
    expect(b.paid).toEqual({ moneyCents: 300, screenMinutes: 0, customCount: 0 });
  });

  it('lets only a parent mark rewards as paid out, per child and type', async () => {
    const { alex, jamie, parentId } = await family();
    const a1 = S.createChore(input(alex.id, { rewardAmount: 200 }));
    const a2 = S.createChore(input(alex.id, { rewardAmount: 300 }));
    const film = S.createChore(input(alex.id, { rewardType: 'custom', rewardAmount: null, rewardNote: 'Film' }));
    const j = S.createChore(input(jamie.id, { rewardAmount: 500 }));
    for (const c of [a1, a2, film]) await handInAndApprove(c.id, alex.id, parentId);
    await handInAndApprove(j.id, jamie.id, parentId);

    await S.signInAs(alex.id);
    expect(() => S.markPaidOut(alex.id, 'money')).toThrow('Only a parent');
    await S.signInAs(parentId, '2468');
    expect(S.markPaidOut(alex.id, 'money')).toBe(2);
    expect(() => S.markPaidOut(alex.id, 'money')).toThrow('Nothing to pay out');
    expect(() => S.markPaidOut(parentId, 'money')).toThrow('Child not found');

    const chores = S.getState().data.chores;
    expect(S.rewardBalance(chores.filter((c) => c.assignedTo === alex.id)).owed).toMatchObject({ moneyCents: 0 });
    expect(S.rewardBalance(chores.filter((c) => c.assignedTo === jamie.id)).owed.moneyCents).toBe(500); // Jamie untouched
    expect(S.markPaidOut(alex.id, 'custom', film.id)).toBe(1);
  });
});

// ---------------------------------------------------------------- backup, restore and delete

describe('backup, restore and delete all data', () => {
  it('exports everything with photos and restores it on a fresh device', async () => {
    const { alex, parentId } = await family();
    const c = S.createChore(input(alex.id));
    await S.signInAs(alex.id);
    await S.submitChore(c.id, { photo: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }) });
    await expect(S.exportBackup()).rejects.toThrow('Only a parent');
    await S.signInAs(parentId, '2468');
    const text = await S.exportBackup();
    expect(JSON.parse(text)).toMatchObject({ app: 'family-chores', format: 1 });
    expect(S.backupFileName(at(WED))).toBe('family-chores-backup-2026-11-11.json');

    await S.deleteEverything();
    expect(S.getState().data.household).toBeNull();
    expect(await getPhoto(c.id)).toBeUndefined();

    expect(await S.importBackup(text)).toBe('The Test Family');
    expect(S.currentUser()).toBeNull(); // everyone picks their name again
    const restored = S.getState().data.chores.find((x) => x.id === c.id)!;
    expect(restored).toMatchObject({ status: 'submitted', hasPhoto: true });
    const photo = (await getPhoto(c.id))!;
    expect(photo.type).toBe('image/jpeg');
    expect(await bytesOf(photo)).toEqual([1, 2, 3, 250]);
    await S.signInAs(parentId, '2468'); // same PIN as before
  });

  it('refuses files that aren’t backups, and children can’t replace the household', async () => {
    const { alex } = await family();
    await expect(S.importBackup('{"hello":1}')).rejects.toThrow('isn’t a Family Chores backup');
    await expect(S.importBackup('not json')).rejects.toThrow('isn’t a Family Chores backup');
    await expect(S.importBackup('{"app":"family-chores","format":2}')).rejects.toThrow('newer version');
    await expect(S.importBackup('{"app":"family-chores","format":1,"data":{"version":2,"household":null,"members":[],"chores":[]}}')).rejects.toThrow('damaged or empty');
    expect(S.getState().data.household?.name).toBe('The Test Family'); // nothing changed
    await S.signInAs(alex.id);
    await expect(S.importBackup('{}')).rejects.toThrow('Only a parent');
  });

  it('deletes all data, photos and saved copies, and only for a parent', async () => {
    const { alex, parentId } = await family();
    localStorage.setItem(S.BACKUP_KEY, 'old');
    await S.signInAs(alex.id);
    await expect(S.deleteEverything()).rejects.toThrow('Only a parent');
    await S.signInAs(parentId, '2468');
    await S.deleteEverything();
    expect(S.getState().data).toMatchObject({ household: null, members: [], chores: [] });
    expect(localStorage.getItem(S.BACKUP_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem('family-chores:data')!).household).toBeNull();
    expect(localStorage.getItem('family-chores:child')).toBeNull();
  });

  it('keeps the haptics setting for the parent only', async () => {
    const { alex, parentId } = await family();
    S.setHaptics(false);
    expect(S.getState().data.prefs.haptics).toBe(false);
    await S.signInAs(alex.id);
    expect(() => S.setHaptics(true)).toThrow('Only a parent');
    await S.signInAs(parentId, '2468');
  });
});
