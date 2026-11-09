import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { StoreError, changePin, currentUser, deleteEverything, setHaptics, signOut, updateHousehold, useStore } from '../../lib/store';
import { ConfirmButton } from '../../components/parts';
import { RestoreBackup, SaveBackupButton } from '../../components/backup';
import { Field, str, useSubmit } from '../../components/forms';
import { Card, Notice, PageHeader, buttonClass, inputClass } from '../../components/ui';

export function ParentSettings() {
  const navigate = useNavigate();
  const me = useStore((s) => currentUser(s))!;
  const household = useStore((s) => s.data.household)!;
  const haptics = useStore((s) => s.data.prefs.haptics);
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
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block font-semibold">Vibrate on key actions</span>
            <span className="block text-sm text-ink-2">A small tap when a chore is handed in, approved or paid out.</span>
          </span>
          <input type="checkbox" role="switch" className="h-6 w-6 shrink-0 accent-accent" checked={haptics} onChange={(e) => setHaptics(e.target.checked)} />
        </label>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Back up and restore</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">
          Save everything, photos included, as one file you keep (for example in Files or your cloud drive). Use it to move to a new phone,
          or to get your data back if this device is lost or reset. Restoring replaces everything on this device.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <SaveBackupButton />
          <RestoreBackup replacing />
        </div>
      </Card>

      <Card className="divide-y divide-line">
        <div className="p-5 sm:p-6">
          <h2 className="font-semibold">Privacy</h2>
          <p className="mt-1 text-sm text-ink-2">
            Family Chores collects no data. Everything, including photos, is saved only on this device. Nothing is uploaded or shared,
            and there are no adverts or tracking.
          </p>
          {household.demo && <p className="mt-2 text-sm text-ink-2">You’re using the demo household. Delete all data below to set up your own.</p>}
        </div>
        <Link to="/privacy" className="flex min-h-12 items-center justify-between px-5 font-medium hover:bg-ink/[0.03] sm:px-6">Privacy policy<ChevronRight size={18} className="text-ink-3" aria-hidden="true" /></Link>
        <Link to="/terms" className="flex min-h-12 items-center justify-between px-5 font-medium hover:bg-ink/[0.03] sm:px-6">Terms of use<ChevronRight size={18} className="text-ink-3" aria-hidden="true" /></Link>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Delete all data</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">Removes the household, children, chores, rewards and photos from this device. This can’t be undone unless you saved a backup.</p>
        <ConfirmButton label="Delete all data" confirmLabel="Delete everything" confirmText="Delete everything from this device?"
          onConfirm={async () => { await deleteEverything(); navigate('/', { replace: true }); }} />
      </Card>

      <button type="button" className={buttonClass('secondary')} onClick={() => { signOut(); navigate('/'); }}><LogOut size={18} aria-hidden="true" />Switch user</button>
    </div>
  );
}
