import type { Chore, ChoreStatus, Repeat, RewardType } from './types';

export const STATUS_LABEL: Record<ChoreStatus, string> = {
  assigned: 'To do',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  needs_changes: 'Needs changes',
};

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
export const formatMoney = (cents: number) => euro.format(cents / 100).replace(/\.00$/, '');

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatReward(c: Pick<Chore, 'rewardType' | 'rewardAmount' | 'rewardNote'>) {
  if (c.rewardType === 'money') return formatMoney(c.rewardAmount ?? 0);
  if (c.rewardType === 'screen_time') return `${formatMinutes(c.rewardAmount ?? 0)} screen time`;
  return c.rewardNote ?? 'Reward';
}

export const formatPoints = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

export const REWARD_TYPE_LABEL: Record<RewardType, string> = { money: 'Money', screen_time: 'Screen time', custom: 'Custom' };

// ---------------------------------------------------------------- calendar days (device's local time)

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date, YYYY-MM-DD. */
export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = (now = new Date()) => toDay(now);
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export function addDays(day: string, n: number) {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string) {
  const w = parse(day).getDay();
  return w === 0 ? 7 : w;
}

/** Monday and Sunday of the week containing `day`. */
export function weekRange(day: string) {
  const start = addDays(day, 1 - isoWeekday(day));
  return { start, end: addDays(start, 6) };
}

export const formatDay = (day: string) => parse(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function formatDue(due: string, todayKey: string) {
  if (due === todayKey) return 'Due today';
  if (due === addDays(todayKey, 1)) return 'Due tomorrow';
  if (due === addDays(todayKey, -1)) return 'Overdue · yesterday';
  return due < todayKey ? `Overdue · ${formatDay(due)}` : `Due ${formatDay(due)}`;
}

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- repeats

export const WEEKDAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
] as const;

/** "Every day", "Weekdays", "Every Saturday", "Every Mon, Wed and Fri". */
export function describeRepeat(repeat: Repeat, days: number[] = []): string | null {
  if (repeat === 'daily') return 'Every day';
  if (repeat !== 'weekly' || !days.length) return null;
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '6,7') return 'Weekends';
  if (d.length === 1) return `Every ${WEEKDAYS[d[0] - 1].long}`;
  const names = d.map((n) => WEEKDAYS[n - 1].short);
  return `Every ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------- totals and sorting

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
    if (c.rewardType === 'money') t.moneyCents += c.rewardAmount ?? 0;
    else if (c.rewardType === 'screen_time') t.screenMinutes += c.rewardAmount ?? 0;
    else if (c.rewardNote) t.custom.push(c.rewardNote);
  }
  return t;
}

export const isOpen = (c: Pick<Chore, 'status'>) => c.status === 'assigned' || c.status === 'needs_changes';
/** Still to do and the due date has passed. */
export const isOverdue = (c: Pick<Chore, 'status' | 'dueDate'>, todayKey: string) => isOpen(c) && !!c.dueDate && c.dueDate < todayKey;
export const byDue = (a: Chore, b: Chore) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || b.createdAt.localeCompare(a.createdAt);
export const byApproved = (a: Chore, b: Chore) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '');
export const bySubmitted = (a: Chore, b: Chore) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '');
