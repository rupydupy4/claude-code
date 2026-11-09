import { useSyncExternalStore } from 'react';
import type { AvatarColor, Chore, Data, Household, Member, Prefs, Repeat, RewardType } from './types';
import { AVATAR_COLORS } from './types';
import { addDays, byDue, isDay, isoWeekday, toDay, today, weekRange } from './format';
import { clearPhotos, deletePhoto, getPhoto, putPhoto } from './photos';

export { isOpen, isOverdue } from './format';

/**
 * Everything is stored on this device. All the rules live here, in one place:
 * only the signed-in parent (unlocked with the parent PIN) can create, edit, review, pay out,
 * back up, restore or delete; a child can only hand in their own chores.
 */

const DATA_KEY = 'family-chores:data';
const CHILD_KEY = 'family-chores:child';
const PARENT_KEY = 'family-chores:parent-unlocked';
/** Before a migration (or if saved data can't be read) the original text is kept here, never thrown away. */
export const BACKUP_KEY = 'family-chores:data-before-upgrade';

export class StoreError extends Error {}

export interface Session {
  userId: string | null;
}

interface State {
  data: Data;
  session: Session;
  saveError: string;
}

const DEFAULT_PREFS: Prefs = { haptics: true };
const empty = (): Data => ({ version: 2, household: null, members: [], chores: [], prefs: { ...DEFAULT_PREFS } });

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const checkColor = (c: string): AvatarColor => ((AVATAR_COLORS as readonly string[]).includes(c) ? (c as AvatarColor) : 'teal');

// ---------------------------------------------------------------- migration

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const strOrNull = (v: unknown, max = 2000) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const isoOrNull = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback);

/** Sorted, unique, 1–7 only. */
export const cleanDays = (days: unknown) =>
  Array.isArray(days) ? [...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b) : [];

function migrateChore(raw: unknown, memberIds: Set<string>): Chore | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !memberIds.has(raw.assignedTo as string)) return null;
  const status = (['assigned', 'submitted', 'approved', 'needs_changes'] as const).find((s) => s === raw.status) ?? 'assigned';
  const rewardType: RewardType = raw.rewardType === 'screen_time' || raw.rewardType === 'custom' ? raw.rewardType : 'money';
  const dueDate = isDay(raw.dueDate) ? raw.dueDate : null;
  let repeat: Repeat = raw.repeat === 'daily' || raw.repeat === 'weekly' ? raw.repeat : 'none';
  let repeatDays = repeat === 'weekly' ? cleanDays(raw.repeatDays) : [];
  if ((repeat === 'weekly' && !repeatDays.length) || (repeat !== 'none' && !dueDate)) { repeat = 'none'; repeatDays = []; }
  return {
    id: raw.id,
    title: str(raw.title, 80) || 'Chore',
    description: str(raw.description, 1000),
    assignedTo: raw.assignedTo as string,
    rewardType,
    rewardAmount: rewardType === 'custom' ? null : intIn(raw.rewardAmount, 0, 100000, 0),
    rewardNote: rewardType === 'custom' ? strOrNull(raw.rewardNote, 80) ?? 'Reward' : null,
    dueDate,
    status,
    hasPhoto: raw.hasPhoto === true,
    childNote: strOrNull(raw.childNote, 300),
    feedback: strOrNull(raw.feedback, 300),
    createdAt: isoOrNull(raw.createdAt) ?? new Date(0).toISOString(),
    submittedAt: isoOrNull(raw.submittedAt),
    approvedAt: isoOrNull(raw.approvedAt),
    // New in version 2. Households saved by version 1 get the defaults: one-off chores worth 10 points, not paid out yet.
    repeat,
    repeatDays,
    points: intIn(raw.points, 0, 1000, 10),
    seriesId: strOrNull(raw.seriesId, 100),
    paidAt: status === 'approved' ? isoOrNull(raw.paidAt) : null,
  };
}

/**
 * Turns anything that was saved (version 1 or 2) into valid version 2 data.
 * Returns null if it isn't Family Chores data at all, or is from a newer version of the app
 * (so it is never overwritten by an older app).
 */
