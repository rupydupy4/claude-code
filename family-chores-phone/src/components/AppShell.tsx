import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CheckSquare, Gift, Home, LayoutDashboard, LogOut, Settings, Users } from 'lucide-react';
import { signOut } from '../lib/store';
import { Avatar, cx } from './ui';
import type { Member } from '../lib/types';

const ICONS = { home: Home, dashboard: LayoutDashboard, chores: CheckSquare, children: Users, rewards: Gift, settings: Settings };
export type NavItem = { to: string; label: string; icon: keyof typeof ICONS; badge?: number; end?: boolean };

export function AppShell({ nav, householdName, user, children }: { nav: NavItem[]; householdName: string; user: Member; children: ReactNode }) {
  const navigate = useNavigate();
  const switchUser = () => {
    signOut();
    navigate('/');
  };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-card px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span className="font-semibold">Family Chores</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium', isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-black/5 hover:text-ink')}>
                <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                {n.label}
                {!!n.badge && <span className="ml-auto rounded-full bg-warn-soft px-2 text-xs font-semibold text-warn tabular">{n.badge}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line px-2 pt-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} color={user.avatarColor} size={32} />
            <div className="min-w-0 text-sm"><div className="font-medium">{user.name}</div><div className="truncate text-ink-3">{householdName}</div></div>
          </div>
          <button type="button" onClick={switchUser} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"><LogOut size={16} aria-hidden="true" />Switch user</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-canvas/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur lg:hidden">
          <img src="./icon.svg" alt="" width={24} height={24} />
          <span className="min-w-0 flex-1 truncate font-semibold">{householdName}</span>
          <button type="button" onClick={switchUser} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 text-sm font-medium" aria-label={`${user.name}: switch user`}>
            <Avatar name={user.name} color={user.avatarColor} size={26} />Switch
          </button>
        </header>
        <main className="mx-auto w-full max-w-4xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-accent' : 'text-ink-3')}>
              <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
              {n.label}
              {!!n.badge && <span className="absolute right-[calc(50%-20px)] top-1.5 h-2 w-2 rounded-full bg-warn" aria-label={`${n.badge} waiting`} />}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
