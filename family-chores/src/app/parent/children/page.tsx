import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { listChildren, listChores } from '@/lib/data';
import { totalRewards } from '@/lib/format';
import { removeChild } from '@/app/actions/parent';
import { AddChildForm, EditChildForm } from '@/components/ChildForms';
import { ConfirmButton } from '@/components/ConfirmButton';
import { RewardSummary } from '@/components/RewardTotals';
import { Avatar, Card, Notice, PageHeader, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Children' };

export default async function ChildrenPage(props: PageProps<'/parent/children'>) {
  const { removed } = await props.searchParams;
  const { supabase, household } = await requireRole('parent');
  const [kids, chores] = await Promise.all([listChildren(supabase), listChores(supabase)]);

  return (
    <div className="space-y-8">
      <PageHeader title="Children" subtitle="Add your children and manage how they sign in." />
      {removed && <Notice tone="ok">Child removed, with their chores and photos.</Notice>}

      <Card className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Household code</h2>
          <p className="text-sm text-ink-2">Children sign in at <span className="font-medium">“I’m a child”</span> with this code, their first name and their PIN.</p>
        </div>
        <div className="font-mono text-2xl font-semibold tracking-[0.25em] text-accent-strong" aria-label={`Household code ${household.join_code.split('').join(' ')}`}>{household.join_code}</div>
      </Card>

      <Section title="Your children" count={kids.length}>
        {kids.length ? (
          <div className="space-y-3">
            {kids.map((k) => {
              const mine = chores.filter((c) => c.assigned_to === k.id);
              return (
                <Card key={k.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={k.name} color={k.avatar_color} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{k.name}</div>
                      <div className="text-sm text-ink-3">
                        {mine.filter((c) => c.status !== 'approved').length} active chores · <RewardSummary t={totalRewards(mine)} empty="no rewards yet" />
                      </div>
                    </div>
                    <Link href={`/parent/chores/new?child=${k.id}`} className="text-sm font-semibold text-accent">New chore</Link>
                    <EditChildForm child={k} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <ConfirmButton action={removeChild} fields={{ id: k.id }} label="Remove" confirmLabel="Remove" confirmText={`Remove ${k.name}? Their chores, rewards and photos will be deleted.`} />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-ink-2">No children yet. Add the first one below.</p>
        )}
      </Section>

      <section id="add" className="scroll-mt-24">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">Add a child</h2>
          <p className="mb-5 text-sm text-ink-2">Only a first name is needed.</p>
          <AddChildForm />
        </Card>
      </section>
    </div>
  );
}
