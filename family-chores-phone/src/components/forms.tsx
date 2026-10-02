import { useState, type FormEvent, type ReactNode } from 'react';
import { StoreError } from '../lib/store';
import { labelClass } from './ui';

export function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const message = (e: unknown) => (e instanceof StoreError ? e.message : 'Something went wrong. Please try again.');

/** Runs a store action from a form, tracking busy state and turning errors into a message. */
export function useSubmit(fn: (form: FormData) => unknown | Promise<unknown>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await fn(new FormData(e.currentTarget));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return { onSubmit, error, busy, setError };
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
