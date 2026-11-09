import { Clock, Euro, Gift } from 'lucide-react';
import type { Balance } from '@/lib/progress';
import { formatMinutes, formatMoney } from '@/lib/format';
import type { Member } from '@/lib/types';
import { PayoutButton } from './PayoutButton';
import { Avatar, Card } from './ui';

/**
 * One child's rewards: what's still owed (approved, not yet handed over), with a "mark as paid
 * out" action per type, and what has already been paid out.
 */
export function RewardBalanceCard({ child, b, returnTo }: { child: Member; b: Balance; returnTo: '/parent' | '/parent/rewards' }) {
  const rows: { key: string; icon: typeof Euro; label: string; value: string; button?: React.ReactNode }[] = [];
  if (b.owed.moneyCents) {
    const v = formatMoney(b.owed.moneyCents);
    rows.push({ key: 'money', icon: Euro, label: 'Money', value: v, button: <PayoutButton childId={child.id} childName={child.name} type="money" what={v} returnTo={returnTo} /> });
  }
  if (b.owed.screenMinutes) {
    const v = `${formatMinutes(b.owed.screenMinutes)} screen time`;
    rows.push({ key: 'screen', icon: Clock, label: 'Screen time', value: formatMinutes(b.owed.screenMinutes), button: <PayoutButton childId={child.id} childName={child.name} type="screen_time" what={v} returnTo={returnTo} /> });
  }
  for (const c of b.owed.custom) {
    rows.push({ key: c.id, icon: Gift, label: c.title, value: c.reward_note ?? 'Reward', button: <PayoutButton childId={child.id} childName={child.name} type="custom" choreId={c.id} what={`“${c.reward_note}”`} returnTo={returnTo} /> });
  }
  const paid = [
    b.paid.moneyCents ? formatMoney(b.paid.moneyCents) : null,
    b.paid.screenMinutes ? `${formatMinutes(b.paid.screenMinutes)} screen time` : null,
    b.paid.customCount ? `${b.paid.customCount} other ${b.paid.customCount === 1 ? 'reward' : 'rewards'}` : null,
  ].filter(Boolean);

  return (
    <Card className="p-4" role="region" aria-label={`${child.name}’s rewards`}>
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar name={child.name} color={child.avatar_color} size={32} />
        <span className="font-semibold">{child.name}</span>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <r.icon size={17} className="shrink-0 text-ink-3" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink-3">{r.label} <span className="sr-only">owed</span></div>
                <div className="font-semibold tabular">{r.value}</div>
              </div>
              {r.button}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-ink/[0.03] px-3 py-2.5 text-sm text-ink-2">Nothing owed right now.</p>
      )}
      <p className="mt-3 text-xs text-ink-3">Paid out so far: <span className="tabular">{paid.length ? paid.join(' · ') : 'nothing yet'}</span></p>
    </Card>
  );
}
