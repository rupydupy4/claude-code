import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Euro, Gift, Repeat2 } from 'lucide-react';
import { StoreError, cleanDays, createChore, updateChore, useStore } from '../../lib/store';
import { WEEKDAYS, describeRepeat, isoWeekday, today } from '../../lib/format';
import type { Repeat, RewardType } from '../../lib/types';
import { Field, str, useSubmit } from '../../components/forms';
import { Avatar, ButtonLink, EmptyState, Notice, PageHeader, buttonClass, chipOff, chipOn, cx, inputClass, labelClass, textareaClass } from '../../components/ui';

const TYPES: { value: RewardType; label: string; icon: typeof Euro }[] = [
  { value: 'money', label: 'Money', icon: Euro },
  { value: 'screen_time', label: 'Screen time', icon: Clock },
  { value: 'custom', label: 'Custom', icon: Gift },
];
const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

function parseMoney(raw: string) {
  const v = raw.replace(',', '.').replace(/[€\s]/g, '');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) throw new StoreError('Enter an amount like 5 or 2.50.');
  return Math.round(Number(v) * 100);
}

function parsePoints(raw: string) {
  if (!/^\d{1,4}$/.test(raw)) throw new StoreError('Points must be a whole number from 0 to 1000.');
  return Number(raw);
}

