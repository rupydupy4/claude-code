import { AppShell, type NavItem } from '@/components/AppShell';
import { requireRole } from '@/lib/session';

export default async function ParentLayout({ children }: LayoutProps<'/parent'>) {
  const { supabase, member, household } = await requireRole('parent');
  const { count } = await supabase.from('chores').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
  const nav: NavItem[] = [
    { href: '/parent', label: 'Dashboard', icon: 'dashboard' },
    { href: '/parent/chores', label: 'Chores', icon: 'chores', badge: count ?? 0 },
    { href: '/parent/children', label: 'Children', icon: 'children' },
    { href: '/parent/rewards', label: 'Rewards', icon: 'rewards' },
    { href: '/parent/settings', label: 'Settings', icon: 'settings' },
  ];
  return <AppShell nav={nav} root="/parent" householdName={household.name} userName={member.name}>{children}</AppShell>;
}
