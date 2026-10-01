import { useSyncExternalStore } from 'react';
import type {
  AppData,
  CheckInStatus,
  DateKey,
  DistractionLog,
  FocusSession,
  GoalStatus,
  Habit,
  HabitEvent,
  JournalEntry,
  Mission,
  PersonalGoal,
  ResetSession,
  Routine,
  UserPreferences,
} from '../models/types';
import { nowIso, todayKey } from '../utils/dates';
import { completionKey, uid } from '../utils/logic';
import { describeAchievement, qualifyingAchievements } from '../utils/insights';
import { emptyData, defaultPrefs } from './schema';
import { clearAllStorage, loadData, saveData, StorageWriteError, type LoadStatus } from './storage';
import { notify } from './notify';

// ------------------------------------------------------------------ state

let state: AppData = emptyData();
let loadStatus: LoadStatus = { kind: 'new' };
let writable = true;
let saveErrorShown = false;
const listeners = new Set<() => void>();

export function initStore() {
  const r = loadData();
  state = r.data;
  loadStatus = r.status;
  writable = r.writable;
  listeners.forEach((l) => l());
}

/** For tests: start from given data without touching storage. */
export function resetStoreForTests(data: AppData = emptyData()) {
  state = data;
  loadStatus = { kind: 'ok' };
  writable = true;
  listeners.forEach((l) => l());
}

export const getState = () => state;
export const getLoadStatus = () => loadStatus;
export const isWritable = () => writable;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useStore<T>(selector: (s: AppData) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

function commit(next: AppData, opts: { skipAchievements?: boolean } = {}) {
  if (!opts.skipAchievements) next = awardAchievements(next);
  state = next;
  if (writable) {
    try {
      saveData(next);
      saveErrorShown = false;
    } catch (e) {
      if (!saveErrorShown) {
        saveErrorShown = true;
        const quota = e instanceof StorageWriteError && e.quota;
        notify(
          quota
            ? 'Storage is full, so this change was not saved. Export a backup and remove old records in Settings → Data.'
            : 'This change could not be saved to your browser. Your data is still open in this tab.',
          'error',
          undefined,
          0,
        );
      }
    }
  }
  listeners.forEach((l) => l());
}

function update(recipe: (d: AppData) => AppData, opts?: { skipAchievements?: boolean }) {
  commit(recipe(state), opts);
}

function awardAchievements(d: AppData): AppData {
  const earned = new Set(d.achievements.map((a) => a.id));
  const qualifying = qualifyingAchievements(d, todayKey(), d.prefs.weekStartsOn);
  const fresh = Array.from(qualifying).filter((id) => !earned.has(id));
  if (!fresh.length) return d;
  const at = nowIso();
  if (d.prefs.gamification) {
    const titles = fresh.map((id) => describeAchievement(id, d.habits).title);
    notify(titles.length === 1 ? `Achievement unlocked: ${titles[0]}` : `Achievements unlocked: ${titles.join(', ')}`, 'achievement');
  }
  return { ...d, achievements: [...d.achievements, ...fresh.map((id) => ({ id, earnedAt: at }))] };
}

const replace = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>) =>
  list.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: nowIso() } : x));

// ------------------------------------------------------------------ preferences

export function updatePrefs(patch: Partial<UserPreferences>) {
  update((d) => ({ ...d, prefs: { ...d.prefs, ...patch } }), { skipAchievements: true });
}

export function resetPrefs() {
  update((d) => ({ ...d, prefs: { ...defaultPrefs(), onboarded: true } }), { skipAchievements: true });
}

// ------------------------------------------------------------------ habits

export type NewHabit = Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'archived'>;

export function addHabit(input: NewHabit): string {
  const id = uid();
  const at = nowIso();
  update((d) => ({ ...d, habits: [...d.habits, { ...input, id, archived: false, createdAt: at, updatedAt: at }] }));
  return id;
}

export function updateHabit(id: string, patch: Partial<Habit>) {
  update((d) => ({ ...d, habits: replace(d.habits, id, patch) }));
}

export function setHabitArchived(id: string, archived: boolean) {
  updateHabit(id, { archived });
}

