import type { RewardTotals } from '@/lib/format';
import { formatMinutes, formatMoney } from '@/lib/format';

/** Compact "€7 · 30 min · 1 custom" summary. */
export function RewardSummary({ t, empty = 'No rewards yet' }: { t: RewardTotals; empty?: string }) {
  const parts = [
    t.moneyCents ? formatMoney(t.moneyCents) : null,
    t.screenMinutes ? `${formatMinutes(t.screenMinutes)} screen time` : null,
    t.custom.length ? `${t.custom.length} other ${t.custom.length === 1 ? 'reward' : 'rewards'}` : null,
  ].filter(Boolean);
  return <span className="tabular">{parts.length ? parts.join(' · ') : empty}</span>;
}

export function RewardTiles({ t }: { t: RewardTotals }) {
  const tiles = [
    { label: 'Money', value: formatMoney(t.moneyCents) },
    { label: 'Screen time', value: t.screenMinutes ? formatMinutes(t.screenMinutes) : '0 min' },
    { label: 'Other rewards', value: String(t.custom.length) },
  ];
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line">
      {tiles.map((x) => (
        <div key={x.label} className="bg-card px-4 py-4">
          <div className="text-xl font-semibold tabular sm:text-2xl">{x.value}</div>
          <div className="mt-0.5 text-xs font-medium text-ink-3 sm:text-sm">{x.label}</div>
        </div>
      ))}
    </div>
  );
}
