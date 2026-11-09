import type { Metadata } from 'next';
import { CheckCircle2, PartyPopper } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { isOpen, isOverdue, listChores } from '@/lib/data';
import { formatReward, todayIn, totalRewards } from '@/lib/format';
import { computeProgress } from '@/lib/progress';
import { dueGroup } from '@/lib/schedule';
import { ChildChoreCard } from '@/components/ChildChoreCard';
import { ChoreList, ChoreRow } from '@/components/ChoreRow';
import { DueGroups } from '@/components/DueGroups';
import { ProgressCard } from '@/components/ProgressCard';
import { RewardTiles } from '@/components/RewardTotals';
import { EmptyState, Notice, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Home' };

export default async function ChildHome(props: PageProps<'/child'>) {
  const { done } = await props.searchParams;
  const { supabase, member, household } = await requireRole('child');
  const chores = await listChores(supabase);
  const today = todayIn(household.time_zone);

  const open = chores.filter(isOpen);
  const todays = open.filter((c) => dueGroup(c, today) === 'today');
  const overdue = open.filter((c) => isOverdue(c, today)).length;
  const waiting = chores.filter((c) => c.status === 'submitted');
  const approved = chores.filter((c) => c.status === 'approved').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? '')).slice(0, 3);
  const doneChore = typeof done === 'string' ? chores.find((c) => c.id === done) : undefined;
  const progress = computeProgress(chores, household.time_zone, today);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold sm:text-[28px]">Hi {member.name}</h1>
        <p className="mt-1 text-ink-2">
          {todays.length ? `You have ${todays.length} ${todays.length === 1 ? 'chore' : 'chores'} for today.` : open.length ? 'Nothing due today.' : 'You’re all done for now.'}
          {overdue > 0 && <span className="font-medium text-danger"> {overdue} {overdue === 1 ? 'is' : 'are'} overdue.</span>}
        </p>
      </header>

      {doneChore && <Notice tone="ok">Handed in: {doneChore.title}. A parent will check it soon.</Notice>}

      <ProgressCard p={progress} name={member.name} />

      {open.length ? (
        <DueGroups chores={open} today={today} alwaysShowToday
          todayEmpty={<EmptyState icon={<CheckCircle2 size={24} />} title="Nothing due today">Have a look at what’s coming up below.</EmptyState>}
          render={(list) => <div className="grid gap-3 sm:grid-cols-2">{list.map((c) => <ChildChoreCard key={c.id} chore={c} today={today} />)}</div>} />
      ) : (
        <Section title="Today">
          <EmptyState icon={<PartyPopper size={24} />} title="All done!">You have no chores to do. New ones will appear here when a parent adds them.</EmptyState>
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Waiting for approval" count={waiting.length}>
          <ChoreList>{waiting.map((c) => <ChoreRow key={c.id} chore={c} today={today} href={`/child/chores/${c.id}`} />)}</ChoreList>
        </Section>
      )}

      {approved.length > 0 && (
        <Section title="Recently approved">
          <ChoreList>
            {approved.map((c) => <ChoreRow key={c.id} chore={c} today={today} href={`/child/chores/${c.id}`} />)}
          </ChoreList>
        </Section>
      )}

      <Section title="Rewards earned">
        <RewardTiles t={totalRewards(chores)} />
        {approved[0] && <p className="text-sm text-ink-3">Latest: {formatReward(approved[0])} for {approved[0].title}.</p>}
      </Section>
    </div>
  );
}
