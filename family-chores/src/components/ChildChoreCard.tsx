import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Chore } from '@/lib/types';
import { formatDue, formatReward } from '@/lib/format';
import { Card, StatusBadge, buttonClass, cx } from './ui';

/** A to-do chore for a child, with one obvious next step. */
export function ChildChoreCard({ chore, today }: { chore: Chore; today: string }) {
  const overdue = chore.due_date && chore.due_date < today;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold">{chore.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-3">
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.due_date && <span className={cx(overdue && 'font-medium text-danger')}>{formatDue(chore.due_date, today)}</span>}
          </div>
        </div>
        {chore.status === 'needs_changes' && <StatusBadge status="needs_changes" />}
      </div>
      {chore.status === 'needs_changes' && chore.feedback && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">“{chore.feedback}”</p>}
      <Link href={`/child/chores/${chore.id}`} className={cx(buttonClass(chore.status === 'needs_changes' ? 'secondary' : 'primary'), 'mt-4 w-full')}>
        {chore.status === 'needs_changes' ? 'Fix and hand in again' : 'Open and mark as done'}<ArrowRight size={18} aria-hidden="true" />
      </Link>
    </Card>
  );
}
