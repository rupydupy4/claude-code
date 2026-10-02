import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Euro, Gift } from 'lucide-react';
import { StoreError, createChore, updateChore, useStore } from '../../lib/store';
import type { RewardType } from '../../lib/types';
import { Field, str, useSubmit } from '../../components/forms';
import { Avatar, ButtonLink, EmptyState, Notice, PageHeader, buttonClass, cx, inputClass, labelClass, textareaClass } from '../../components/ui';

const TYPES: { value: RewardType; label: string; icon: typeof Euro }[] = [
  { value: 'money', label: 'Money', icon: Euro },
  { value: 'screen_time', label: 'Screen time', icon: Clock },
  { value: 'custom', label: 'Custom', icon: Gift },
];

function parseMoney(raw: string) {
  const v = raw.replace(',', '.').replace(/[€\s]/g, '');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) throw new StoreError('Enter an amount like 5 or 2.50.');
  return Math.round(Number(v) * 100);
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

  const save = useSubmit(async (f) => {
    if (!assignee) throw new StoreError('Choose who should do it.');
    const amount = type === 'money' ? parseMoney(str(f, 'money')) : type === 'screen_time' ? Number(str(f, 'minutes')) : null;
    const input = { title: str(f, 'title'), description: str(f, 'description'), assignedTo: assignee, rewardType: type, rewardAmount: amount, rewardNote: type === 'custom' ? str(f, 'note') : null, dueDate: str(f, 'due') || null };
    if (chore) {
      await updateChore(chore.id, input);
      navigate(`/parent/chores/${chore.id}`, { state: { notice: 'Changes saved.' } });
    } else {
      createChore(input);
      navigate('/parent/chores?tab=active', { state: { notice: 'Chore created and assigned.' } });
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
          <span className={labelClass}>Assign to</span>
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => (
              <button key={k.id} type="button" aria-pressed={assignee === k.id} onClick={() => setAssignee(k.id)}
                className={cx('flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-[15px] font-medium', assignee === k.id ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong bg-white text-ink-2 hover:border-ink-3')}>
                <Avatar name={k.name} color={k.avatarColor} size={28} />{k.name}
              </button>
            ))}
          </div>
          {chore && chore.status !== 'assigned' && <p className="mt-2 text-xs text-ink-3">Choosing someone else starts the chore over for them.</p>}
        </fieldset>

        <fieldset className="space-y-4 rounded-card border border-line bg-card p-5">
          <legend className="sr-only">Reward</legend>
          <span className={labelClass}>Reward</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Reward type">
            {TYPES.map((x) => (
              <button key={x.value} type="button" aria-pressed={type === x.value} onClick={() => setType(x.value)}
                className={cx('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium', type === x.value ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong bg-white text-ink-2 hover:border-ink-3')}>
                <x.icon size={16} aria-hidden="true" />{x.label}
              </button>
            ))}
          </div>
          {type === 'money' && <Field label="Amount (€)"><input className={inputClass} name="money" inputMode="decimal" defaultValue={chore?.rewardType === 'money' ? String((chore.rewardAmount ?? 0) / 100) : ''} placeholder="5" /></Field>}
          {type === 'screen_time' && <Field label="Minutes"><input className={inputClass} name="minutes" type="number" min={1} max={1440} defaultValue={chore?.rewardType === 'screen_time' ? chore.rewardAmount ?? '' : ''} placeholder="30" /></Field>}
          {type === 'custom' && <Field label="Reward"><input className={inputClass} name="note" maxLength={80} defaultValue={chore?.rewardNote ?? ''} placeholder="e.g. Pick Friday’s film" /></Field>}
          <p className="text-xs text-ink-3">Rewards are recorded in the app when you approve the chore. No payments are made.</p>
        </fieldset>

        <div className="rounded-card border border-line bg-card p-5">
          <label className="block max-w-xs">
            <span className={labelClass}>Due date <span className="font-normal text-ink-3">(optional)</span></span>
            <input className={inputClass} type="date" name="due" defaultValue={chore?.dueDate ?? ''} />
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to={chore ? `/parent/chores/${chore.id}` : '/parent/chores'} className="inline-flex h-12 items-center justify-center rounded-xl px-5 font-semibold text-ink-2 hover:bg-black/5">Cancel</Link>
          <button className={buttonClass('primary', 'lg')} disabled={save.busy}>{chore ? 'Save changes' : 'Create chore'}</button>
        </div>
      </form>
    </div>
  );
}
