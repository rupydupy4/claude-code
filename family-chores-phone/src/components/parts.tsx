import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, ArrowRight, Camera, Check, ChevronRight, Clock, Euro, Flame, Gift, Repeat2, Star, Trophy } from 'lucide-react';
import type { AvatarColor, Chore, Member, RewardType } from '../lib/types';
import { AVATAR_COLORS } from '../lib/types';
import { byApproved, describeRepeat, formatDateTime, formatDue, formatMinutes, formatMoney, formatReward, type RewardTotals } from '../lib/format';
import { DUE_GROUP_TITLE, POINTS_PER_LEVEL, groupByDue, isOverdue, markPaidOut, type Balance, type DueGroup, type Progress } from '../lib/store';
import { getPhoto } from '../lib/photos';
import { tap } from '../lib/native';
import { message } from './forms';
import { AVATAR_BG, Avatar, Card, EmptyState, Notice, ProgressBar, Section, StatusBadge, buttonClass, cx } from './ui';

/** One-off success message passed through navigation state. */
export function Flash() {
  const { state } = useLocation() as { state: { notice?: string } | null };
  return state?.notice ? <Notice tone="ok">{state.notice}</Notice> : null;
}

export function ChoreList({ children, label }: { children: ReactNode; label?: string }) {
  return <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card">{children}</ul>;
}

function OverdueOrDue({ chore, today }: { chore: Chore; today: string }) {
  if (!chore.dueDate || chore.status === 'approved') return null;
  const overdue = isOverdue(chore, today);
  return (
    <span className={cx('inline-flex items-center gap-1', overdue && 'font-semibold text-danger')}>
      {overdue && <AlertCircle size={14} aria-hidden="true" />}{formatDue(chore.dueDate, today)}
    </span>
  );
}

function RepeatLabel({ chore }: { chore: Chore }) {
  const repeat = describeRepeat(chore.repeat, chore.repeatDays);
  if (!repeat) return null;
  return <span className="inline-flex items-center gap-1"><Repeat2 size={14} aria-hidden="true" /><span className="sr-only">Repeats: </span>{repeat}</span>;
}

