import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chore, Member, Payout } from './types';

export { byDue, isDueByToday, isOpen, isOverdue } from './schedule';

/** All chores the caller may see (row level security: parents see the household's, children their own). */
export async function listChores(supabase: SupabaseClient, filter: { assignedTo?: string } = {}) {
  let q = supabase.from('chores').select('*').order('created_at', { ascending: false }).limit(1000);
  if (filter.assignedTo) q = q.eq('assigned_to', filter.assignedTo);
  const { data, error } = await q;
  if (error) throw new Error('Chores couldn’t be loaded.');
  return (data ?? []) as Chore[];
}

export async function listChildren(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('members').select('*').eq('role', 'child').order('created_at');
  if (error) throw new Error('Children couldn’t be loaded.');
  return (data ?? []) as Member[];
}

/** Recent payout records (parents: the household; children: their own). */
export async function listPayouts(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase.from('payouts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error('Payouts couldn’t be loaded.');
  return (data ?? []) as Payout[];
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
