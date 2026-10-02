import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Household, Member } from './types';

/**
 * The signed-in user's membership, read from the database (never from anything the browser
 * sends). Cached per request.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { supabase, userId: null, member: null, household: null } as const;
  const { data: member } = await supabase.from('members').select('*').eq('id', userId).maybeSingle<Member>();
  if (!member) return { supabase, userId, member: null, household: null } as const;
  const { data: household } = await supabase.from('households').select('*').eq('id', member.household_id).single<Household>();
  return { supabase, userId, member, household: household! } as const;
});

export async function requireRole(role: 'parent' | 'child') {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  if (!s.member) redirect('/setup');
  if (s.member.role !== role) redirect(s.member.role === 'parent' ? '/parent' : '/child');
  return { supabase: s.supabase, member: s.member, household: s.household! };
}