/** Removes the habit and every check-in and event that belongs to it. */
export function deleteHabit(id: string) {
  update((d) => ({
    ...d,
    habits: d.habits.filter((h) => h.id !== id).map((h) => (h.linkedHabitId === id ? { ...h, linkedHabitId: undefined } : h)),
    checkIns: d.checkIns.filter((c) => c.habitId !== id),
    events: d.events.filter((e) => e.habitId !== id),
    journal: d.journal.map((j) => (j.habitId === id ? { ...j, habitId: undefined } : j)),
    goals: d.goals.map((g) => (g.habitId === id ? { ...g, habitId: undefined } : g)),
    achievements: d.achievements.filter((a) => !a.id.startsWith(`milestone:${id}:`)),
  }));
}

// ------------------------------------------------------------------ check-ins

/** One check-in per habit per day: setting again updates the existing record. */
export function setCheckIn(habitId: string, date: DateKey, status: CheckInStatus, note = '') {
  update((d) => {
    const existing = d.checkIns.find((c) => c.habitId === habitId && c.date === date);
    const at = nowIso();
    if (existing) {
      return { ...d, checkIns: d.checkIns.map((c) => (c === existing ? { ...c, status, note: note || c.note, updatedAt: at } : c)) };
    }
    return { ...d, checkIns: [...d.checkIns, { id: uid(), habitId, date, status, note, createdAt: at, updatedAt: at }] };
  });
}

export function deleteCheckIn(habitId: string, date: DateKey) {
  update((d) => ({ ...d, checkIns: d.checkIns.filter((c) => !(c.habitId === habitId && c.date === date)) }));
}

// ------------------------------------------------------------------ events

export type NewEvent = Omit<HabitEvent, 'id' | 'createdAt' | 'updatedAt'>;

export function addEvent(input: NewEvent): string {
  const id = uid();
  const at = nowIso();
  update((d) => ({ ...d, events: [...d.events, { ...input, id, createdAt: at, updatedAt: at }] }));
  return id;
}

export function updateEvent(id: string, patch: Partial<HabitEvent>) {
  update((d) => ({ ...d, events: replace(d.events, id, patch) }));
}

