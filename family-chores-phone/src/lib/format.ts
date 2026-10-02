import type { Chore, ChoreStatus, RewardType } from './types';

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

export const REWARD_TYPE_LABEL: Record<RewardType, string> = { money: 'Money', screen_time: 'Screen time', custom: 'Custom' };

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date, YYYY-MM-DD. */
export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = (now = new Date()) => toDay(now);

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return toDay(new Date(y, m - 1, d + n, 12));
}

export function formatDue(due: string, todayKey: string) {
  if (due === todayKey) return 'Due today';
  if (due === addDays(todayKey, 1)) return 'Due tomorrow';
  const [y, m, d] = due.split('-').map(Number);
  const label = new Date(y, m - 1, d, 12).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return due < todayKey ? `Overdue · ${label}` : `Due ${label}`;
}

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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

export const isOpen = (c: Chore) => c.status === 'assigned' || c.status === 'needs_changes';
export const byDue = (a: Chore, b: Chore) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || b.createdAt.localeCompare(a.createdAt);
export const byApproved = (a: Chore, b: Chore) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '');
