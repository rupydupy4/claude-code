'use client';
import { useActionState, useState } from 'react';
import { Clock, Euro, Gift, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { saveChore } from '@/app/actions/parent';
import { isoWeekday } from '@/lib/dates';
import { WEEKDAYS, cleanDays, describeRepeat } from '@/lib/recurrence';
import type { Chore, Member, Repeat, RewardType } from '@/lib/types';
import { SubmitButton } from './SubmitButton';
import { Avatar, Notice, cx, inputClass, labelClass, textareaClass } from './ui';

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
const chipOn = 'border-accent bg-accent-soft text-accent-strong';
const chipOff = 'border-line-strong bg-field text-ink-2 hover:border-ink-3';

export function ChoreForm({ chore, kids, presetChild, cancelHref, today }: { chore?: Chore; kids: Member[]; presetChild?: string; cancelHref: string; today: string }) {
  const [state, action] = useActionState(saveChore, undefined);
  // After an error the form is reset, so refill it with what was typed.
  const v = state?.values;
  const [type, setType] = useState<RewardType>(chore?.reward_type ?? 'money');
  const [assignee, setAssignee] = useState(chore?.assigned_to ?? presetChild ?? (kids.length === 1 ? kids[0].id : ''));
  const [repeat, setRepeat] = useState<Repeat>((v?.repeat as Repeat) ?? chore?.repeat ?? 'none');
  const [days, setDays] = useState<number[]>(chore?.repeat_days?.length ? chore.repeat_days : [isoWeekday(today)]);
  const toggleDay = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : cleanDays([...d, n])));

  return (
    <form action={action} className="space-y-6">
      {chore && <input type="hidden" name="id" value={chore.id} />}
      {state?.error && <Notice tone="danger">{state.error}</Notice>}

      <div className="space-y-4 rounded-card border border-line bg-card p-5">
        <label className="block">
          <span className={labelClass}>Chore</span>
          <input className={inputClass} name="title" defaultValue={v?.title ?? chore?.title} maxLength={80} required placeholder="e.g. Clean bedroom" />
        </label>
        <label className="block">
          <span className={labelClass}>Instructions <span className="font-normal text-ink-3">(optional)</span></span>
          <textarea className={textareaClass} name="description" defaultValue={v?.description ?? chore?.description} maxLength={1000} rows={3} placeholder="What does “done” look like?" />
        </label>
      </div>

      <fieldset className="rounded-card border border-line bg-card p-5">
        <legend className="sr-only">Assign to</legend>
        <span className={labelClass}>Assign to</span>
        <input type="hidden" name="assigned_to" value={assignee} />
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <button key={k.id} type="button" aria-pressed={assignee === k.id} onClick={() => setAssignee(k.id)}
              className={cx('flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[15px] font-medium', assignee === k.id ? chipOn : chipOff)}>
              <Avatar name={k.name} color={k.avatar_color} size={28} />{k.name}
            </button>
          ))}
        </div>
        {chore && chore.status !== 'assigned' && <p className="mt-2 text-xs text-ink-3">Choosing someone else starts the chore over for them.</p>}
      </fieldset>

      <fieldset className="space-y-4 rounded-card border border-line bg-card p-5">
        <legend className="sr-only">Reward</legend>
        <span className={labelClass}>Reward</span>
        <input type="hidden" name="reward_type" value={type} />
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Reward type">
          {TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={type === t.value} onClick={() => setType(t.value)}
              className={cx('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium', type === t.value ? chipOn : chipOff)}>
              <t.icon size={16} aria-hidden="true" />{t.label}
            </button>
          ))}
        </div>
        {type === 'money' && (
          <label className="block">
            <span className={labelClass}>Amount (€)</span>
            <input className={inputClass} name="reward_money" inputMode="decimal" defaultValue={v?.reward_money ?? (chore?.reward_type === 'money' ? ((chore.reward_amount ?? 0) / 100).toString() : '')} placeholder="5" required />
          </label>
        )}
        {type === 'screen_time' && (
          <label className="block">
            <span className={labelClass}>Minutes</span>
            <input className={inputClass} name="reward_minutes" type="number" min={1} max={1440} step={1} defaultValue={v?.reward_minutes ?? (chore?.reward_type === 'screen_time' ? chore.reward_amount ?? '' : '')} placeholder="30" required />
          </label>
        )}
        {type === 'custom' && (
          <label className="block">
            <span className={labelClass}>Reward</span>
            <input className={inputClass} name="reward_note" maxLength={80} defaultValue={v?.reward_note ?? chore?.reward_note ?? ''} placeholder="e.g. Pick Friday’s film" required />
          </label>
        )}
        <p className="text-xs text-ink-3">Rewards are recorded in the app when you approve the chore. No payments are made.</p>
      </fieldset>

      <fieldset className="space-y-4 rounded-card border border-line bg-card p-5">
        <legend className="sr-only">When</legend>
        <label className="block max-w-xs">
          <span className={labelClass}>Due date <span className="font-normal text-ink-3">{repeat === 'none' ? '(optional)' : '(first one)'}</span></span>
          <input className={inputClass} type="date" name="due_date" defaultValue={v?.due_date ?? chore?.due_date ?? ''} aria-describedby="due-hint" />
          <span id="due-hint" className="mt-1 block text-xs text-ink-3">{repeat === 'none' ? 'Leave empty for “whenever”.' : 'Leave empty to start today.'}</span>
        </label>

        <div>
          <span className={labelClass} id="repeat-label">Repeat</span>
          <input type="hidden" name="repeat" value={repeat} />
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="repeat-label">
            {REPEATS.map((r) => (
              <button key={r.value} type="button" aria-pressed={repeat === r.value} onClick={() => setRepeat(r.value)}
                className={cx('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium', repeat === r.value ? chipOn : chipOff)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {repeat === 'weekly' && (
          <div>
            <span className={labelClass} id="days-label">On these days</span>
            {days.map((d) => <input key={d} type="hidden" name="repeat_days" value={d} />)}
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

      <div className="rounded-card border border-line bg-card p-5">
        <label className="block max-w-xs">
          <span className={labelClass}>Points</span>
          <input className={inputClass} name="points" type="number" min={0} max={1000} step={1} inputMode="numeric" defaultValue={v?.points ?? chore?.points ?? 10} aria-describedby="points-hint" required />
          <span id="points-hint" className="mt-1 block text-xs text-ink-3">Added to the child’s points when you approve it.</span>
        </label>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className="inline-flex h-12 items-center justify-center rounded-xl px-5 font-semibold text-ink-2 hover:bg-ink/5">Cancel</Link>
        <SubmitButton size="lg" pendingText="Saving…">{chore ? 'Save changes' : 'Create chore'}</SubmitButton>
      </div>
    </form>
  );
}
