import { Link, useSearchParams } from 'react-router-dom';
import { rewardBalance, useStore } from '../../lib/store';
import { RewardBalanceCard, RewardHistory } from '../../components/parts';
import { PageHeader, Section, TextLink, cx } from '../../components/ui';

export function ParentRewards() {
  const [sp] = useSearchParams();
  const members = useStore((s) => s.data.members);
  const chores = useStore((s) => s.data.chores);
  const kids = members.filter((m) => m.role === 'child');
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const child = kidById.has(sp.get('child') ?? '') ? sp.get('child')! : '';
  return (
    <div className="space-y-8">
      <PageHeader title="Rewards" subtitle="Recorded when you approve a chore. Mark them as paid out when you hand them over. Records only: no payments or screen-time controls." />
      <Section title="To hand over">
        <div className="grid gap-3 sm:grid-cols-2">
          {kids.map((k) => <RewardBalanceCard key={k.id} child={k} b={rewardBalance(chores.filter((c) => c.assignedTo === k.id))} />)}
        </div>
      </Section>
      {kids.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show history for">
          {[{ id: '', name: 'Everyone' }, ...kids].map((k) => (
            <Link key={k.id || 'all'} to={k.id ? `/parent/rewards?child=${k.id}` : '/parent/rewards'} replace aria-current={child === k.id ? 'true' : undefined}
              className={cx('inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium', child === k.id ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong text-ink-2')}>{k.name}</Link>
          ))}
        </div>
      )}
      <Section title={child ? `${kidById.get(child)!.name}’s history` : 'History'} action={child ? <TextLink to="/parent/rewards">Show everyone</TextLink> : undefined}>
        <RewardHistory chores={child ? chores.filter((c) => c.assignedTo === child) : chores} kids={kidById} />
      </Section>
    </div>
  );
}
