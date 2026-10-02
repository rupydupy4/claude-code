import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { byDue, isOpen, listChores } from '@/lib/data';
import { todayIn } from '@/lib/format';
import { ChildChoreCard } from '@/components/ChildChoreCard';
import { ChoreList, ChoreRow } from '@/components/ChoreRow';
import { EmptyState, PageHeader, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'My Chores' };

export default async function MyChores() {
  const { supabase, household } = await requireRole('child');
  const chores = await listChores(supabase);
  const today = todayIn(household.time_zone);
  const open = chores.filter(isOpen).sort(byDue);
  const waiting = chores.filter((c) => c.status === 'submitted');
  const approved = chores.filter((c) => c.status === 'approved').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''));

  return (
    <div className="space-y-8">
      <PageHeader title="My Chores" />
      <Section title="To do" count={open.length}>
        {open.length ? <div className="grid gap-3 sm:grid-cols-2">{open.map((c) => <ChildChoreCard key={c.id} chore={c} today={today} />)}</div> : <EmptyState title="Nothing to do right now" />}
      </Section>
      <Section title="Waiting for approval" count={waiting.length}>
        {waiting.length ? <ChoreList>{waiting.map((c) => <ChoreRow key={c.id} chore={c} today={today} href={`/child/chores/${c.id}`} />)}</ChoreList> : <EmptyState title="Nothing waiting" />}
      </Section>
      <Section title="Approved" count={approved.length}>
        {approved.length ? <ChoreList>{approved.slice(0, 30).map((c) => <ChoreRow key={c.id} chore={c} today={today} href={`/child/chores/${c.id}`} />)}</ChoreList> : <EmptyState title="No approved chores yet" />}
      </Section>
    </div>
  );
}
