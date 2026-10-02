import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/AuthCard';
import { SetupForm } from '@/components/AuthForms';
import { getSession } from '@/lib/session';
import { signOut } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Set up your household' };

export default async function SetupPage() {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  if (s.member) redirect('/');
  const { data } = await s.supabase.auth.getUser();
  const meta = (data.user?.user_metadata ?? {}) as { name?: string; household_name?: string };
  return (
    <AuthCard title="Set up your household" subtitle="One last step." footer={<form action={signOut}><button className="font-semibold text-accent">Sign out</button></form>}>
      <SetupForm name={meta.name ?? ''} household={meta.household_name ?? ''} />
    </AuthCard>
  );
}
