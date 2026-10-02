import { currentUser, useStore } from '../../lib/store';
import { totalRewards } from '../../lib/format';
import { RewardHistory, RewardTiles } from '../../components/parts';
import { PageHeader, Section } from '../../components/ui';

export function ChildRewards() {
  const me = useStore((s) => currentUser(s))!;
  const all = useStore((s) => s.data.chores);
  const chores = all.filter((c) => c.assignedTo === me.id);
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
      <Section title="History"><RewardHistory chores={chores} emptyText="Finish a chore and get it approved to earn your first reward." /></Section>
    </div>
  );
}
