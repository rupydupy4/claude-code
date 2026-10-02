'use client';
import { useState } from 'react';
import { buttonClass } from './ui';
import { SubmitButton } from './SubmitButton';

/** Inline "are you sure?" step for destructive actions (no browser pop-ups). */
export function ConfirmButton({ action, fields, label, confirmText, confirmLabel = 'Delete' }: {
  action: (form: FormData) => void | Promise<void>; fields: Record<string, string>; label: string; confirmText: string; confirmLabel?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={buttonClass('danger', 'sm')} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft p-3" role="group" aria-label="Confirm">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span className="mr-auto text-sm font-medium text-danger">{confirmText}</span>
      <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setAsking(false)}>Cancel</button>
      <SubmitButton variant="danger" size="sm" pendingText="Working…" className="!bg-danger !text-white">{confirmLabel}</SubmitButton>
    </form>
  );
}
