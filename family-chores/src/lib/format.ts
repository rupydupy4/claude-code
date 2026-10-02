import type { Chore, ChoreStatus, RewardType } from './types';

export const STATUS_LABEL: Record<ChoreStatus, string> = {
  assigned: 'To do',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  needs_changes: 'Needs changes',
};

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export function formatMoney(cents: number) {
  return euro.format(cents / 100).replace(/\.00$/, '');
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatReward(c: Pick<Chore, 'reward_type' | 'reward_amount' | 'reward_note'>) {
  if (c.reward_type === 'money') return formatMoney(c.reward_amount ?? 0);
  if (c.reward_type === 'screen_time') return `${formatMinutes(c.reward_amount ?? 0)} screen time`;
  return c.reward_note ?? 'Reward';
}

export const REWARD_TYPE_LABEL: Record<RewardType, string> = { money: 'Money', screen_time: 'Screen time', custom: 'Custom' };

/** Today's date (YYYY-MM-DD) in the household's time zone. */
export function todayIn(timeZone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Today", "Tomorrow", "Overdue · Mon 3 Oct" etc., relative to the household's today. */
export function formatDue(due: string, today: string) {
  if (due === today) return 'Due today';
  if (due === addDays(today, 1)) return 'Due tomorrow';
  const label = new Date(`${due}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return due < today ? `Overdue · ${label}` : `Due ${label}`;
}

export function formatDate(iso: string, timeZone: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone });
}

export function formatDateTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });
}

export interface RewardTotals {
  moneyCents: number;
  screenMinutes: number;
  custom: string[];
  count: number;
}

/** Rewards are recorded when a chore is approved; totals are summed from approved chores. */
export function totalRewards(chores: Chore[]): RewardTotals {
  const t: RewardTotals = { moneyCents: 0, screenMinutes: 0, custom: [], count: 0 };
  for (const c of chores) {
    if (c.status !== 'approved') continue;
    t.count++;
    if (c.reward_type === 'money') t.moneyCents += c.reward_amount ?? 0;
    else if (c.reward_type === 'screen_time') t.screenMinutes += c.reward_amount ?? 0;
    else if (c.reward_note) t.custom.push(c.reward_note);
  }
  return t;
}

/** Friendly copy for database errors raised by the chore functions. */
export function errorMessage(e: { message?: string; code?: string } | null | undefined, fallback = 'Something went wrong. Please try again.') {
  if (!e?.message) return fallback;
  const known = ['Only a parent', 'Chore not found', 'already', 'Choose a child', 'can\'t be edited', 'isn\'t waiting', 'Say what needs', 'Invalid photo', 'Child not found', 'Not signed in'];
  if (known.some((k) => e.message!.includes(k))) return e.message;
  if (e.code === '23505' || e.message.includes('members_child_name_unique')) return 'A child with that name already exists in your household.';
  if (e.code === '23514') return 'Please check the details and try again.';
  return fallback;
}