export function migrate(raw: unknown): Data | null {
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.members) || !Array.isArray(raw.chores)) return null;
  const hh = raw.household;
  const household: Household | null = isObj(hh) && typeof hh.parentPinHash === 'string' && typeof hh.pinSalt === 'string'
    ? { name: str(hh.name, 60) || 'Our household', parentPinHash: hh.parentPinHash, pinSalt: hh.pinSalt, createdAt: isoOrNull(hh.createdAt) ?? new Date().toISOString(), ...(hh.demo === true ? { demo: true } : {}) }
    : null;
  const members: Member[] = [];
  for (const m of raw.members) {
    if (!isObj(m) || typeof m.id !== 'string' || (m.role !== 'parent' && m.role !== 'child') || members.some((x) => x.id === m.id)) continue;
    members.push({ id: m.id, role: m.role, name: str(m.name, 40) || '?', avatarColor: checkColor(String(m.avatarColor)), createdAt: isoOrNull(m.createdAt) ?? new Date(0).toISOString() });
  }
  if (household && !members.some((m) => m.role === 'parent')) return null;
  const ids = new Set(members.filter((m) => m.role === 'child').map((m) => m.id));
  const seen = new Set<string>();
  const chores = raw.chores.map((c) => migrateChore(c, ids)).filter((c): c is Chore => !!c && !seen.has(c.id) && !!seen.add(c.id));
  const prefs = isObj(raw.prefs) ? raw.prefs : {};
  return { version: 2, household, members: household ? members : [], chores: household ? chores : [], prefs: { haptics: prefs.haptics !== false } };
}

function load(): State {
  const raw = safe(() => localStorage.getItem(DATA_KEY), null);
  let data = empty();
  if (raw) {
    const parsed = safe(() => JSON.parse(raw) as unknown, undefined);
    const migrated = migrate(parsed);
    if (migrated) {
      data = migrated;
      if (isObj(parsed) && parsed.version !== 2) {
        // Keep the old copy, then save the upgraded data.
        safe(() => { localStorage.setItem(BACKUP_KEY, raw); localStorage.setItem(DATA_KEY, JSON.stringify(data)); }, undefined);
      }
    } else {
      // Unreadable or from a newer app: keep it untouched under another key rather than lose it.
      safe(() => { if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw); }, undefined);
    }
  }
  // A child stays signed in on the device; the parent must enter the PIN again in a new session.
  const child = safe(() => localStorage.getItem(CHILD_KEY), null);
  const parent = safe(() => sessionStorage.getItem(PARENT_KEY), null);
  const userId = [parent, child].find((id) => id && data.members.some((m) => m.id === id)) ?? null;
  return { data, session: { userId }, saveError: '' };
}

let state: State = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function commit(data: Data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    state = { ...state, data, saveError: '' };
  } catch {
    state = { ...state, data, saveError: 'This device’s storage is full or blocked, so changes may not be kept.' };
  }
  emit();
}

function setSession(userId: string | null, role?: 'parent' | 'child') {
  safe(() => {
    sessionStorage.removeItem(PARENT_KEY);
    localStorage.removeItem(CHILD_KEY);
    if (userId && role === 'parent') sessionStorage.setItem(PARENT_KEY, userId);
    if (userId && role === 'child') localStorage.setItem(CHILD_KEY, userId);
  }, undefined);
  state = { ...state, session: { userId } };
  emit();
}

export const getState = () => state;
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => select(state), () => select(state));
}
export const currentUser = (s: State = state) => s.data.members.find((m) => m.id === s.session.userId) ?? null;

