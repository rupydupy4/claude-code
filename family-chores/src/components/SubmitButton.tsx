'use client';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { buttonClass, cx, type ButtonVariant } from './ui';

export function SubmitButton({ children, pendingText, variant = 'primary', size = 'md', className, name, value }: {
  children: ReactNode; pendingText?: string; variant?: ButtonVariant; size?: 'md' | 'lg' | 'sm'; className?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={cx(buttonClass(variant, size), className)}>
      {pending ? pendingText ?? 'Saving…' : children}
    </button>
  );
}
