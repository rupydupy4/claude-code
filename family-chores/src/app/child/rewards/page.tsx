import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { listChores } from '@/lib/data';
import { totalRewards } from '@/lib/format';
import { RewardHistory } from '@/components/RewardHistory';
import { RewardTiles } from '@/components/RewardTotals';
import { PageHeader, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Rewards' };

export default async function ChildRewards() {
  const { supabase, household } = await requireRole('child');
  const chores = await listChores(supabase);
  const t = totalRewards(chores);
  return (
    <div className="space-y-8">
      <PageHeader title="Rewards" subtitle="Everything you’ve earned from approved chores." />
      <RewardTiles t={t} />
      {t.custom.length > 0 && (
        <Section title="Other rewards">
          <ul className="flex flex-wrap gap-2">{t.custom.map((r, i) => <li key={i} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong">{r}</li>)}</ul>
        </Section>
      )}
      <Section title="History"><RewardHistory chores={chores} timeZone={household.time_zone} emptyText="Finish a chore and get it approved to earn your first reward." /></Section>
    </div>
  );
}