/** Test helper: start from `data` (migrated like saved data), or reload from localStorage with `'reload'`. */
export function _reset(data: Data | 'reload' = empty(), userId: string | null = null) {
  state = data === 'reload' ? load() : { data, session: { userId }, saveError: '' };
  emit();
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

function requireParent() {
  const u = currentUser();
  if (!u || u.role !== 'parent') throw new StoreError('Only a parent can do that.');
  return u;
}
function requireChild() {
  const u = currentUser();
  if (!u || u.role !== 'child') throw new StoreError('Please choose who you are first.');
  return u;
}

// ---------------------------------------------------------------- PIN

async function hashPin(pin: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const validPin = (pin: string) => /^\d{4,6}$/.test(pin);

async function makePin(pin: string): Promise<Pick<Household, 'parentPinHash' | 'pinSalt'>> {
  if (!validPin(pin)) throw new StoreError('Choose a PIN of 4 to 6 digits.');
  const pinSalt = uid();
  return { pinSalt, parentPinHash: await hashPin(pin, pinSalt) };
}

// ---------------------------------------------------------------- household & sign-in

export async function createHousehold(name: string, parentName: string, pin: string) {
  if (state.data.household) throw new StoreError('A household is already set up on this device.');
  name = clean(name);
  parentName = clean(parentName);
  if (!name || name.length > 60) throw new StoreError('Enter a household name.');
  if (!parentName || parentName.length > 40) throw new StoreError('Enter your first name.');
  const parent: Member = { id: uid(), role: 'parent', name: parentName, avatarColor: 'slate', createdAt: now() };
  commit({ ...empty(), prefs: state.data.prefs, household: { name, createdAt: now(), ...(await makePin(pin)) }, members: [parent] });
  setSession(parent.id, 'parent');
}

/** Children tap their name; the parent also enters the PIN. */
export async function signInAs(memberId: string, pin?: string) {
  const m = state.data.members.find((x) => x.id === memberId);
  const hh = state.data.household;
  if (!m || !hh) throw new StoreError('Choose who you are.');
  if (m.role === 'parent') {
    if (!pin || (await hashPin(pin, hh.pinSalt)) !== hh.parentPinHash) throw new StoreError('That PIN isn’t right.');
  }
  setSession(m.id, m.role);
}

export const signOut = () => setSession(null);

export async function changePin(current: string, next: string) {
  requireParent();
  const hh = state.data.household!;
  if ((await hashPin(current, hh.pinSalt)) !== hh.parentPinHash) throw new StoreError('Your current PIN isn’t right.');
  commit({ ...state.data, household: { ...hh, ...(await makePin(next)) } });
}

export function updateHousehold(name: string, parentName: string) {
  const me = requireParent();
  name = clean(name);
  parentName = clean(parentName);
  if (!name || name.length > 60) throw new StoreError('Enter a household name.');
  if (!parentName || parentName.length > 40) throw new StoreError('Enter your name.');
  commit({ ...state.data, household: { ...state.data.household!, name }, members: state.data.members.map((m) => (m.id === me.id ? { ...m, name: parentName } : m)) });
}

export function setHaptics(on: boolean) {
  requireParent();
  commit({ ...state.data, prefs: { ...state.data.prefs, haptics: on } });
}

/** Deletes the household, children, chores, rewards, photos and saved backups from this device. */
export async function deleteEverything() {
  requireParent();
  await clearPhotos().catch(() => undefined);
  safe(() => localStorage.removeItem(BACKUP_KEY), undefined);
  setSession(null);
  commit(empty());
}

// ---------------------------------------------------------------- children

function checkChildName(name: string, exceptId?: string) {
  name = clean(name);
  if (!name || name.length > 40) throw new StoreError('Enter the child’s first name.');
  if (state.data.members.some((m) => m.role === 'child' && m.id !== exceptId && m.name.toLowerCase() === name.toLowerCase())) {
    throw new StoreError(`There’s already a child called ${name}.`);
  }
  return name;
}
export function addChild(name: string, color: string) {
  requireParent();
  const child: Member = { id: uid(), role: 'child', name: checkChildName(name), avatarColor: checkColor(color), createdAt: now() };
  commit({ ...state.data, members: [...state.data.members, child] });
  return child;
}

export function updateChild(id: string, name: string, color: string) {
  requireParent();
  const n = checkChildName(name, id);
  commit({ ...state.data, members: state.data.members.map((m) => (m.id === id && m.role === 'child' ? { ...m, name: n, avatarColor: checkColor(color) } : m)) });
}

export async function removeChild(id: string) {
  requireParent();
  const theirs = state.data.chores.filter((c) => c.assignedTo === id);
  await Promise.all(theirs.filter((c) => c.hasPhoto).map((c) => deletePhoto(c.id).catch(() => undefined)));
  commit({ ...state.data, members: state.data.members.filter((m) => m.id !== id), chores: state.data.chores.filter((c) => c.assignedTo !== id) });
}

export function setMyColor(color: string) {
  const me = currentUser();
  if (!me) return;
  commit({ ...state.data, members: state.data.members.map((m) => (m.id === me.id ? { ...m, avatarColor: checkColor(color) } : m)) });
}

// ---------------------------------------------------------------- repeating chores

/** The first day after `after` that matches the rule (null for one-off chores). */
export function nextDueDate(after: string, repeat: Repeat, days: number[] = []): string | null {
  if (repeat === 'daily') return addDays(after, 1);
  if (repeat === 'weekly') {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(after, i);
      if (days.includes(isoWeekday(d))) return d;
    }
  }
  return null;
}

/** When a repeating chore is approved on `todayKey`, the next one is due on this day. Never in the past. */
export function nextAfterApproval(c: Pick<Chore, 'dueDate' | 'repeat' | 'repeatDays'>, todayKey: string) {
  const from = c.dueDate && c.dueDate > todayKey ? c.dueDate : todayKey;
  return nextDueDate(from, c.repeat, c.repeatDays);
}

// ---------------------------------------------------------------- grouping by due date

export type DueGroup = 'today' | 'week' | 'later';
export const DUE_GROUP_TITLE: Record<DueGroup, string> = { today: 'Today', week: 'This week', later: 'Later' };

/** Today = due today or overdue. This week = later this Monday–Sunday week. Later = after that, or no date. */
export function dueGroup(c: Pick<Chore, 'dueDate'>, todayKey: string): DueGroup {
  if (!c.dueDate) return 'later';
  if (c.dueDate <= todayKey) return 'today';
  return c.dueDate <= weekRange(todayKey).end ? 'week' : 'later';
}

export function groupByDue(chores: Chore[], todayKey: string) {
  const groups: Record<DueGroup, Chore[]> = { today: [], week: [], later: [] };
  for (const c of [...chores].sort(byDue)) groups[dueGroup(c, todayKey)].push(c);
  return groups;
}

// ---------------------------------------------------------------- points, streaks and the week

/** Every 50 points is a new level. */
export const POINTS_PER_LEVEL = 50;

export interface Progress {
  points: number;
  pointsThisWeek: number;
  /** Days in a row, ending today or yesterday, with at least one approved chore. */
  streak: number;
  bestStreak: number;
  /** Today already counts towards the streak. */
  doneToday: boolean;
  level: number;
  /** Points into the current level (0 … POINTS_PER_LEVEL - 1). */
  levelPoints: number;
}

/** An approved chore counts for the day it was handed in, so a parent approving late doesn't break a streak. */
export function creditDay(c: Pick<Chore, 'submittedAt' | 'approvedAt'>) {
  const at = c.submittedAt ?? c.approvedAt;
  return at ? toDay(new Date(at)) : null;
}

export function computeProgress(chores: Chore[], todayKey: string): Progress {
  const week = weekRange(todayKey);
  const days = new Set<string>();
  let points = 0;
  let pointsThisWeek = 0;
  for (const c of chores) {
    if (c.status !== 'approved') continue;
    points += c.points;
    const day = creditDay(c);
    if (!day) continue;
    days.add(day);
    if (day >= week.start && day <= week.end) pointsThisWeek += c.points;
  }
  const doneToday = days.has(todayKey);
  let streak = 0;
  for (let d = doneToday ? todayKey : addDays(todayKey, -1); days.has(d); d = addDays(d, -1)) streak++;
  let bestStreak = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue; // not the start of a run
    let run = 0;
    for (let x = d; days.has(x); x = addDays(x, 1)) run++;
    bestStreak = Math.max(bestStreak, run);
  }
  return { points, pointsThisWeek, streak, bestStreak, doneToday, level: Math.floor(points / POINTS_PER_LEVEL) + 1, levelPoints: points % POINTS_PER_LEVEL };
}

