import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chore, Member } from './types';

/** All chores the caller may see (row level security: parents see the household's, children their own). */
export async function listChores(supabase: SupabaseClient, filter: { assignedTo?: string } = {}) {
  let q = supabase.from('chores').select('*').order('created_at', { ascending: false }).limit(1000);
  if (filter.assignedTo) q = q.eq('assigned_to', filter.assignedTo);
  const { data } = await q;
  return (data ?? []) as Chore[];
}

export async function listChildren(supabase: SupabaseClient) {
  const { data } = await supabase.from('members').select('*').eq('role', 'child').order('created_at');
  return (data ?? []) as Member[];
}

export async function getChore(supabase: SupabaseClient, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from('chores').select('*').eq('id', id).maybeSingle();
  return (data ?? null) as Chore | null;
}

/** Short-lived link to a private proof photo. Storage policies decide whether the caller may see it. */
export async function photoUrl(supabase: SupabaseClient, path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from('proofs').createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}

/** Chores still to do that are due today or earlier. */
export const isDueByToday = (c: Chore, today: string) => (c.status === 'assigned' || c.status === 'needs_changes') && !!c.due_date && c.due_date <= today;
export const isOpen = (c: Chore) => c.status === 'assigned' || c.status === 'needs_changes';

export function byDue(a: Chore, b: Chore) {
  return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at);
}
