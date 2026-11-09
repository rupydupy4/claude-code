import Link from 'next/link';
import { AlertCircle, ArrowRight, Repeat2, Star } from 'lucide-react';
import type { Chore } from '@/lib/types';
import { formatDue, formatReward } from '@/lib/format';
import { describeRepeat } from '@/lib/recurrence';
import { isOverdue } from '@/lib/schedule';
import { Card, StatusBadge, buttonClass, cx } from './ui';

/** A to-do chore for a child, with one obvious next step. */
export function ChildChoreCard({ chore, today }: { chore: Chore; today: string }) {
  const overdue = isOverdue(chore, today);
  const repeat = describeRepeat(chore.repeat, chore.repeat_days);
  return (
    <Card className={cx('p-4 sm:p-5', overdue && 'border-danger/50 ring-1 ring-danger/30')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold">{chore.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3">
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.points > 0 && <span className="inline-flex items-center gap-1 font-medium text-gold"><Star size={14} aria-hidden="true" />{chore.points} points</span>}
            {chore.due_date && (
              <span className={cx('inline-flex items-center gap-1', overdue && 'font-semibold text-danger')}>
                {overdue && <AlertCircle size={14} aria-hidden="true" />}{formatDue(chore.due_date, today)}
              </span>
            )}
            {repeat && <span className="inline-flex items-center gap-1"><Repeat2 size={14} aria-hidden="true" /><span className="sr-only">Repeats: </span>{repeat}</span>}
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