export interface WeekCompletion {
  /** Chores due this week (Monday–Sunday). */
  due: number;
  /** …of which approved. */
  done: number;
  /** Chores approved this week, whatever their due date. */
  approvedThisWeek: number;
}

export function weekCompletion(chores: Chore[], todayKey: string): WeekCompletion {
  const { start, end } = weekRange(todayKey);
  const due = chores.filter((c) => c.dueDate && c.dueDate >= start && c.dueDate <= end);
  const approvedThisWeek = chores.filter((c) => {
    if (c.status !== 'approved' || !c.approvedAt) return false;
    const d = toDay(new Date(c.approvedAt));
    return d >= start && d <= end;
  }).length;
  return { due: due.length, done: due.filter((c) => c.status === 'approved').length, approvedThisWeek };
}

// ---------------------------------------------------------------- rewards owed and paid out

export interface Balance {
  /** Approved but not yet marked as paid out. */
  owed: { moneyCents: number; screenMinutes: number; custom: Chore[] };
  paid: { moneyCents: number; screenMinutes: number; customCount: number };
}

export function rewardBalance(chores: Chore[]): Balance {
  const b: Balance = { owed: { moneyCents: 0, screenMinutes: 0, custom: [] }, paid: { moneyCents: 0, screenMinutes: 0, customCount: 0 } };
  for (const c of chores) {
    if (c.status !== 'approved') continue;
    const side = c.paidAt ? b.paid : b.owed;
    if (c.rewardType === 'money') side.moneyCents += c.rewardAmount ?? 0;
    else if (c.rewardType === 'screen_time') side.screenMinutes += c.rewardAmount ?? 0;
    else if (c.paidAt) b.paid.customCount++;
    else b.owed.custom.push(c);
  }
  return b;
}

