import type { ReactNode } from 'react';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <img src="/icon.svg" alt="" width={32} height={32} />
        <span className="text-lg font-semibold">Family Chores</span>
      </div>
      <div className="rounded-card border border-line bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-2">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 space-y-4 text-center text-sm text-ink-2">{footer}</div>}
    </main>
  );
}
