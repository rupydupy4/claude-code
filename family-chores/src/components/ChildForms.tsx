'use client';
import { useActionState, useState } from 'react';
import { addChild, updateChild } from '@/app/actions/parent';
import { AVATAR_COLORS, type AvatarColor, type Member } from '@/lib/types';
import { SubmitButton } from './SubmitButton';
import { AVATAR_BG, Avatar, Notice, cx, inputClass, labelClass, buttonClass } from './ui';

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

function PinInput({ required, label = 'PIN', hint }: { required?: boolean; label?: string; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input className={`${inputClass} tracking-[0.3em]`} name="pin" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="new-password" required={required} placeholder="••••••" />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function AddChildForm() {
  const [state, action] = useActionState(addChild, undefined);
  return (
    <div className="space-y-4">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {state?.message && <Notice tone="ok">{state.message}</Notice>}
      {/* A new key after each success clears the form for the next child. */}
      <AddChildFields key={state?.message ?? 'form'} action={action} />
    </div>
  );
}

function AddChildFields({ action }: { action: (f: FormData) => void }) {
  const [color, setColor] = useState<AvatarColor>('teal');
  const [name, setName] = useState('');
  return (
    <form action={action} className="space-y-4">
      <div className="flex items-end gap-3">
        <Avatar name={name || '?'} color={color} size={44} />
        <label className="block flex-1">
          <span className={labelClass}>First name</span>
          <input className={inputClass} name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoComplete="off" />
        </label>
      </div>
      <div>
        <span className={labelClass}>Colour <span className="font-normal text-ink-3">(optional)</span></span>
        <ColorPicker value={color} onChange={setColor} />
        <input type="hidden" name="avatar_color" value={color} />
      </div>
      <PinInput required hint="6 digits. They use it with their name and your household code to sign in." />
      <SubmitButton pendingText="Adding…">Add child</SubmitButton>
    </form>
  );
}

export function EditChildForm({ child }: { child: Member }) {
  const [state, action] = useActionState(updateChild, undefined);
  const [color, setColor] = useState<AvatarColor>(child.avatar_color);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setOpen(true)}>Edit</button>;
  return (
    <form action={action} className="mt-4 w-full space-y-4 border-t border-line pt-4">
      <input type="hidden" name="id" value={child.id} />
      <input type="hidden" name="avatar_color" value={color} />
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {state?.message && <Notice tone="ok">{state.message}</Notice>}
      <label className="block">
        <span className={labelClass}>First name</span>
        <input className={inputClass} name="name" defaultValue={child.name} maxLength={40} required />
      </label>
      <div><span className={labelClass}>Colour</span><ColorPicker value={color} onChange={setColor} /></div>
      <PinInput label="New PIN (optional)" hint="Leave empty to keep the current PIN." />
      <div className="flex gap-2">
        <SubmitButton size="sm">Save</SubmitButton>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}