/**
 * Parent only: records that a child's approved, unpaid rewards of one type have been handed over
 * (or, with `choreId`, just that one). Returns how many chores were marked. A record only.
 */
export function markPaidOut(childId: string, type: RewardType, choreId?: string) {
  requireParent();
  if (!state.data.members.some((m) => m.id === childId && m.role === 'child')) throw new StoreError('Child not found.');
  const match = (c: Chore) => c.assignedTo === childId && c.status === 'approved' && !c.paidAt && c.rewardType === type && (!choreId || c.id === choreId);
  const n = state.data.chores.filter(match).length;
  if (!n) throw new StoreError('Nothing to pay out.');
  const at = now();
  commit({ ...state.data, chores: state.data.chores.map((c) => (match(c) ? { ...c, paidAt: at } : c)) });
  return n;
}

// ---------------------------------------------------------------- chores

export interface ChoreInput {
  title: string;
  description: string;
  assignedTo: string;
  rewardType: RewardType;
  rewardAmount: number | null;
  rewardNote: string | null;
  dueDate: string | null;
  repeat?: Repeat;
  repeatDays?: number[];
  points?: number;
}

type CheckedChore = Required<ChoreInput>;

function checkChore(i: ChoreInput): CheckedChore {
  const title = clean(i.title);
  if (!title || title.length > 80) throw new StoreError('Give the chore a title (up to 80 characters).');
  if (i.description.length > 1000) throw new StoreError('Keep the instructions under 1,000 characters.');
  if (!state.data.members.some((m) => m.id === i.assignedTo && m.role === 'child')) throw new StoreError('Choose who should do it.');
  if (i.dueDate && !isDay(i.dueDate)) throw new StoreError('That due date isn’t valid.');
  const amount = i.rewardAmount ?? 0;
  if (i.rewardType === 'money' && !(Number.isInteger(amount) && amount >= 1 && amount <= 100000)) throw new StoreError('Enter an amount between €0.01 and €1,000.');
  if (i.rewardType === 'screen_time' && !(Number.isInteger(amount) && amount >= 1 && amount <= 1440)) throw new StoreError('Enter screen time in whole minutes (1 to 1440).');
  const note = clean(i.rewardNote ?? '');
  if (i.rewardType === 'custom' && (!note || note.length > 80)) throw new StoreError('Describe the reward in up to 80 characters.');
  const points = i.points ?? 10;
  if (!(Number.isInteger(points) && points >= 0 && points <= 1000)) throw new StoreError('Points must be a whole number from 0 to 1000.');
  const repeat: Repeat = i.repeat ?? 'none';
  if (!['none', 'daily', 'weekly'].includes(repeat)) throw new StoreError('Choose how often it repeats.');
  const repeatDays = repeat === 'weekly' ? cleanDays(i.repeatDays) : [];
  if (repeat === 'weekly' && !repeatDays.length) throw new StoreError('Choose at least one day for a weekly chore.');
  return {
    title,
    description: i.description.trim(),
    assignedTo: i.assignedTo,
    rewardType: i.rewardType,
    rewardAmount: i.rewardType === 'custom' ? null : amount,
    rewardNote: i.rewardType === 'custom' ? note : null,
    // A repeating chore always has a due date (today if none was chosen), so the next one can be worked out.
    dueDate: i.dueDate || (repeat !== 'none' ? today() : null),
    repeat,
    repeatDays,
    points,
  };
}

