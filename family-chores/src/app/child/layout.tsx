import { AppShell, type NavItem } from '@/components/AppShell';
import { requireRole } from '@/lib/session';

export default async function ChildLayout({ children }: LayoutProps<'/child'>) {
  const { member, household } = await requireRole('child');
  const nav: NavItem[] = [
    { href: '/child', label: 'Home', icon: 'home' },
    { href: '/child/chores', label: 'My Chores', icon: 'chores' },
    { href: '/child/rewards', label: 'Rewards', icon: 'rewards' },
    { href: '/child/settings', label: 'Settings', icon: 'settings' },
  ];
  return <AppShell nav={nav} root="/child" householdName={household.name} userName={member.name}>{children}</AppShell>;
}
