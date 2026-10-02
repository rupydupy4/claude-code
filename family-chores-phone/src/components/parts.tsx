import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Camera, ChevronRight } from 'lucide-react';
import type { AvatarColor, Chore, Member } from '../lib/types';
import { AVATAR_COLORS } from '../lib/types';
import { formatDateTime, formatDue, formatMinutes, formatMoney, formatReward, byApproved, type RewardTotals } from '../lib/format';
import { getPhoto } from '../lib/photos';
import { AVATAR_BG, Avatar, Card, EmptyState, Notice, StatusBadge, buttonClass, cx } from './ui';

/** One-off success message passed through navigation state. */
export function Flash() {
  const { state } = useLocation() as { state: { notice?: string } | null };
  return state?.notice ? <Notice tone="ok">{state.notice}</Notice> : null;
}

export function ChoreList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">{children}</ul>;
}

export function ChoreRow({ chore, to, child, today, showStatus = true }: { chore: Chore; to: string; child?: Member; today: string; showStatus?: boolean }) {
  const overdue = chore.dueDate && chore.dueDate < today && (chore.status === 'assigned' || chore.status === 'needs_changes');
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02]">
        {child && <Avatar name={child.name} color={child.avatarColor} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{chore.title}</span>
            {showStatus && <StatusBadge status={chore.status} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
            {child && <span>{child.name}</span>}
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.dueDate && chore.status !== 'approved' && <span className={cx(overdue && 'font-medium text-danger')}>{formatDue(chore.dueDate, today)}</span>}
            {chore.hasPhoto && <span className="inline-flex items-center gap-1"><Camera size={14} aria-hidden="true" />Photo</span>}
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** A to-do chore for a child, with one obvious next step. */
export function ChildChoreCard({ chore, today }: { chore: Chore; today: string }) {
  const overdue = chore.dueDate && chore.dueDate < today;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold">{chore.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-3">
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.dueDate && <span className={cx(overdue && 'font-medium text-danger')}>{formatDue(chore.dueDate, today)}</span>}
          </div>
        </div>
        {chore.status === 'needs_changes' && <StatusBadge status="needs_changes" />}
      </div>
      {chore.status === 'needs_changes' && chore.feedback && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">“{chore.feedback}”</p>}
      <Link to={`/child/chores/${chore.id}`} className={cx(buttonClass(chore.status === 'needs_changes' ? 'secondary' : 'primary'), 'mt-4 w-full')}>
        {chore.status === 'needs_changes' ? 'Fix and hand in again' : 'Open and mark as done'}<ArrowRight size={18} aria-hidden="true" />
      </Link>
    </Card>
  );
}

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

export function RewardHistory({ chores, kids, emptyText = 'Rewards appear here when chores are approved.' }: { chores: Chore[]; kids?: Map<string, Member>; emptyText?: string }) {
  const approved = chores.filter((c) => c.status === 'approved').sort(byApproved);
  if (!approved.length) return <EmptyState title="No rewards yet">{emptyText}</EmptyState>;
  return (
    <Card className="divide-y divide-line">
      {approved.map((c) => {
        const k = kids?.get(c.assignedTo);
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            {k && <Avatar name={k.name} color={k.avatarColor} size={32} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title}</div>
              <div className="text-sm text-ink-3">{k ? `${k.name} · ` : ''}{c.approvedAt ? formatDateTime(c.approvedAt) : ''}</div>
            </div>
            <span className="text-right text-sm font-semibold text-ok">{formatReward(c)}</span>
          </div>
        );
      })}
    </Card>
  );
}

export function ColorPicker({ value, onChange }: { value: AvatarColor; onChange: (c: AvatarColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Avatar colour" className="flex flex-wrap gap-2">
      {AVATAR_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className={cx('h-9 w-9 rounded-full ring-offset-2', AVATAR_BG[c], value === c ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-strong')} />
      ))}
    </div>
  );
}

/** Inline "are you sure?" step for destructive actions. */
export function ConfirmButton({ onConfirm, label, confirmText, confirmLabel = 'Delete' }: { onConfirm: () => void | Promise<void>; label: string; confirmText: string; confirmLabel?: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) return <button type="button" className={buttonClass('danger', 'sm')} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft p-3" role="group" aria-label="Confirm">
      <span className="mr-auto text-sm font-medium text-danger">{confirmText}</span>
      <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setAsking(false)}>Cancel</button>
      <button type="button" disabled={busy} className={cx(buttonClass('danger', 'sm'), '!bg-danger !text-white')} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>{confirmLabel}</button>
    </div>
  );
}

/** A photo stored on this device. */
export function StoredPhoto({ choreId, alt, className }: { choreId: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    getPhoto(choreId).then(
      (blob) => {
        if (!live) return;
        if (!blob) return setMissing(true);
        made = URL.createObjectURL(blob);
        setUrl(made);
      },
      () => live && setMissing(true),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [choreId]);
  if (missing) return <p className="text-sm text-ink-3">The photo isn’t available on this device.</p>;
  if (!url) return <div className={cx('animate-pulse rounded-xl bg-black/[0.04]', 'h-48')} aria-label="Loading photo" />;
  return <img src={url} alt={alt} className={className} />;
}