export function createChore(input: ChoreInput) {
  requireParent();
  const i = checkChore(input);
  const chore: Chore = { id: uid(), ...i, status: 'assigned', hasPhoto: false, childNote: null, feedback: null, createdAt: now(), submittedAt: null, approvedAt: null, seriesId: null, paidAt: null };
  commit({ ...state.data, chores: [chore, ...state.data.chores] });
  return chore;
}

export async function updateChore(id: string, input: ChoreInput) {
  requireParent();
  const cur = state.data.chores.find((c) => c.id === id);
  if (!cur) throw new StoreError('Chore not found.');
  if (cur.status === 'approved') throw new StoreError('Approved chores can’t be edited.');
  const i = checkChore(input);
  const reassigned = i.assignedTo !== cur.assignedTo;
  if (reassigned && cur.hasPhoto) await deletePhoto(id).catch(() => undefined);
  const next: Chore = reassigned
    ? { ...cur, ...i, status: 'assigned', hasPhoto: false, childNote: null, feedback: null, submittedAt: null }
    : { ...cur, ...i };
  commit({ ...state.data, chores: state.data.chores.map((c) => (c.id === id ? next : c)) });
}

export async function deleteChore(id: string) {
  requireParent();
  const cur = state.data.chores.find((c) => c.id === id);
  if (!cur) return;
  if (cur.hasPhoto) await deletePhoto(id).catch(() => undefined);
  commit({ ...state.data, chores: state.data.chores.filter((c) => c.id !== id) });
}

/** The assigned child hands a chore in, optionally with a (resized) photo and a note. */
export async function submitChore(id: string, opts: { photo?: Blob | null; note?: string }) {
  const me = requireChild();
  const cur = state.data.chores.find((c) => c.id === id && c.assignedTo === me.id);
  if (!cur) throw new StoreError('Chore not found.');
  if (cur.status !== 'assigned' && cur.status !== 'needs_changes') throw new StoreError('This chore has already been handed in.');
  const note = (opts.note ?? '').trim();
  if (note.length > 300) throw new StoreError('Keep your note short (300 characters).');
  if (opts.photo) {
    try {
      await putPhoto(id, opts.photo);
    } catch {
      throw new StoreError('The photo couldn’t be saved on this device. Try again, or hand it in without a photo.');
    }
  }
  const next: Chore = { ...cur, status: 'submitted', submittedAt: now(), hasPhoto: cur.hasPhoto || !!opts.photo, childNote: note || null, feedback: null };
  commit({ ...state.data, chores: state.data.chores.map((c) => (c.id === id ? next : c)) });
}

