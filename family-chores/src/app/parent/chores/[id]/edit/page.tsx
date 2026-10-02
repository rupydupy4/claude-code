import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { getChore, listChildren } from '@/lib/data';
import { ChoreForm } from '@/components/ChoreForm';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Edit chore' };

export default async function EditChorePage(props: PageProps<'/parent/chores/[id]/edit'>) {
  const { id } = await props.params;
  const { supabase } = await requireRole('parent');
  const [chore, kids] = await Promise.all([getChore(supabase, id), listChildren(supabase)]);
  if (!chore) notFound();
  if (chore.status === 'approved') redirect(`/parent/chores/${id}`);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit chore" />
      <ChoreForm chore={chore} kids={kids} cancelHref={`/parent/chores/${id}`} />
    </div>
  );
}
