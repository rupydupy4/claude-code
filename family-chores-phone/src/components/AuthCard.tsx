import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="auth-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <div className="mb-8 flex items-center gap-2.5">
        <img src="./icon.svg" alt="" width={32} height={32} />
        <span className="text-lg font-semibold">Family Chores</span>
      </div>
      <div className="rounded-card border border-line bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-2">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 space-y-4 text-sm text-ink-2">{footer}</div>}
      <p className="mt-6 flex justify-center gap-2 text-sm text-ink-3">
        <Link to="/privacy" className="inline-flex min-h-11 items-center px-2 font-medium hover:text-ink">Privacy</Link>
        <span aria-hidden="true" className="self-center">·</span>
        <Link to="/terms" className="inline-flex min-h-11 items-center px-2 font-medium hover:text-ink">Terms</Link>
      </p>
    </main>
  );
}