/**
 * Parent only: approve (records the reward and points) or send back with a note.
 * Approving a repeating chore creates the next one. Only a chore waiting for approval can be
 * approved, so each one creates at most one successor. Returns the next chore, if any.
 */
export function reviewChore(id: string, approve: boolean, feedback = ''): Chore | null {
  requireParent();
  const cur = state.data.chores.find((c) => c.id === id);
  if (!cur) throw new StoreError('Chore not found.');
  if (cur.status !== 'submitted') throw new StoreError('This chore isn’t waiting for approval.');
  const fb = feedback.trim();
  if (fb.length > 300) throw new StoreError('Keep the note under 300 characters.');
  if (!approve && !fb) throw new StoreError('Say what needs changing so they know what to do.');
  if (!approve) {
    commit({ ...state.data, chores: state.data.chores.map((c) => (c.id === id ? { ...cur, status: 'needs_changes', feedback: fb } : c)) });
    return null;
  }
  const done: Chore = { ...cur, status: 'approved', approvedAt: now(), feedback: fb || null };
  const due = cur.repeat !== 'none' ? nextAfterApproval(cur, today()) : null;
  const next: Chore | null = due
    ? {
        ...cur, id: uid(), dueDate: due, status: 'assigned', hasPhoto: false, childNote: null, feedback: null,
        createdAt: now(), submittedAt: null, approvedAt: null, paidAt: null, seriesId: cur.seriesId ?? cur.id,
      }
    : null;
  const chores = state.data.chores.map((c) => (c.id === id ? done : c));
  commit({ ...state.data, chores: next ? [next, ...chores] : chores });
  return next;
}

// ---------------------------------------------------------------- backup and restore

export const BACKUP_APP = 'family-chores';

