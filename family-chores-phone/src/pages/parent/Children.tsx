import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addChild, removeChild, updateChild, useStore } from '../../lib/store';
import type { AvatarColor, Member } from '../../lib/types';
import { isOpen, totalRewards } from '../../lib/format';
import { ColorPicker, ConfirmButton, RewardSummary } from '../../components/parts';
import { Field, str, useSubmit } from '../../components/forms';
import { Avatar, Card, Notice, PageHeader, Section, buttonClass, inputClass, labelClass } from '../../components/ui';

function AddChild() {
  const [color, setColor] = useState<AvatarColor>('teal');
  const [name, setName] = useState('');
  const [done, setDone] = useState('');
  const add = useSubmit(() => {
    const c = addChild(name, color);
    setDone(`${c.name} has been added. They can tap their name on the “Who’s using?” screen.`);
    setName('');
  });
  return (
    <form onSubmit={add.onSubmit} className="space-y-4">
      {add.error && <Notice tone="danger">{add.error}</Notice>}
      {done && !add.error && <Notice tone="ok">{done}</Notice>}
      <div className="flex items-end gap-3">
        <Avatar name={name || '?'} color={color} size={44} />
        <label className="block flex-1">
          <span className={labelClass}>First name</span>
          <input className={inputClass} value={name} onChange={(e) => { setName(e.target.value); setDone(''); }} maxLength={40} required autoComplete="off" />
        </label>
      </div>
      <div><span className={labelClass}>Colour <span className="font-normal text-ink-3">(optional)</span></span><ColorPicker value={color} onChange={setColor} /></div>
      <button className={buttonClass('primary')} disabled={add.busy}>Add child</button>
    </form>
  );
}

function EditChild({ child }: { child: Member }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState<AvatarColor>(child.avatarColor);
  const [saved, setSaved] = useState(false);
  const save = useSubmit((f) => { updateChild(child.id, str(f, 'name'), color); setSaved(true); });
  if (!open) return <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setOpen(true)}>Edit</button>;
  return (
    <form onSubmit={save.onSubmit} className="mt-4 w-full space-y-4 border-t border-line pt-4">
      {save.error && <Notice tone="danger">{save.error}</Notice>}
      {saved && !save.error && <Notice tone="ok">Saved.</Notice>}
      <Field label="First name"><input className={inputClass} name="name" defaultValue={child.name} maxLength={40} required /></Field>
      <div><span className={labelClass}>Colour</span><ColorPicker value={color} onChange={setColor} /></div>
      <div className="flex gap-2">
        <button className={buttonClass('primary', 'sm')}>Save</button>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}

export function ParentChildren() {
  const members = useStore((s) => s.data.members);
  const chores = useStore((s) => s.data.chores);
  const kids = members.filter((m) => m.role === 'child');
  const [removed, setRemoved] = useState('');
  return (
    <div className="space-y-8">
      <PageHeader title="Children" subtitle="Children choose their name on this device to see and hand in their chores." />
      {removed && <Notice tone="ok">{removed}</Notice>}
      <Section title="Your children" count={kids.length}>
        {kids.length ? (
          <div className="space-y-3">
            {kids.map((k) => {
              const mine = chores.filter((c) => c.assignedTo === k.id);
              return (
                <Card key={k.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={k.name} color={k.avatarColor} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{k.name}</div>
                      <div className="text-sm text-ink-3">{mine.filter(isOpen).length} to do · <RewardSummary t={totalRewards(mine)} empty="no rewards yet" /></div>
                    </div>
                    <Link to={`/parent/chores/new?child=${k.id}`} className="text-sm font-semibold text-accent">New chore</Link>
                    <EditChild child={k} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <ConfirmButton label="Remove" confirmLabel="Remove" confirmText={`Remove ${k.name}? Their chores, rewards and photos will be deleted.`}
                      onConfirm={async () => { await removeChild(k.id); setRemoved(`${k.name} was removed.`); }} />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-ink-2">No children yet. Add the first one below.</p>
        )}
      </Section>
      <section id="add">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">Add a child</h2>
          <p className="mb-5 text-sm text-ink-2">Only a first name is needed.</p>
          <AddChild />
        </Card>
      </section>
    </div>
  );
}