/** One chore in a list. Parents see who it's for; children see their own. Overdue chores get a red edge. */
export function ChoreRow({ chore, to, child, today, showStatus = true }: { chore: Chore; to: string; child?: Member; today: string; showStatus?: boolean }) {
  const overdue = isOverdue(chore, today);
  return (
    <li className={cx(overdue && 'border-l-4 border-l-danger')}>
      <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-3.5 hover:bg-ink/[0.03] active:bg-ink/[0.05]">
        {child && <Avatar name={child.name} color={child.avatarColor} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{chore.title}</span>
            {showStatus && <StatusBadge status={chore.status} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
            {child && <span>{child.name}</span>}
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.points > 0 && <span className="inline-flex items-center gap-1"><Star size={13} aria-hidden="true" />{chore.points} pts</span>}
            <OverdueOrDue chore={chore} today={today} />
            <RepeatLabel chore={chore} />
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
  const overdue = isOverdue(chore, today);
  return (
    <Card className={cx('p-4 sm:p-5', overdue && 'border-danger/50 border-l-4 border-l-danger')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold">{chore.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-3">
            <span className="font-medium text-ink-2">{formatReward(chore)}</span>
            {chore.points > 0 && <span className="inline-flex items-center gap-1"><Star size={13} aria-hidden="true" />{chore.points} pts</span>}
            <OverdueOrDue chore={chore} today={today} />
            <RepeatLabel chore={chore} />
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

/**
 * Chores in Today / This week / Later sections. Empty groups are hidden, except Today when
 * `alwaysShowToday` is set (it then shows `todayEmpty`).
 */
export function DueGroups({ chores, today, render, alwaysShowToday, todayEmpty }: {
  chores: Chore[]; today: string; render: (list: Chore[], group: DueGroup) => ReactNode; alwaysShowToday?: boolean; todayEmpty?: ReactNode;
}) {
  const groups = groupByDue(chores, today);
  return (
    <>
      {(['today', 'week', 'later'] as const).map((g) => {
        const list = groups[g];
        if (!list.length && !(g === 'today' && alwaysShowToday)) return null;
        const overdue = g === 'today' ? list.filter((c) => isOverdue(c, today)).length : 0;
        return (
          <Section key={g} title={DUE_GROUP_TITLE[g]} count={list.length}
            action={overdue ? <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger">{overdue} overdue</span> : undefined}>
            {list.length ? render(list, g) : todayEmpty}
          </Section>
        );
      })}
    </>
  );
}

function streakMessage(p: Progress) {
  if (p.streak === 0) return p.bestStreak ? `Your best was ${p.bestStreak} ${p.bestStreak === 1 ? 'day' : 'days'}. Get a chore approved to start a new streak!` : 'Get a chore approved to start your streak!';
  if (!p.doneToday) return 'Hand in a chore today to keep your streak going.';
  if (p.streak >= p.bestStreak && p.streak > 1) return 'That’s your best streak yet. Brilliant!';
  return 'Nice work today. Keep it up!';
}

/** The child's points, level and streak, in friendly words. */
export function ProgressCard({ p, name }: { p: Progress; name: string }) {
  const toNext = POINTS_PER_LEVEL - p.levelPoints;
  return (
    <Card className="overflow-hidden" role="region" aria-labelledby="progress-title">
      <div className="bg-accent-soft px-5 py-4">
        <h2 id="progress-title" className="flex items-center gap-2 text-[17px] font-semibold text-accent-strong">
          <Trophy size={20} aria-hidden="true" />Level {p.level}
        </h2>
        <p className="mt-0.5 text-sm text-accent-strong">{name}, you’re {toNext} {toNext === 1 ? 'point' : 'points'} away from level {p.level + 1}.</p>
        <div className="mt-3"><ProgressBar value={p.levelPoints} max={POINTS_PER_LEVEL} label={`Progress to level ${p.level + 1}`} /></div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-line">
        <div className="px-4 py-4">
          <dt className="text-xs font-medium text-ink-3 sm:text-sm">Points</dt>
          <dd className="mt-0.5 flex items-center gap-1 text-xl font-semibold tabular sm:text-2xl"><Star size={18} className="text-gold" aria-hidden="true" />{p.points}</dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-xs font-medium text-ink-3 sm:text-sm">This week</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular sm:text-2xl">+{p.pointsThisWeek}</dd>
        </div>
        <div className="px-4 py-4">
          <dt className="text-xs font-medium text-ink-3 sm:text-sm">Streak</dt>
          <dd className="mt-0.5 flex items-center gap-1 text-xl font-semibold tabular sm:text-2xl">
            <Flame size={18} className={p.streak ? 'text-gold' : 'text-ink-3'} aria-hidden="true" />{p.streak}<span className="sr-only"> {p.streak === 1 ? 'day' : 'days'}</span>
          </dd>
        </div>
      </dl>
      <p className="border-t border-line px-5 py-3 text-sm text-ink-2">{streakMessage(p)}</p>
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
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line">
      {tiles.map((x) => (
        <div key={x.label} className="flex flex-col-reverse bg-card px-4 py-4">
          <dt className="mt-0.5 text-xs font-medium text-ink-3 sm:text-sm">{x.label}</dt>
          <dd className="text-xl font-semibold tabular sm:text-2xl">{x.value}</dd>
        </div>
      ))}
    </dl>
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
            <div className="text-right">
              <div className="text-sm font-semibold text-ok">{formatReward(c)}</div>
              <div className="text-xs text-ink-3">{c.paidAt ? 'Paid out' : 'Not paid out yet'}</div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/** "Mark as paid out" with an inline confirm step. A record in the app only: no money moves. */
function PayoutButton({ child, type, what, choreId, onDone }: { child: Member; type: RewardType; what: string; choreId?: string; onDone: (msg: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  if (!asking) {
    return (
      <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setAsking(true)} aria-label={`Mark ${what} as paid out to ${child.name}`}>
        <Check size={15} aria-hidden="true" />Mark as paid out
      </button>
    );
  }
  const confirm = () => {
    try {
      markPaidOut(child.id, type, choreId);
      tap();
      onDone(`Marked ${what} as paid out to ${child.name}.`);
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-accent-soft p-3" role="group" aria-label="Confirm payout">
      <span className="mr-auto text-sm font-medium text-accent-strong">{error || `Have you given ${child.name} ${what}?`}</span>
      <button type="button" data-back-cancel className={buttonClass('ghost', 'sm')} onClick={() => setAsking(false)}>Cancel</button>
      <button type="button" className={buttonClass('primary', 'sm')} onClick={confirm}>Yes, paid out</button>
    </div>
  );
}

/**
 * One child's rewards: what's still owed (approved, not yet handed over), with a "mark as paid
 * out" action per type, and what has already been paid out.
 */
export function RewardBalanceCard({ child, b }: { child: Member; b: Balance }) {
  const [done, setDone] = useState('');
  const rows: { key: string; icon: typeof Euro; label: string; value: string; button: ReactNode }[] = [];
  if (b.owed.moneyCents) {
    const v = formatMoney(b.owed.moneyCents);
    rows.push({ key: 'money', icon: Euro, label: 'Money', value: v, button: <PayoutButton child={child} type="money" what={v} onDone={setDone} /> });
  }
  if (b.owed.screenMinutes) {
    const v = `${formatMinutes(b.owed.screenMinutes)} screen time`;
    rows.push({ key: 'screen', icon: Clock, label: 'Screen time', value: formatMinutes(b.owed.screenMinutes), button: <PayoutButton child={child} type="screen_time" what={v} onDone={setDone} /> });
  }
  for (const c of b.owed.custom) {
    rows.push({ key: c.id, icon: Gift, label: c.title, value: c.rewardNote ?? 'Reward', button: <PayoutButton child={child} type="custom" choreId={c.id} what={`“${c.rewardNote ?? 'Reward'}”`} onDone={setDone} /> });
  }
  const paid = [
    b.paid.moneyCents ? formatMoney(b.paid.moneyCents) : null,
    b.paid.screenMinutes ? `${formatMinutes(b.paid.screenMinutes)} screen time` : null,
    b.paid.customCount ? `${b.paid.customCount} other ${b.paid.customCount === 1 ? 'reward' : 'rewards'}` : null,
  ].filter(Boolean);

  return (
    <Card className="p-4" role="region" aria-label={`${child.name}’s rewards`}>
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar name={child.name} color={child.avatarColor} size={32} />
        <span className="font-semibold">{child.name}</span>
      </div>
      {done && <div className="mb-3"><Notice tone="ok">{done}</Notice></div>}
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

export function ColorPicker({ value, onChange }: { value: AvatarColor; onChange: (c: AvatarColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Avatar colour" className="flex flex-wrap gap-2">
      {AVATAR_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className={cx('h-11 w-11 rounded-full ring-offset-2 ring-offset-card', AVATAR_BG[c], value === c ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-strong')} />
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
      <button type="button" data-back-cancel className={buttonClass('secondary', 'sm')} onClick={() => setAsking(false)}>Cancel</button>
      <button type="button" disabled={busy} className={cx(buttonClass('danger', 'sm'), '!bg-danger !text-canvas')} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</button>
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
  if (!url) return <div className="h-48 animate-pulse rounded-xl bg-ink/[0.04]" role="img" aria-label="Loading photo" />;
  return <img src={url} alt={alt} className={className} />;
}
