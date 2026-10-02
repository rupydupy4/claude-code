import Link from 'next/link';
import { Camera, ChevronRight } from 'lucide-react';
import type { Chore, Member } from '@/lib/types';
import { formatDue, formatReward } from '@/lib/format';
import { Avatar, StatusBadge, cx } from './ui';

export function ChoreList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">{children}</ul>;
}

/** One chore in a list. Parents see who it's for; children see their own. */
export function ChoreRow({ chore, href, child, today, showStatus = true }: { chore: Chore; href: string; child?: Member; today: string; showStatus?: boolean }) {
  const overdue = chore.due_date && chore.due_date < today && (chore.status === 'assigned' || chore.status === 'needs_changes');
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] focus-visible:bg-black/[0.03]">
        {child && <Avatar name={child.name} color={child.avatar_color} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{chore.title}</span>
            {showStatus && <StatusBadge status={chore.status} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
            {child && <span>{child.name}</span>}
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.due_date && chore.status !== 'approved' && <span className={cx(overdue && 'font-medium text-danger')}>{formatDue(chore.due_date, today)}</span>}
            {chore.photo_path && <span className="inline-flex items-center gap-1"><Camera size={14} aria-hidden="true" />Photo</span>}
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
      </Link>
    </li>
  );
}