export function deleteEvent(id: string) {
  update((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
}

// ------------------------------------------------------------------ journal

export function saveJournal(entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): string {
  const at = nowIso();
  if (entry.id) {
    const id = entry.id;
    update((d) => ({ ...d, journal: replace(d.journal, id, entry) }));
    return id;
  }
  const id = uid();
  update((d) => ({ ...d, journal: [...d.journal, { ...entry, id, createdAt: at, updatedAt: at }] }));
  return id;
}

export function deleteJournal(id: string) {
  update((d) => ({ ...d, journal: d.journal.filter((j) => j.id !== id) }));
}

export function toggleJournalPin(id: string) {
  update((d) => ({ ...d, journal: d.journal.map((j) => (j.id === id ? { ...j, pinned: !j.pinned } : j)) }));
}

// ------------------------------------------------------------------ missions & routines

export function saveMission(m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt' | 'archived'> & { id?: string }): string {
  const at = nowIso();
  if (m.id) {
    const id = m.id;
    update((d) => ({ ...d, missions: replace(d.missions, id, m) }));
    return id;
  }
  const id = uid();
  update((d) => ({ ...d, missions: [...d.missions, { ...m, id, archived: false, createdAt: at, updatedAt: at }] }));
  return id;
}

export function setMissionArchived(id: string, archived: boolean) {
  update((d) => ({ ...d, missions: replace(d.missions, id, { archived }) }));
}

/** Deletes the mission, its completion history and its routine steps. */
export function deleteMission(id: string) {
  update((d) => ({
    ...d,
    missions: d.missions.filter((m) => m.id !== id),
    missionCompletions: d.missionCompletions.filter((c) => c.missionId !== id),
    routines: d.routines.map((r) => ({ ...r, steps: r.steps.filter((s) => s.missionId !== id) })),
  }));
}

/** Completes or un-completes a mission for a date. Never creates duplicates. */
export function toggleMission(missionId: string, date: DateKey, done?: boolean) {
  update((d) => {
    const exists = d.missionCompletions.some((c) => completionKey(c.missionId, c.date) === completionKey(missionId, date));
    const want = done ?? !exists;
    if (want === exists) return d;
    return {
      ...d,
      missionCompletions: want
        ? [...d.missionCompletions, { id: uid(), missionId, date, completedAt: nowIso() }]
        : d.missionCompletions.filter((c) => !(c.missionId === missionId && c.date === date)),
    };
  });
}

export function saveRoutine(r: Omit<Routine, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): string {
  const at = nowIso();
  if (r.id) {
    const id = r.id;
    update((d) => ({ ...d, routines: replace(d.routines, id, r) }));
    return id;
  }
  const id = uid();
  update((d) => ({ ...d, routines: [...d.routines, { ...r, id, createdAt: at, updatedAt: at }] }));
  return id;
}

export function deleteRoutine(id: string) {
  update((d) => ({ ...d, routines: d.routines.filter((r) => r.id !== id) }));
}

// ------------------------------------------------------------------ focus & reset

export function addFocusSession(s: Omit<FocusSession, 'id'>) {
  update((d) => ({ ...d, focusSessions: [...d.focusSessions, { ...s, id: uid() }] }));
}

export function deleteFocusSession(id: string) {
  update((d) => ({ ...d, focusSessions: d.focusSessions.filter((s) => s.id !== id) }));
}

export function addResetSession(s: Omit<ResetSession, 'id'>): string {
  const id = uid();
  update((d) => ({ ...d, resetSessions: [...d.resetSessions, { ...s, id }] }));
  return id;
}

export function updateResetSession(id: string, patch: Partial<ResetSession>) {
  update((d) => ({ ...d, resetSessions: d.resetSessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
}

export function deleteResetSession(id: string) {
  update((d) => ({ ...d, resetSessions: d.resetSessions.filter((s) => s.id !== id) }));
}

// ------------------------------------------------------------------ goals

export function saveGoal(g: Omit<PersonalGoal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): string {
  const at = nowIso();
  if (g.id) {
    const id = g.id;
    update((d) => ({ ...d, goals: replace(d.goals, id, g) }));
    return id;
  }
  const id = uid();
  update((d) => ({ ...d, goals: [...d.goals, { ...g, id, createdAt: at, updatedAt: at }] }));
  return id;
}

export function setGoalStatus(id: string, status: GoalStatus) {
  update((d) => ({ ...d, goals: replace(d.goals, id, { status }) }));
}

export function setGoalProgress(id: string, progress: number) {
  if (!Number.isFinite(progress) || progress < 0) return;
  update((d) => ({ ...d, goals: replace(d.goals, id, { progress }) }));
}

export function toggleGoalMilestone(goalId: string, milestoneId: string) {
  update((d) => ({
    ...d,
    goals: d.goals.map((g) =>
      g.id === goalId ? { ...g, updatedAt: nowIso(), milestones: g.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m)) } : g,
    ),
  }));
}

export function deleteGoal(id: string) {
  update((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));
}

// ------------------------------------------------------------------ distraction management

export function addBlockedSite(domain: string, reason: string) {
  update((d) => ({ ...d, blockedSites: [...d.blockedSites, { id: uid(), domain, reason, createdAt: nowIso() }] }), { skipAchievements: true });
}

export function deleteBlockedSite(id: string) {
  update((d) => ({ ...d, blockedSites: d.blockedSites.filter((s) => s.id !== id) }), { skipAchievements: true });
}

export function addDistractionLog(log: Omit<DistractionLog, 'id' | 'createdAt'>) {
  update((d) => ({ ...d, distractionLogs: [...d.distractionLogs, { ...log, id: uid(), createdAt: nowIso() }] }), { skipAchievements: true });
}

export function deleteDistractionLog(id: string) {
  update((d) => ({ ...d, distractionLogs: d.distractionLogs.filter((l) => l.id !== id) }), { skipAchievements: true });
}

// ------------------------------------------------------------------ whole-data operations

/** Replaces everything with validated imported data. */
export function replaceAllData(data: AppData) {
  writable = true;
  commit({ ...data, prefs: { ...data.prefs, onboarded: true } }, { skipAchievements: true });
}

export function deleteAllData() {
  clearAllStorage();
  writable = true;
  commit(emptyData(), { skipAchievements: true });
}
