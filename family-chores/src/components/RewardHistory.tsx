import type { Chore, Member } from '@/lib/types';
import { formatDateTime, formatReward } from '@/lib/format';
import { Avatar, Card, EmptyState } from './ui';

export function RewardHistory({ chores, kids, timeZone, emptyText = 'Rewards appear here when chores are approved.' }: { chores: Chore[]; kids?: Map<string, Member>; timeZone: string; emptyText?: string }) {
  const approved = chores.filter((c) => c.status === 'approved').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''));
  if (!approved.length) return <EmptyState title="No rewards yet">{emptyText}</EmptyState>;
  return (
    <Card className="divide-y divide-line">
      {approved.map((c) => {
        const k = kids?.get(c.assigned_to);
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            {k && <Avatar name={k.name} color={k.avatar_color} size={32} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title}</div>
              <div className="text-sm text-ink-3">{k ? `${k.name} · ` : ''}{c.approved_at ? formatDateTime(c.approved_at, timeZone) : ''}</div>
            </div>
            <span className="text-right text-sm font-semibold text-ok">{formatReward(c)}</span>
          </div>
        );
      })}
    </Card>
  );
}