export interface Backup {
  app: typeof BACKUP_APP;
  format: 1;
  exportedAt: string;
  data: Data;
  /** Photo proof, as data: URLs, keyed by chore id. */
  photos: Record<string, string>;
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      // Some browsers leave the type out for unnamed blobs; photos are JPEG by default.
      resolve(url.replace(/^data:(application\/octet-stream)?;/, 'data:image/jpeg;'));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function dataUrlToBlob(url: string) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/** Parent only: everything on this device as one JSON text, photos included. */
export async function exportBackup(): Promise<string> {
  requireParent();
  const photos: Record<string, string> = {};
  for (const c of state.data.chores) {
    if (!c.hasPhoto) continue;
    const blob = await getPhoto(c.id).catch(() => undefined);
    if (blob) photos[c.id] = await blobToDataUrl(blob);
  }
  const backup: Backup = { app: BACKUP_APP, format: 1, exportedAt: now(), data: state.data, photos };
  return JSON.stringify(backup);
}

export const backupFileName = (at = new Date()) => `family-chores-backup-${toDay(at)}.json`;

/**
 * Replaces everything on this device with a backup. Allowed for a signed-in parent, or on a
 * device with no household yet (setting up a new phone). Afterwards everyone picks their name
 * again; the parent PIN is the one from the backup. Returns the household name.
 */
export async function importBackup(text: string): Promise<string> {
  if (state.data.household) requireParent();
  if (text.length > 200 * 1024 * 1024) throw new StoreError('That file is too large to be a Family Chores backup.');
  const parsed = safe(() => JSON.parse(text) as unknown, null);
  if (!isObj(parsed) || parsed.app !== BACKUP_APP) throw new StoreError('That file isn’t a Family Chores backup.');
  if (parsed.format !== 1) throw new StoreError('That backup was made by a newer version of Family Chores. Update the app first.');
  const data = migrate(parsed.data);
  if (!data?.household) throw new StoreError('That backup is damaged or empty, so nothing was changed.');
  const photos = isObj(parsed.photos) ? parsed.photos : {};
  const blobs = new Map<string, Blob>();
  for (const c of data.chores) {
    const b = c.hasPhoto && typeof photos[c.id] === 'string' ? dataUrlToBlob(photos[c.id] as string) : null;
    if (b) blobs.set(c.id, b);
    else c.hasPhoto = false;
  }
  await clearPhotos().catch(() => undefined);
  for (const [id, b] of blobs) {
    await putPhoto(id, b).catch(() => {
      const c = data.chores.find((x) => x.id === id);
      if (c) c.hasPhoto = false;
    });
  }
  setSession(null);
  commit(data);
  return data.household.name;
}

// ---------------------------------------------------------------- demo

/** The Smith Family: Sarah (parent PIN 1234), Alex and Jamie, with example chores. */
export async function loadDemo() {
  if (state.data.household && !state.data.household.demo) throw new StoreError('This device already has a household.');
  await clearPhotos().catch(() => undefined);
  const t = today();
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const sarah: Member = { id: uid(), role: 'parent', name: 'Sarah', avatarColor: 'slate', createdAt: ago(9) };
  const alex: Member = { id: uid(), role: 'child', name: 'Alex', avatarColor: 'teal', createdAt: ago(9) };
  const jamie: Member = { id: uid(), role: 'child', name: 'Jamie', avatarColor: 'violet', createdAt: ago(9) };
  const base = {
    hasPhoto: false, childNote: null, feedback: null, submittedAt: null, approvedAt: null, rewardAmount: null, rewardNote: null,
    dueDate: null, status: 'assigned' as const, createdAt: ago(0.1), repeat: 'none' as Repeat, repeatDays: [], points: 10, seriesId: null, paidAt: null,
  };
  const done = (daysAgo: number) => ({ status: 'approved' as const, submittedAt: ago(daysAgo + 0.05), approvedAt: ago(daysAgo), createdAt: ago(daysAgo + 1) });
  const chores: Chore[] = [
    { ...base, id: uid(), title: 'Clean bedroom', description: 'Make the bed, put clothes in the wash basket and clear the floor. Hoover when you’re done.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 500, dueDate: t, points: 20 },
    { ...base, id: uid(), title: 'Take out bins', description: 'Take the green and black bins to the end of the drive. Bring them back in after collection.', assignedTo: jamie.id, rewardType: 'screen_time', rewardAmount: 30, dueDate: t, repeat: 'weekly', repeatDays: [isoWeekday(t)] },
    { ...base, id: uid(), title: 'Feed the dog', description: 'One scoop of dry food in the morning and fresh water in the bowl.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 200, dueDate: t, repeat: 'daily', points: 5 },
    { ...base, id: uid(), title: 'Water the tomatoes', description: 'A full watering can for the tomato plants by the back door.', assignedTo: jamie.id, rewardType: 'money', rewardAmount: 100, dueDate: addDays(t, -2), createdAt: ago(3) },
    { ...base, id: uid(), title: 'Wash the car', description: 'Bucket, sponge and a rinse with the hose. Ask for help with the roof.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 800, dueDate: addDays(weekRange(t).end, 3), points: 30 },
    { ...base, ...done(1), id: uid(), title: 'Unload the dishwasher', description: 'Put everything back where it belongs.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 150 },
    { ...base, ...done(2), id: uid(), title: 'Tidy the shoe rack', description: 'Pair up the shoes and put away anything that isn’t worn this week.', assignedTo: alex.id, rewardType: 'custom', rewardNote: 'Pick Friday’s film' },
    { ...base, ...done(3), id: uid(), title: 'Set the table', description: 'Plates, cutlery and glasses for everyone.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 100 },
    { ...base, ...done(1), id: uid(), title: 'Fold the laundry', description: 'Fold and put away your own clothes.', assignedTo: jamie.id, rewardType: 'money', rewardAmount: 200, paidAt: ago(0.5) },
  ];
  commit({ ...empty(), household: { name: 'The Smith Family', createdAt: ago(9), demo: true, ...(await makePin('1234')) }, members: [sarah, alex, jamie], chores });
  setSession(null);
}
