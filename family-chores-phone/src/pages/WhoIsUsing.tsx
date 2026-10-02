import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { signInAs, useStore } from '../lib/store';
import type { Member } from '../lib/types';
import { AuthCard } from '../components/AuthCard';
import { Field, str, useSubmit } from '../components/forms';
import { Avatar, Notice, buttonClass, inputClass } from '../components/ui';

export function WhoIsUsing() {
  const members = useStore((s) => s.data.members);
  const household = useStore((s) => s.data.household)!;
  const navigate = useNavigate();
  const [parent, setParent] = useState<Member | null>(null);
  const pin = useSubmit(async (f) => {
    await signInAs(parent!.id, str(f, 'pin'));
    navigate('/parent');
  });

  if (parent) {
    return (
      <AuthCard title={`Hi ${parent.name}`} subtitle="Enter the parent PIN.">
        <form onSubmit={pin.onSubmit} className="space-y-4">
          {pin.error && <Notice tone="danger">{pin.error}</Notice>}
          <Field label="Parent PIN"><input className={`${inputClass} tracking-[0.3em]`} name="pin" type="password" inputMode="numeric" maxLength={6} autoFocus autoComplete="current-password" required /></Field>
          <button className={buttonClass('primary', 'lg') + ' w-full'} disabled={pin.busy}>Continue</button>
          <button type="button" className={buttonClass('ghost') + ' w-full'} onClick={() => { setParent(null); pin.setError(''); }}><ArrowLeft size={16} aria-hidden="true" />Back</button>
        </form>
      </AuthCard>
    );
  }

  const kids = members.filter((m) => m.role === 'child');
  const parents = members.filter((m) => m.role === 'parent');
  return (
    <AuthCard title="Who’s using Family Chores?" subtitle={household.name}>
      <ul className="space-y-2">
        {kids.map((k) => (
          <li key={k.id}>
            <button type="button" onClick={async () => { await signInAs(k.id); navigate('/child'); }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left text-[17px] font-semibold hover:border-ink-3">
              <Avatar name={k.name} color={k.avatarColor} size={40} />{k.name}
            </button>
          </li>
        ))}
        {parents.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setParent(p)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left text-[17px] font-semibold hover:border-ink-3">
              <Avatar name={p.name} color={p.avatarColor} size={40} />
              <span className="flex-1">{p.name}</span>
              <span className="flex items-center gap-1 text-sm font-medium text-ink-3"><Lock size={14} aria-hidden="true" />Parent</span>
            </button>
          </li>
        ))}
      </ul>
      {!kids.length && <p className="mt-4 text-sm text-ink-3">No children yet. A parent can add them after signing in.</p>}
    </AuthCard>
  );
}
