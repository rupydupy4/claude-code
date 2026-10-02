import type { Metadata } from 'next';
import { LogOut } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { signOut } from '@/app/actions/auth';
import { SettingsForm } from '@/components/SettingsForm';
import { Card, PageHeader, buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Settings' };

export default async function ParentSettings() {
  const { member, household } = await requireRole('parent');
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <Card className="p-5 sm:p-6"><SettingsForm household={household.name} name={member.name} /></Card>
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Household code</h2>
        <p className="mt-1 text-sm text-ink-2">Children use this to sign in, together with their name and PIN.</p>
        <p className="mt-3 font-mono text-xl font-semibold tracking-[0.25em] text-accent-strong">{household.join_code}</p>
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-ink-2">Only members of {household.name} can see your chores and photos. Photos are stored privately and shown through short-lived links. Children’s accounts hold only a first name and a PIN.</p>
      </Card>
      <form action={signOut}><button className={buttonClass('secondary')}><LogOut size={18} aria-hidden="true" />Sign out</button></form>
    </div>
  );
}
