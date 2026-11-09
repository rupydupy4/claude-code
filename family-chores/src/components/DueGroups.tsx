import type { ReactNode } from 'react';
import { DUE_GROUP_TITLE, groupByDue, isOverdue, type DueGroup } from '@/lib/schedule';
import type { Chore } from '@/lib/types';
import { Section } from './ui';

/**
 * Shows chores in Today / This week / Later sections. Empty groups are hidden, except Today
 * when `alwaysShowToday` is set (it then shows `todayEmpty`).
 */
export function DueGroups({ chores, today, render, alwaysShowToday, todayEmpty }: {
  chores: Chore[]; today: string; render: (list: Chore[], group: DueGroup) => ReactNode; alwaysShowToday?: boolean; todayEmpty?: ReactNode;
}) {
  const groups = groupByDue(chores, today);
  return (
    <>
      {(['today', 'week', 'later'] as const).map((g) => {
        const list = groups[g];
        if (!list.length && !(g === 'today' && alwaysShowToday)) return null;
        const overdue = g === 'today' ? list.filter((c) => isOverdue(c, today)).length : 0;
        return (
          <Section key={g} title={DUE_GROUP_TITLE[g]} count={list.length}
            action={overdue ? <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger">{overdue} overdue</span> : undefined}>
            {list.length ? render(list, g) : todayEmpty}
          </Section>
        );
      })}
    </>
  );
}
