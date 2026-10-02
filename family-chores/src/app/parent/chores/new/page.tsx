import type { Metadata } from 'next';
import { requireRole } from '@/lib/session';
import { listChildren } from '@/lib/data';
import { ChoreForm } from '@/components/ChoreForm';
import { ButtonLink, EmptyState, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Create chore' };

export default async function NewChorePage(props: PageProps<'/parent/chores/new'>) {
  const { child } = await props.searchParams;
  const { supabase } = await requireRole('parent');
  const kids = await listChildren(supabase);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create chore" />
      {kids.length ? (
        <ChoreForm kids={kids} presetChild={typeof child === 'string' ? child : undefined} cancelHref="/parent/chores" />
      ) : (
        <EmptyState title="Add a child first">
          <p>Chores are assigned to a child.</p>
          <ButtonLink href="/parent/children#add" className="mt-4">Add a child</ButtonLink>
        </EmptyState>
      )}
    </div>
  );
}
