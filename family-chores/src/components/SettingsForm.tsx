'use client';
import { useActionState } from 'react';
import { updateSettings } from '@/app/actions/parent';
import { SubmitButton } from './SubmitButton';
import { Notice, inputClass, labelClass } from './ui';

export function SettingsForm({ household, name }: { household: string; name: string }) {
  const [state, action] = useActionState(updateSettings, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {state?.message && <Notice tone="ok">{state.message}</Notice>}
      <label className="block"><span className={labelClass}>Household name</span><input className={inputClass} name="household" defaultValue={household} maxLength={60} required /></label>
      <label className="block"><span className={labelClass}>Your name</span><input className={inputClass} name="name" defaultValue={name} maxLength={40} required /></label>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
