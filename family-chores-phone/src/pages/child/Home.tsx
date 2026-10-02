import { CheckCircle2 } from 'lucide-react';
import { currentUser, useStore } from '../../lib/store';
import { byApproved, byDue, formatReward, isOpen, today, totalRewards } from '../../lib/format';
import { ChildChoreCard, ChoreList, ChoreRow, Flash, RewardTiles } from '../../components/parts';
import { EmptyState, Section } from '../../components/ui';

export function ChildHome() {
  const me = useStore((s) => currentUser(s))!;
  const all = useStore((s) => s.data.chores);
  const chores = all.filter((c) => c.assignedTo === me.id);
  const t = today();
  const open = chores.filter(isOpen).sort(byDue);
  const todays = open.filter((c) => c.dueDate && c.dueDate <= t);
  const later = open.filter((c) => !c.dueDate || c.dueDate > t);
  const waiting = chores.filter((c) => c.status === 'submitted');
  const approved = chores.filter((c) => c.status === 'approved').sort(byApproved).slice(0, 3);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold sm:text-[28px]">Hi {me.name}</h1>
        <p className="mt-1 text-ink-2">{todays.length ? `You have ${todays.length} ${todays.length === 1 ? 'chore' : 'chores'} for today.` : open.length ? 'Nothing due today.' : 'You’re all done for now.'}</p>
      </header>
      <Flash />
      <Section title="Today" count={todays.length}>
        {todays.length ? <div className="grid gap-3 sm:grid-cols-2">{todays.map((c) => <ChildChoreCard key={c.id} chore={c} today={t} />)}</div> : <EmptyState icon={<CheckCircle2 size={24} />} title="Nothing due today" />}
      </Section>
      {later.length > 0 && (
        <Section title="Still to do" count={later.length}>
          <div className="grid gap-3 sm:grid-cols-2">{later.map((c) => <ChildChoreCard key={c.id} chore={c} today={t} />)}</div>
        </Section>
      )}
      {waiting.length > 0 && (
        <Section title="Waiting for approval" count={waiting.length}>
          <ChoreList>{waiting.map((c) => <ChoreRow key={c.id} chore={c} today={t} to={`/child/chores/${c.id}`} />)}</ChoreList>
        </Section>
      )}
      {approved.length > 0 && (
        <Section title="Recently approved">
          <ChoreList>{approved.map((c) => <ChoreRow key={c.id} chore={c} today={t} to={`/child/chores/${c.id}`} />)}</ChoreList>
        </Section>
      )}
      <Section title="Rewards earned">
        <RewardTiles t={totalRewards(chores)} />
        {approved[0] && <p className="text-sm text-ink-3">Latest: {formatReward(approved[0])} for {approved[0].title}.</p>}
      </Section>
    </div>
  );
}
