'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { CheckSquare, Gift, Home, LayoutDashboard, Settings, Users } from 'lucide-react';
import { cx } from './ui';

const ICONS = { home: Home, dashboard: LayoutDashboard, chores: CheckSquare, children: Users, rewards: Gift, settings: Settings };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ nav, root, householdName, userName, children }: { nav: NavItem[]; root: string; householdName: string; userName: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-card px-4 py-6 lg:flex">
        <Link href={root} className="mb-8 flex items-center gap-2.5 px-2">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span className="font-semibold">Family Chores</span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map((n) => {
            const Icon = ICONS[n.icon];
            const active = isActive(pathname, n.href, root);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium', active ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-black/5 hover:text-ink')}>
                <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                {n.label}
                {!!n.badge && <span className="ml-auto rounded-full bg-warn-soft px-2 text-xs font-semibold text-warn tabular">{n.badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line px-2 pt-4 text-sm">
          <div className="font-medium">{userName}</div>
          <div className="text-ink-3">{householdName}</div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-canvas/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur lg:hidden">
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span className="truncate font-semibold">{householdName}</span>
        </header>
        <main className="mx-auto w-full max-w-4xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          const active = isActive(pathname, n.href, root);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
              className={cx('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', active ? 'text-accent' : 'text-ink-3')}>
              <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
              {n.label}
              {!!n.badge && <span className="absolute right-[calc(50%-20px)] top-1.5 h-2 w-2 rounded-full bg-warn" aria-label={`${n.badge} waiting`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
