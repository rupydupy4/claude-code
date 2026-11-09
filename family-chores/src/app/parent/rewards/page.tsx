import Link from 'next/link';
import type { Metadata } from 'next';
import { UserPlus } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { listChildren, listChores } from '@/lib/data';
import { totalRewards } from '@/lib/format';
import { rewardBalance } from '@/lib/progress';
import { RewardBalanceCard } from '@/components/RewardBalances';
import { RewardHistory } from '@/components/RewardHistory';
import { RewardTiles } from '@/components/RewardTotals';
import { Avatar, ButtonLink, EmptyState, Notice, PageHeader, Section, cx } from '@/components/ui';

export const metadata: Metadata = { title: 'Rewards' };

export default async function ParentRewards(props: PageProps<'/parent/rewards'>) {
  const sp = await props.searchParams;
  const { supabase, household } = await requireRole('parent');
  const [chores, kids] = await Promise.all([listChores(supabase), listChildren(supabase)]);
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const child = typeof sp.child === 'string' && kidById.has(sp.child) ? sp.child : '';
  const shown = child ? chores.filter((c) => c.assigned_to === child) : chores;

  return (
    <div className="space-y-8">
      <PageHeader title="Rewards" subtitle="Recorded when you approve a chore. These are records only: no payments or screen-time controls." />
      {sp.paid === 'ok' && <Notice tone="ok">Marked as paid out.</Notice>}
      {sp.paid === 'error' && <Notice tone="danger">That couldn’t be marked as paid out. It may already have been. Please check and try again.</Notice>}

      {kids.length === 0 ? (
        <EmptyState title="No children yet" action={<ButtonLink href="/parent/children#add" size="sm"><UserPlus size={16} aria-hidden="true" />Add a child</ButtonLink>}>
          Rewards appear here once your children’s chores are approved.
        </EmptyState>
      ) : (
        <>
          <Section title="Earned in total">
            <div className="grid gap-3 sm:grid-cols-2">
              {kids.map((k) => (
                <Link key={k.id} href={child === k.id ? '/parent/rewards' : `/parent/rewards?child=${k.id}`} aria-current={child === k.id ? 'true' : undefined}
                  aria-label={`${k.name}: ${child === k.id ? 'show everyone' : 'show only their history'}`}
                  className={cx('block rounded-card border bg-card p-4', child === k.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong')}>
                  <div className="mb-3 flex items-center gap-2.5"><Avatar name={k.name} color={k.avatar_color} size={32} /><span className="font-semibold">{k.name}</span></div>
                  <RewardTiles t={totalRewards(chores.filter((c) => c.assigned_to === k.id))} />
                </Link>
              ))}
            </div>
          </Section>

          <Section title="To hand over">
            <div className="grid gap-3 sm:grid-cols-2">
              {kids.map((k) => <RewardBalanceCard key={k.id} child={k} b={rewardBalance(chores.filter((c) => c.assigned_to === k.id))} returnTo="/parent/rewards" />)}
            </div>
          </Section>
        </>
      )}

      <Section title={child ? `${kidById.get(child)!.name}’s history` : 'History'} action={child ? <Link href="/parent/rewards" className="text-sm font-semibold text-accent">Show everyone</Link> : undefined}>
        <RewardHistory chores={shown} kids={kidById} timeZone={household.time_zone} />
      </Section>
    </div>
  );
}
