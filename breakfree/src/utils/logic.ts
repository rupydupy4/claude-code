import type {
  DateKey,
  FocusSession,
  Mission,
  MissionCompletion,
  PersonalGoal,
  Routine,
} from '../models/types';
import { dayOfWeek, diffDays, fromDateKey } from './dates';

// ---------- IDs ----------

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Missions ----------

export function isMissionDue(m: Mission, date: DateKey): boolean {
  if (m.archived) return false;
  const created = m.createdAt.slice(0, 10);
  switch (m.recurrence.type) {
    case 'once':
      return m.recurrence.date === date;
    case 'daily':
      return date >= created;
    case 'weekdays':
      return date >= created && m.recurrence.days.includes(dayOfWeek(date));
  }
}

export function completionKey(missionId: string, date: DateKey) {
  return `${missionId}|${date}`;
}

export function completionSet(completions: MissionCompletion[]): Set<string> {
  return new Set(completions.map((c) => completionKey(c.missionId, c.date)));
}

export function describeRecurrence(m: Mission): string {
  const r = m.recurrence;
  if (r.type === 'daily') return 'Every day';
  if (r.type === 'once') return `Once · ${fromDateKey(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const s = [...r.days].sort().join('');
  if (s === '12345') return 'Weekdays';
  if (s === '06') return 'Weekends';
  return [...r.days].sort().map((d) => names[d]).join(', ');
}

export function routineProgress(routine: Routine, done: Set<string>, date: DateKey, missions: Mission[]) {
  const steps = routine.steps.filter((s) => missions.some((m) => m.id === s.missionId && !m.archived));
  const completed = steps.filter((s) => done.has(completionKey(s.missionId, date))).length;
  return { completed, total: steps.length };
}

// ---------- Goals ----------

/** Progress as 0–1. Never NaN, never negative, never above 1. */
export function goalProgress(g: PersonalGoal): number {
  if (g.status === 'completed') return 1;
  if (g.kind === 'completion') {
    if (g.milestones.length === 0) return 0;
    return g.milestones.filter((m) => m.done).length / g.milestones.length;
  }
  if (!g.target || g.target <= 0 || !Number.isFinite(g.progress)) return 0;
  return Math.max(0, Math.min(1, g.progress / g.target));
}

export function goalDaysLeft(g: PersonalGoal, today: DateKey): number | null {
  return g.targetDate ? diffDays(today, g.targetDate) : null;
}

// ---------- Focus ----------

/** Focus time totals count completed sessions only (see FocusSession docs). */
export function focusMinutes(sessions: FocusSession[], start: DateKey, end: DateKey): number {
  let sum = 0;
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    const d = s.startedAt.slice(0, 10);
    const local = localDateOfIso(s.startedAt) ?? d;
    if (local >= start && local <= end) sum += s.focusedMin;
  }
  return Math.round(sum);
}

export function localDateOfIso(iso: string): DateKey | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- Timers ----------

/**
 * Timestamp-based timer state. Remaining time is always derived from Date.now(), so it stays
 * correct when the tab is suspended, throttled or reloaded.
 */
export interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'done';
  durationMs: number;
  /** When the current running stretch began (epoch ms). */
  startedAt: number | null;
  /** Time already elapsed before the current running stretch. */
  elapsedMs: number;
  /** First start, for history. */
  firstStartedAt: number | null;
}

export const idleTimer = (durationMs: number): TimerState => ({
  status: 'idle',
  durationMs,
  startedAt: null,
  elapsedMs: 0,
  firstStartedAt: null,
});

export function timerElapsed(t: TimerState, now: number): number {
  const running = t.status === 'running' && t.startedAt !== null ? now - t.startedAt : 0;
  return Math.min(t.durationMs, t.elapsedMs + Math.max(0, running));
}

export function timerRemaining(t: TimerState, now: number): number {
  return Math.max(0, t.durationMs - timerElapsed(t, now));
}

export function startTimer(t: TimerState, now: number): TimerState {
  if (t.status === 'running') return t; // prevents duplicate starts
  return { ...t, status: 'running', startedAt: now, firstStartedAt: t.firstStartedAt ?? now };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.status !== 'running') return t;
  return { ...t, status: 'paused', elapsedMs: timerElapsed(t, now), startedAt: null };
}

/** Marks the timer done once its time has run out. */
export function settleTimer(t: TimerState, now: number): TimerState {
  if (t.status === 'running' && timerRemaining(t, now) === 0) {
    return { ...t, status: 'done', elapsedMs: t.durationMs, startedAt: null };
  }
  return t;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
