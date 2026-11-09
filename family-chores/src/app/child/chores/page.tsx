import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { isOpen, listChores } from '@/lib/data';
import { todayIn } from '@/lib/format';
import { ChildChoreCard } from '@/components/ChildChoreCard';
import { ChoreList, ChoreRow } from '@/components/ChoreRow';
import { DueGroups } from '@/components/DueGroups';
import { EmptyState, PageHeader, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'My Chores' };

export default async function MyChores() {
  const { supabase, household } = await requireRole('child');
  const chores = await listChores(supabase);
  const today = todayIn(household.time_zone);
  const open = chores.filter(isOpen);
  const waiting = chores.filter((c) => c.status === 'submitted');
  const approved = chores.filter((c) => c.status === 'approved').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''));

  return (
    <div className="space-y-8">
      <PageHeader title="My Chores" subtitle={open.length ? `${open.length} to do` : undefined} />
      {open.length ? (
        <DueGroups chores={open} today={today}
          render={(list) => <div className="grid gap-3 sm:grid-cols-2">{list.map((c) => <ChildChoreCard key={c.id} chore={c} today={today} />)}</div>} />
      ) : (
        <Section title="To do"><EmptyState icon={<CheckCircle2 size={24} />} title="Nothing to do right now">New chores from a parent will show up here.</EmptyState></Section>
      )}
      <Section title="Waiting for approval" count={waiting.length}>
        {waiting.length ? <ChoreList>{waiting.map((c) => <ChoreRow key={c.id} chore={c} today={today} href={`/child/chores/${c.id}`} />)}</ChoreList> : <EmptyState title="Nothing waiting">Chores you hand in wait here until a parent checks them.</EmptyState>}
      </Section>
      <Section title="Approved" count={approved.length}>
        {approved.length ? <ChoreList>{approved.slice(0, 30).map((c) => <ChoreRow key={c.id} chore={c} today={today} href={`/child/chores/${c.id}`} />)}</ChoreList> : <EmptyState title="No approved chores yet">Finish a chore and get it approved to earn points and rewards.</EmptyState>}
      </Section>
    </div>
  );
}
