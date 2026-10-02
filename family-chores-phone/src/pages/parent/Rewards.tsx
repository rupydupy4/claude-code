import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { totalRewards } from '../../lib/format';
import { RewardHistory, RewardTiles } from '../../components/parts';
import { Avatar, PageHeader, Section, cx } from '../../components/ui';

export function ParentRewards() {
  const [sp] = useSearchParams();
  const members = useStore((s) => s.data.members);
  const chores = useStore((s) => s.data.chores);
  const kids = members.filter((m) => m.role === 'child');
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const child = kidById.has(sp.get('child') ?? '') ? sp.get('child')! : '';
  return (
    <div className="space-y-8">
      <PageHeader title="Rewards" subtitle="Recorded when you approve a chore. These are records only: no payments or screen-time controls." />
      <div className="grid gap-3 sm:grid-cols-2">
        {kids.map((k) => (
          <Link key={k.id} to={child === k.id ? '/parent/rewards' : `/parent/rewards?child=${k.id}`} aria-current={child === k.id ? 'true' : undefined}
            className={cx('block rounded-card border bg-card p-4', child === k.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong')}>
            <div className="mb-3 flex items-center gap-2.5"><Avatar name={k.name} color={k.avatarColor} size={32} /><span className="font-semibold">{k.name}</span></div>
            <RewardTiles t={totalRewards(chores.filter((c) => c.assignedTo === k.id))} />
          </Link>
        ))}
      </div>
      <Section title={child ? `${kidById.get(child)!.name}’s history` : 'History'} action={child ? <Link to="/parent/rewards" className="text-sm font-semibold text-accent">Show everyone</Link> : undefined}>
        <RewardHistory chores={child ? chores.filter((c) => c.assignedTo === child) : chores} kids={kidById} />
      </Section>
    </div>
  );
}
