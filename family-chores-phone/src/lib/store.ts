import { useSyncExternalStore } from 'react';
import type { AvatarColor, Chore, Data, Household, Member, RewardType } from './types';
import { AVATAR_COLORS } from './types';
import { clearPhotos, deletePhoto, putPhoto } from './photos';

/**
 * Everything is stored on this device. The workflow rules live here, in one place:
 * only the signed-in parent (unlocked with the parent PIN) can create, edit, review or delete;
 * a child can only hand in their own chores.
 */

const DATA_KEY = 'family-chores:data';
const CHILD_KEY = 'family-chores:child';
const PARENT_KEY = 'family-chores:parent-unlocked';

export class StoreError extends Error {}

export interface Session {
  userId: string | null;
}

interface State {
  data: Data;
  session: Session;
  saveError: string;
}

const empty = (): Data => ({ version: 1, household: null, members: [], chores: [] });

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function load(): State {
  const data = safe(() => {
    const raw = localStorage.getItem(DATA_KEY);
    const parsed = raw ? (JSON.parse(raw) as Data) : null;
    return parsed && parsed.version === 1 && Array.isArray(parsed.members) && Array.isArray(parsed.chores) ? parsed : empty();
  }, empty());
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

/** Test helper. */
export function _reset(data: Data = empty(), userId: string | null = null) {
  state = { data, session: { userId }, saveError: '' };
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
  commit({ version: 1, household: { name, createdAt: now(), ...(await makePin(pin)) }, members: [parent], chores: [] });
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

export async function deleteEverything() {
  requireParent();
  await clearPhotos().catch(() => undefined);
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
const checkColor = (c: string): AvatarColor => ((AVATAR_COLORS as readonly string[]).includes(c) ? (c as AvatarColor) : 'teal');

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

// ---------------------------------------------------------------- chores

export interface ChoreInput {
  title: string;
  description: string;
  assignedTo: string;
  rewardType: RewardType;
  rewardAmount: number | null;
  rewardNote: string | null;
  dueDate: string | null;
}

function checkChore(i: ChoreInput): ChoreInput {
  const title = clean(i.title);
  if (!title || title.length > 80) throw new StoreError('Give the chore a title (up to 80 characters).');
  if (i.description.length > 1000) throw new StoreError('Keep the instructions under 1,000 characters.');
  if (!state.data.members.some((m) => m.id === i.assignedTo && m.role === 'child')) throw new StoreError('Choose who should do it.');
  if (i.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) throw new StoreError('That due date isn’t valid.');
  const amount = i.rewardAmount ?? 0;
  if (i.rewardType === 'money' && !(Number.isInteger(amount) && amount >= 1 && amount <= 100000)) throw new StoreError('Enter an amount between €0.01 and €1,000.');
  if (i.rewardType === 'screen_time' && !(Number.isInteger(amount) && amount >= 1 && amount <= 1440)) throw new StoreError('Enter screen time in whole minutes (1 to 1440).');
  const note = clean(i.rewardNote ?? '');
  if (i.rewardType === 'custom' && (!note || note.length > 80)) throw new StoreError('Describe the reward in up to 80 characters.');
  return {
    ...i,
    title,
    description: i.description.trim(),
    rewardAmount: i.rewardType === 'custom' ? null : amount,
    rewardNote: i.rewardType === 'custom' ? note : null,
    dueDate: i.dueDate || null,
  };
}

export function createChore(input: ChoreInput) {
  requireParent();
  const i = checkChore(input);
  const chore: Chore = { id: uid(), ...i, status: 'assigned', hasPhoto: false, childNote: null, feedback: null, createdAt: now(), submittedAt: null, approvedAt: null };
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

/** Parent only: approve (records the reward) or send back with a note. */
export function reviewChore(id: string, approve: boolean, feedback = '') {
  requireParent();
  const cur = state.data.chores.find((c) => c.id === id);
  if (!cur) throw new StoreError('Chore not found.');
  if (cur.status !== 'submitted') throw new StoreError('This chore isn’t waiting for approval.');
  const fb = feedback.trim();
  if (fb.length > 300) throw new StoreError('Keep the note under 300 characters.');
  if (!approve && !fb) throw new StoreError('Say what needs changing so they know what to do.');
  const next: Chore = approve ? { ...cur, status: 'approved', approvedAt: now(), feedback: fb || null } : { ...cur, status: 'needs_changes', feedback: fb };
  commit({ ...state.data, chores: state.data.chores.map((c) => (c.id === id ? next : c)) });
}

// ---------------------------------------------------------------- demo

/** The Smith Family: Sarah (parent PIN 1234), Alex and Jamie, with example chores. */
export async function loadDemo() {
  if (state.data.household && !state.data.household.demo) throw new StoreError('This device already has a household.');
  await clearPhotos().catch(() => undefined);
  const t = new Date();
  const day = (n: number) => {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const sarah: Member = { id: uid(), role: 'parent', name: 'Sarah', avatarColor: 'slate', createdAt: ago(5) };
  const alex: Member = { id: uid(), role: 'child', name: 'Alex', avatarColor: 'teal', createdAt: ago(5) };
  const jamie: Member = { id: uid(), role: 'child', name: 'Jamie', avatarColor: 'violet', createdAt: ago(5) };
  const base = { hasPhoto: false, childNote: null, feedback: null, submittedAt: null, approvedAt: null, rewardAmount: null, rewardNote: null, dueDate: null, status: 'assigned' as const, createdAt: ago(0.1) };
  const chores: Chore[] = [
    { ...base, id: uid(), title: 'Clean bedroom', description: 'Make the bed, put clothes in the wash basket and clear the floor. Hoover when you’re done.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 500, dueDate: day(0) },
    { ...base, id: uid(), title: 'Take out bins', description: 'Take the green and black bins to the end of the drive. Bring them back in after collection.', assignedTo: jamie.id, rewardType: 'screen_time', rewardAmount: 30, dueDate: day(0) },
    { ...base, id: uid(), title: 'Feed the dog', description: 'One scoop of dry food in the morning and fresh water in the bowl.', assignedTo: alex.id, rewardType: 'money', rewardAmount: 200, dueDate: day(0) },
    { ...base, id: uid(), title: 'Unload the dishwasher', description: 'Put everything back where it belongs.', assignedTo: jamie.id, rewardType: 'money', rewardAmount: 150, status: 'approved', submittedAt: ago(1.1), approvedAt: ago(1), createdAt: ago(2) },
    { ...base, id: uid(), title: 'Tidy the shoe rack', description: 'Pair up the shoes and put away anything that isn’t worn this week.', assignedTo: alex.id, rewardType: 'custom', rewardNote: 'Pick Friday’s film', status: 'approved', submittedAt: ago(2.1), approvedAt: ago(2), createdAt: ago(3) },
  ];
  commit({ version: 1, household: { name: 'The Smith Family', createdAt: ago(5), demo: true, ...(await makePin('1234')) }, members: [sarah, alex, jamie], chores });
  setSession(null);
}
