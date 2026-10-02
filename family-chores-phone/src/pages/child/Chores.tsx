import { currentUser, useStore } from '../../lib/store';
import { byApproved, byDue, isOpen, today } from '../../lib/format';
import { ChildChoreCard, ChoreList, ChoreRow } from '../../components/parts';
import { EmptyState, PageHeader, Section } from '../../components/ui';

export function ChildChores() {
  const me = useStore((s) => currentUser(s))!;
  const all = useStore((s) => s.data.chores);
  const chores = all.filter((c) => c.assignedTo === me.id);
  const t = today();
  const open = chores.filter(isOpen).sort(byDue);
  const waiting = chores.filter((c) => c.status === 'submitted');
  const approved = chores.filter((c) => c.status === 'approved').sort(byApproved);
  return (
    <div className="space-y-8">
      <PageHeader title="My Chores" />
      <Section title="To do" count={open.length}>
        {open.length ? <div className="grid gap-3 sm:grid-cols-2">{open.map((c) => <ChildChoreCard key={c.id} chore={c} today={t} />)}</div> : <EmptyState title="Nothing to do right now" />}
      </Section>
      <Section title="Waiting for approval" count={waiting.length}>
        {waiting.length ? <ChoreList>{waiting.map((c) => <ChoreRow key={c.id} chore={c} today={t} to={`/child/chores/${c.id}`} />)}</ChoreList> : <EmptyState title="Nothing waiting" />}
      </Section>
      <Section title="Approved" count={approved.length}>
        {approved.length ? <ChoreList>{approved.slice(0, 30).map((c) => <ChoreRow key={c.id} chore={c} today={t} to={`/child/chores/${c.id}`} />)}</ChoreList> : <EmptyState title="No approved chores yet" />}
      </Section>
    </div>
  );
}
