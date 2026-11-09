import { weekRange } from './dates';
import type { Chore } from './types';

export const isOpen = (c: Pick<Chore, 'status'>) => c.status === 'assigned' || c.status === 'needs_changes';

/** Still to do and the due date has passed. */
export const isOverdue = (c: Pick<Chore, 'status' | 'due_date'>, today: string) => isOpen(c) && !!c.due_date && c.due_date < today;

/** Chores still to do that are due today or earlier. */
export const isDueByToday = (c: Pick<Chore, 'status' | 'due_date'>, today: string) => isOpen(c) && !!c.due_date && c.due_date <= today;

/** Earliest due first (no date last), then newest. */
export function byDue(a: Chore, b: Chore) {
  return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at);
}

export type DueGroup = 'today' | 'week' | 'later';
export const DUE_GROUP_TITLE: Record<DueGroup, string> = { today: 'Today', week: 'This week', later: 'Later' };

/**
 * Today = due today or overdue. This week = due later this week (weeks run Monday to Sunday).
 * Later = due after this week, or no due date.
 */
export function dueGroup(c: Pick<Chore, 'due_date'>, today: string): DueGroup {
  if (!c.due_date) return 'later';
  if (c.due_date <= today) return 'today';
  return c.due_date <= weekRange(today).end ? 'week' : 'later';
}

export function groupByDue<T extends Chore>(chores: T[], today: string) {
  const groups: Record<DueGroup, T[]> = { today: [], week: [], later: [] };
  for (const c of [...chores].sort(byDue)) groups[dueGroup(c, today)].push(c);
  return groups;
}
