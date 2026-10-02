import { useNavigate } from 'react-router-dom';
import { StoreError, createHousehold, loadDemo } from '../lib/store';
import { AuthCard } from '../components/AuthCard';
import { Field, str, useSubmit } from '../components/forms';
import { Notice, buttonClass, inputClass } from '../components/ui';

export function Welcome() {
  const navigate = useNavigate();
  const setup = useSubmit(async (f) => {
    if (str(f, 'pin') !== str(f, 'pin2')) throw new StoreError('The two PINs don’t match.');
    await createHousehold(str(f, 'household'), str(f, 'name'), str(f, 'pin'));
    navigate('/parent', { state: { notice: 'Your household is ready. Add your children next.' } });
  });
  const demo = useSubmit(async () => {
    await loadDemo();
  });
  return (
    <AuthCard
      title="Set up your household"
      subtitle="Chores and rewards for your family. Everything is saved on this device."
      footer={
        <section aria-labelledby="demo-h" className="rounded-card border border-line bg-card p-5">
          <h2 id="demo-h" className="font-semibold text-ink">Just looking?</h2>
          <p className="mt-1">Try the demo: The Smith Family with Sarah (parent) and her children Alex and Jamie. The parent PIN is <strong className="text-ink">1234</strong>.</p>
          {demo.error && <div className="mt-3"><Notice tone="danger">{demo.error}</Notice></div>}
          <form onSubmit={demo.onSubmit} className="mt-4">
            <button className={buttonClass('secondary')} disabled={demo.busy}>Try the demo</button>
          </form>
        </section>
      }
    >
      <form onSubmit={setup.onSubmit} className="space-y-4">
        {setup.error && <Notice tone="danger">{setup.error}</Notice>}
        <Field label="Household name" hint="For example, “The Smith Family”."><input className={inputClass} name="household" maxLength={60} required /></Field>
        <Field label="Your first name"><input className={inputClass} name="name" autoComplete="given-name" maxLength={40} required /></Field>
        <Field label="Parent PIN" hint="4 to 6 digits. It keeps the parent area (approving chores) for grown-ups.">
          <input className={`${inputClass} tracking-[0.3em]`} name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm PIN"><input className={`${inputClass} tracking-[0.3em]`} name="pin2" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="new-password" required /></Field>
        <button className={buttonClass('primary', 'lg') + ' w-full'} disabled={setup.busy}>{setup.busy ? 'Setting up…' : 'Create household'}</button>
      </form>
    </AuthCard>
  );
}
