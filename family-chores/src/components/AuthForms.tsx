'use client';
import { useActionState } from 'react';
import { createHousehold, signIn, signInChild, signUp, type FormState } from '@/app/actions/auth';
import { SubmitButton } from './SubmitButton';
import { Notice, inputClass, labelClass } from './ui';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <Notice tone="danger">{state.error}</Notice>;
  if (state?.message) return <Notice tone="ok">{state.message}</Notice>;
  return null;
}

/** The browser's time zone, so "due today" matches the family's day. */
function TimeZoneInput() {
  return <input type="hidden" name="timeZone" defaultValue="UTC" ref={(el) => { if (el) el.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }} />;
}

export function SignInForm() {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <Field label="Email"><input className={inputClass} name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} required /></Field>
      <Field label="Password"><input className={inputClass} name="password" type="password" autoComplete="current-password" required /></Field>
      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, undefined);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <Field label="Your first name"><input className={inputClass} name="name" autoComplete="given-name" maxLength={40} defaultValue={state?.values?.name} required /></Field>
      <Field label="Household name" hint="For example, “The Smith Family”."><input className={inputClass} name="household" maxLength={60} defaultValue={state?.values?.household} required /></Field>
      <Field label="Email"><input className={inputClass} name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} required /></Field>
      <Field label="Password" hint="At least 8 characters."><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <TimeZoneInput />
      <SubmitButton size="lg" className="w-full" pendingText="Creating…">Create household</SubmitButton>
    </form>
  );
}

export function SetupForm({ name, household }: { name: string; household: string }) {
  const [state, action] = useActionState(createHousehold, undefined);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <Field label="Your first name"><input className={inputClass} name="name" defaultValue={state?.values?.name ?? name} maxLength={40} required /></Field>
      <Field label="Household name"><input className={inputClass} name="household" defaultValue={state?.values?.household ?? household} maxLength={60} required /></Field>
      <TimeZoneInput />
      <SubmitButton size="lg" className="w-full" pendingText="Creating…">Create household</SubmitButton>
    </form>
  );
}

export function ChildSignInForm() {
  const [state, action] = useActionState(signInChild, undefined);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <Field label="Household code" hint="Six letters and numbers. A parent can find it under Children.">
        <input className={`${inputClass} uppercase tracking-[0.2em]`} name="code" autoComplete="off" autoCapitalize="characters" maxLength={7} defaultValue={state?.values?.code} required />
      </Field>
      <Field label="Your first name"><input className={inputClass} name="name" autoComplete="given-name" maxLength={40} defaultValue={state?.values?.name} required /></Field>
      <Field label="PIN"><input className={`${inputClass} tracking-[0.3em]`} name="pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="current-password" required /></Field>
      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
