import Link from 'next/link';
import { AlertCircle, Camera, ChevronRight, Repeat2, Star } from 'lucide-react';
import type { Chore, Member } from '@/lib/types';
import { formatDue, formatReward } from '@/lib/format';
import { describeRepeat } from '@/lib/recurrence';
import { isOverdue } from '@/lib/schedule';
import { Avatar, StatusBadge, cx } from './ui';

export function ChoreList({ children, label }: { children: React.ReactNode; label?: string }) {
  return <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">{children}</ul>;
}

/** One chore in a list. Parents see who it's for; children see their own. */
export function ChoreRow({ chore, href, child, today, showStatus = true }: { chore: Chore; href: string; child?: Member; today: string; showStatus?: boolean }) {
  const overdue = isOverdue(chore, today);
  const repeat = describeRepeat(chore.repeat, chore.repeat_days);
  return (
    <li className={cx(overdue && 'border-l-4 border-l-danger')}>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink/[0.03] focus-visible:bg-ink/[0.04]">
        {child && <Avatar name={child.name} color={child.avatar_color} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{chore.title}</span>
            {showStatus && <StatusBadge status={chore.status} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
            {child && <span>{child.name}</span>}
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.points > 0 && <span className="inline-flex items-center gap-1"><Star size={13} aria-hidden="true" />{chore.points} pts</span>}
            {chore.due_date && chore.status !== 'approved' && (
              <span className={cx('inline-flex items-center gap-1', overdue && 'font-semibold text-danger')}>
                {overdue && <AlertCircle size={14} aria-hidden="true" />}{formatDue(chore.due_date, today)}
              </span>
            )}
            {repeat && <span className="inline-flex items-center gap-1"><Repeat2 size={14} aria-hidden="true" /><span className="sr-only">Repeats: </span>{repeat}</span>}
            {chore.photo_path && <span className="inline-flex items-center gap-1"><Camera size={14} aria-hidden="true" />Photo</span>}
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
      </Link>
    </li>
  );
}