export function ChoreEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const chore = useStore((s) => (id ? s.data.chores.find((c) => c.id === id) : undefined));
  const members = useStore((s) => s.data.members);
  const kids = members.filter((m) => m.role === 'child');
  const [type, setType] = useState<RewardType>(chore?.rewardType ?? 'money');
  const [assignee, setAssignee] = useState(chore?.assignedTo ?? sp.get('child') ?? (kids.length === 1 ? kids[0].id : ''));
  const [repeat, setRepeat] = useState<Repeat>(chore?.repeat ?? 'none');
  const [days, setDays] = useState<number[]>(chore?.repeatDays.length ? chore.repeatDays : [isoWeekday(today())]);
  const toggleDay = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : cleanDays([...d, n])));

  const save = useSubmit(async (f) => {
    if (!assignee) throw new StoreError('Choose who should do it.');
    const amount = type === 'money' ? parseMoney(str(f, 'money')) : type === 'screen_time' ? Number(str(f, 'minutes')) : null;
    const input = {
      title: str(f, 'title'), description: str(f, 'description'), assignedTo: assignee, rewardType: type, rewardAmount: amount,
      rewardNote: type === 'custom' ? str(f, 'note') : null, dueDate: str(f, 'due') || null,
      repeat, repeatDays: repeat === 'weekly' ? days : [], points: parsePoints(str(f, 'points')),
    };
    if (chore) {
      await updateChore(chore.id, input);
      navigate(`/parent/chores/${chore.id}`, { replace: true, state: { notice: 'Changes saved.' } });
    } else {
      createChore(input);
      navigate('/parent/chores?tab=active', { replace: true, state: { notice: 'Chore created and assigned.' } });
    }
  });

  if (id && !chore) return <Navigate to="/parent/chores" replace />;
  if (chore?.status === 'approved') return <Navigate to={`/parent/chores/${chore.id}`} replace />;
  if (!kids.length) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Create chore" />
        <EmptyState title="Add a child first"><p>Chores are assigned to a child.</p><ButtonLink href="/parent/children" className="mt-4">Add a child</ButtonLink></EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={chore ? 'Edit chore' : 'Create chore'} />
      <form onSubmit={save.onSubmit} className="space-y-6" noValidate>
        {save.error && <Notice tone="danger">{save.error}</Notice>}
        <div className="space-y-4 rounded-card border border-line bg-card p-5">
          <Field label="Chore"><input className={inputClass} name="title" defaultValue={chore?.title} maxLength={80} required placeholder="e.g. Clean bedroom" /></Field>
          <Field label={<>Instructions <span className="font-normal text-ink-3">(optional)</span></>}>
            <textarea className={textareaClass} name="description" defaultValue={chore?.description} maxLength={1000} rows={3} placeholder="What does “done” look like?" />
          </Field>
        </div>

        <fieldset className="rounded-card border border-line bg-card p-5">
          <legend className="sr-only">Assign to</legend>
          <span className={labelClass} aria-hidden="true">Assign to</span>
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => (
              <button key={k.id} type="button" aria-pressed={assignee === k.id} onClick={() => setAssignee(k.id)}
                className={cx('flex min-h-11 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[15px] font-medium', assignee === k.id ? chipOn : chipOff)}>
                <Avatar name={k.name} color={k.avatarColor} size={30} />{k.name}
              </button>
            ))}
          </div>
          {chore && chore.status !== 'assigned' && <p className="mt-2 text-xs text-ink-3">Choosing someone else starts the chore over for them.</p>}
        </fieldset>

        <fieldset className="space-y-4 rounded-card border border-line bg-card p-5">
          <legend className="sr-only">Reward</legend>
          <span className={labelClass} aria-hidden="true">Reward</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Reward type">
            {TYPES.map((x) => (
              <button key={x.value} type="button" aria-pressed={type === x.value} onClick={() => setType(x.value)}
                className={cx('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium', type === x.value ? chipOn : chipOff)}>
                <x.icon size={16} aria-hidden="true" />{x.label}
              </button>
            ))}
          </div>
          {type === 'money' && <Field label="Amount (€)"><input className={inputClass} name="money" inputMode="decimal" defaultValue={chore?.rewardType === 'money' ? String((chore.rewardAmount ?? 0) / 100) : ''} placeholder="5" /></Field>}
          {type === 'screen_time' && <Field label="Minutes"><input className={inputClass} name="minutes" type="number" inputMode="numeric" min={1} max={1440} defaultValue={chore?.rewardType === 'screen_time' ? chore.rewardAmount ?? '' : ''} placeholder="30" /></Field>}
          {type === 'custom' && <Field label="Reward"><input className={inputClass} name="note" maxLength={80} defaultValue={chore?.rewardNote ?? ''} placeholder="e.g. Pick Friday’s film" /></Field>}
          <Field label="Points" hint="Added to the child’s points when you approve it.">
            <input className={inputClass + ' max-w-40'} name="points" type="number" inputMode="numeric" min={0} max={1000} step={1} defaultValue={chore?.points ?? 10} />
          </Field>
          <p className="text-xs text-ink-3">Rewards are recorded in the app when you approve the chore. No payments are made.</p>
        </fieldset>

        <fieldset className="space-y-4 rounded-card border border-line bg-card p-5">
          <legend className="sr-only">When</legend>
          <label className="block max-w-xs">
            <span className={labelClass}>Due date <span className="font-normal text-ink-3">{repeat === 'none' ? '(optional)' : '(first one)'}</span></span>
            <input className={inputClass} type="date" name="due" defaultValue={chore?.dueDate ?? ''} aria-describedby="due-hint" />
            <span id="due-hint" className="mt-1 block text-xs text-ink-3">{repeat === 'none' ? 'Leave empty for “whenever”.' : 'Leave empty to start today.'}</span>
          </label>

          <div>
            <span className={labelClass} id="repeat-label">Repeat</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="repeat-label">
              {REPEATS.map((r) => (
                <button key={r.value} type="button" aria-pressed={repeat === r.value} onClick={() => setRepeat(r.value)}
                  className={cx('flex h-11 items-center justify-center rounded-xl border text-sm font-medium', repeat === r.value ? chipOn : chipOff)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {repeat === 'weekly' && (
            <div>
              <span className={labelClass} id="days-label">On these days</span>
              <div className="grid grid-cols-7 gap-1.5" role="group" aria-labelledby="days-label">
                {WEEKDAYS.map((d) => (
                  <button key={d.n} type="button" aria-pressed={days.includes(d.n)} aria-label={d.long} onClick={() => toggleDay(d.n)}
                    className={cx('flex h-11 items-center justify-center rounded-xl border text-sm font-medium', days.includes(d.n) ? chipOn : chipOff)}>
                    {d.short.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {repeat !== 'none' && (
            <p className="flex items-start gap-1.5 text-xs text-ink-3"><Repeat2 size={14} className="mt-px shrink-0" aria-hidden="true" />
              {describeRepeat(repeat, days) ?? 'Choose at least one day'}. When you approve one, the next is created automatically.
            </p>
          )}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to={chore ? `/parent/chores/${chore.id}` : '/parent/chores'} className={buttonClass('ghost', 'lg')}>Cancel</Link>
          <button className={buttonClass('primary', 'lg')} disabled={save.busy}>{chore ? 'Save changes' : 'Create chore'}</button>
        </div>
      </form>
    </div>
  );
}
