import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { StoreError, changePin, currentUser, deleteEverything, signOut, updateHousehold, useStore } from '../../lib/store';
import { ConfirmButton } from '../../components/parts';
import { Field, str, useSubmit } from '../../components/forms';
import { Card, Notice, PageHeader, buttonClass, inputClass } from '../../components/ui';

export function ParentSettings() {
  const navigate = useNavigate();
  const me = useStore((s) => currentUser(s))!;
  const household = useStore((s) => s.data.household)!;
  const [saved, setSaved] = useState('');
  const details = useSubmit((f) => { updateHousehold(str(f, 'household'), str(f, 'name')); setSaved('details'); });
  const pin = useSubmit(async (f) => {
    if (str(f, 'next') !== str(f, 'next2')) throw new StoreError('The new PINs don’t match.');
    await changePin(str(f, 'current'), str(f, 'next'));
    setSaved('pin');
  });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <Card className="p-5 sm:p-6">
        <form onSubmit={details.onSubmit} className="space-y-4">
          {details.error && <Notice tone="danger">{details.error}</Notice>}
          {saved === 'details' && !details.error && <Notice tone="ok">Saved.</Notice>}
          <Field label="Household name"><input className={inputClass} name="household" defaultValue={household.name} maxLength={60} required /></Field>
          <Field label="Your name"><input className={inputClass} name="name" defaultValue={me.name} maxLength={40} required /></Field>
          <button className={buttonClass('primary')}>Save</button>
        </form>
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">Change parent PIN</h2>
        <form onSubmit={pin.onSubmit} className="space-y-4">
          {pin.error && <Notice tone="danger">{pin.error}</Notice>}
          {saved === 'pin' && !pin.error && <Notice tone="ok">PIN changed.</Notice>}
          <Field label="Current PIN"><input className={`${inputClass} tracking-[0.3em]`} name="current" type="password" inputMode="numeric" maxLength={6} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New PIN" hint="4 to 6 digits"><input className={`${inputClass} tracking-[0.3em]`} name="next" type="password" inputMode="numeric" maxLength={6} required /></Field>
            <Field label="Confirm new PIN"><input className={`${inputClass} tracking-[0.3em]`} name="next2" type="password" inputMode="numeric" maxLength={6} required /></Field>
          </div>
          <button className={buttonClass('secondary')} disabled={pin.busy}>Change PIN</button>
        </form>
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-ink-2">
          Everything, including photos, is saved only on this device. Nothing is uploaded or shared.
          Clearing this browser’s website data or deleting the home-screen app removes it.
        </p>
        {household.demo && <p className="mt-2 text-sm text-ink-2">You’re using the demo household. Delete everything below to set up your own.</p>}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={buttonClass('secondary')} onClick={() => { signOut(); navigate('/'); }}><LogOut size={18} aria-hidden="true" />Switch user</button>
        <ConfirmButton label="Delete everything" confirmLabel="Delete" confirmText="Delete the household, children, chores, rewards and photos from this device?"
          onConfirm={async () => { await deleteEverything(); navigate('/'); }} />
      </div>
    </div>
  );
}
