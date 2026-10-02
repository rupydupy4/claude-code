import { Link } from 'react-router-dom';
import type { ComponentProps, ReactNode } from 'react';
import type { AvatarColor, ChoreStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-card text-ink border border-line-strong hover:border-ink-3',
  ghost: 'text-ink-2 hover:bg-black/5',
  danger: 'bg-danger-soft text-danger hover:bg-[#fbdcd8]',
};
export type ButtonVariant = keyof typeof BTN;

export function buttonClass(variant: ButtonVariant = 'primary', size: 'md' | 'lg' | 'sm' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
    size === 'lg' ? 'h-12 px-5 text-base' : size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-4 text-[15px]',
    BTN[variant],
  );
}

export function ButtonLink({ href, variant, size, className, children }: { href: string; variant?: ButtonVariant; size?: 'md' | 'lg' | 'sm'; className?: string; children: ReactNode }) {
  return <Link to={href} className={cx(buttonClass(variant, size), className)}>{children}</Link>;
}

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('rounded-card bg-card border border-line', className)} {...rest}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, count }: { title: string; action?: ReactNode; children: ReactNode; count?: number }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold">
          {title}
          {count !== undefined && count > 0 && <span className="ml-2 text-sm font-medium text-ink-3 tabular">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong px-5 py-8 text-center">
      {icon && <div className="mx-auto mb-2 flex justify-center text-ink-3">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{children}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<ChoreStatus, string> = {
  assigned: 'bg-black/5 text-ink-2',
  submitted: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  needs_changes: 'bg-danger-soft text-danger',
};

export function StatusBadge({ status }: { status: ChoreStatus }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

export const AVATAR_BG: Record<AvatarColor, string> = {
  slate: 'bg-slate-600', teal: 'bg-teal-700', blue: 'bg-blue-600', violet: 'bg-violet-600', rose: 'bg-rose-600', amber: 'bg-amber-600', green: 'bg-green-700',
};

export function Avatar({ name, color, size = 40 }: { name: string; color: AvatarColor; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', AVATAR_BG[color] ?? AVATAR_BG.slate)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  const style = { info: 'bg-accent-soft text-accent-strong', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger', ok: 'bg-ok-soft text-ok' }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-xl px-4 py-3 text-sm font-medium', style)}>{children}</div>;
}

export const inputClass =
  'block w-full rounded-xl border border-line-strong bg-white px-3.5 h-11 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15';
export const textareaClass = cx(inputClass, 'h-auto min-h-24 py-2.5 leading-relaxed');
export const labelClass = 'mb-1.5 block text-sm font-medium text-ink-2';
