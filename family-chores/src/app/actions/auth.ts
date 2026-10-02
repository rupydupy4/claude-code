'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, childEmail } from '@/lib/supabase/admin';

export type FormState = { error?: string; message?: string; values?: Record<string, string> } | undefined;

/** An error that also hands back what was typed (never passwords or PINs), so the form keeps it. */
function failWith(form: FormData, error: string): FormState {
  const values: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === 'string' && !/password|pin/i.test(k) && !k.startsWith('$')) values[k] = v; });
  return { error, values };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, 'email');
  const password = String(form.get('password') ?? '');
  if (!email || !password) return failWith(form, 'Enter your email and password.');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return failWith(form, error.message.includes('Email not confirmed') ? 'Please confirm your email address first (check your inbox).' : 'That email and password don’t match.');
  redirect('/');
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const name = str(form, 'name');
  const householdName = str(form, 'household');
  const email = str(form, 'email');
  const password = String(form.get('password') ?? '');
  const timeZone = str(form, 'timeZone') || 'UTC';
  if (!name || !householdName) return failWith(form, 'Enter your name and a household name.');
  if (name.length > 40 || householdName.length > 60) return failWith(form, 'Please use a shorter name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return failWith(form, 'Enter a valid email address.');
  if (password.length < 8) return failWith(form, 'Use a password of at least 8 characters.');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, household_name: householdName, time_zone: timeZone } } });
  if (error) return failWith(form, error.message.includes('registered') ? 'An account with that email already exists. Sign in instead.' : error.message);
  // With email confirmation on, there's no session yet: the household is created on first sign-in.
  if (!data.session) return { message: 'Check your email to confirm your address, then sign in to finish setting up.' };
  const { error: hhError } = await supabase.rpc('create_household', { p_household_name: householdName, p_parent_name: name, p_time_zone: timeZone });
  if (hhError) return failWith(form, 'Your account was created, but the household couldn’t be. Sign in to try again.');
  redirect('/parent');
}

/** First sign-in after confirming email, or a parent account without a household. */
export async function createHousehold(_: FormState, form: FormData): Promise<FormState> {
  const name = str(form, 'name');
  const householdName = str(form, 'household');
  if (!name || !householdName) return failWith(form, 'Enter your name and a household name.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_household', { p_household_name: householdName, p_parent_name: name, p_time_zone: str(form, 'timeZone') || 'UTC' });
  if (error) return failWith(form, error.message.includes('already') ? 'You already belong to a household.' : 'The household couldn’t be created. Try again.');
  redirect('/parent');
}

/**
 * Children sign in with the household code, their first name and the PIN a parent set.
 * The lookup runs on the server; the answer is the same whichever part is wrong.
 */
export async function signInChild(_: FormState, form: FormData): Promise<FormState> {
  const code = str(form, 'code').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const name = str(form, 'name');
  const pin = str(form, 'pin');
  const fail = failWith(form, 'That household code, name or PIN isn’t right. Ask a parent to check.');
  if (code.length !== 6 || !name || !/^\d{6}$/.test(pin)) return fail;

  const admin = createAdminClient();
  const { data: household } = await admin.from('households').select('id').eq('join_code', code).maybeSingle();
  if (!household) return fail;
  const { data: child } = await admin.from('members').select('id').eq('household_id', household.id).eq('role', 'child').ilike('name', name.replace(/[%_\\]/g, '\\$&')).maybeSingle();
  if (!child) return fail;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: childEmail(child.id), password: pin });
  if (error) return fail;
  redirect('/child');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
