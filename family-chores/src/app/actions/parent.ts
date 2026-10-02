'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { createAdminClient, childEmail } from '@/lib/supabase/admin';
import { errorMessage } from '@/lib/format';
import { AVATAR_COLORS, type RewardType } from '@/lib/types';
import type { FormState } from './auth';

function keep(form: FormData, error: string): FormState {
  const values: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === 'string' && !/pin/i.test(k) && !k.startsWith('$')) values[k] = v; });
  return { error, values };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Server-side role check from the database; anything the browser claims is ignored. */
async function parentSession() {
  const s = await getSession();
  if (!s.member || s.member.role !== 'parent') throw new Error('Only a parent can do that.');
  return { supabase: s.supabase, member: s.member };
}

function parseReward(form: FormData): { type: RewardType; amount: number | null; note: string | null } | string {
  const type = str(form, 'reward_type') as RewardType;
  if (type === 'money') {
    const raw = str(form, 'reward_money').replace(',', '.').replace(/[€\s]/g, '');
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(raw)) return 'Enter an amount like 5 or 2.50.';
    const cents = Math.round(Number(raw) * 100);
    if (cents < 1 || cents > 100000) return 'Enter an amount between €0.01 and €1,000.';
    return { type, amount: cents, note: null };
  }
  if (type === 'screen_time') {
    const min = Number(str(form, 'reward_minutes'));
    if (!Number.isInteger(min) || min < 1 || min > 1440) return 'Enter screen time in whole minutes (1 to 1440).';
    return { type, amount: min, note: null };
  }
  if (type === 'custom') {
    const note = str(form, 'reward_note');
    if (!note || note.length > 80) return 'Describe the reward in up to 80 characters.';
    return { type, amount: null, note };
  }
  return 'Choose a reward type.';
}

export async function saveChore(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await parentSession();
  const id = str(form, 'id');
  const title = str(form, 'title');
  const description = str(form, 'description');
  const assignedTo = str(form, 'assigned_to');
  const due = str(form, 'due_date');
  if (!title || title.length > 80) return keep(form, 'Give the chore a title (up to 80 characters).');
  if (description.length > 1000) return keep(form, 'Keep the instructions under 1,000 characters.');
  if (!isUuid(assignedTo)) return keep(form, 'Choose who should do it.');
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return keep(form, 'That due date isn’t valid.');
  const reward = parseReward(form);
  if (typeof reward === 'string') return keep(form, reward);

  const args = {
    p_title: title, p_description: description, p_assigned_to: assignedTo,
    p_reward_type: reward.type, p_reward_amount: reward.amount, p_reward_note: reward.note, p_due_date: due || null,
  };
  let choreId = id;
  if (id) {
    if (!isUuid(id)) return keep(form, 'Chore not found.');
    const { error } = await supabase.rpc('update_chore', { p_chore_id: id, ...args });
    if (error) return keep(form, errorMessage(error));
  } else {
    const { data, error } = await supabase.rpc('create_chore', args);
    if (error) return keep(form, errorMessage(error));
    choreId = data as string;
  }
  revalidatePath('/parent', 'layout');
  redirect(id ? `/parent/chores/${choreId}?saved=1` : `/parent/chores?created=${choreId}`);
}

export async function deleteChore(form: FormData) {
  const { supabase } = await parentSession();
  const id = str(form, 'id');
  if (!isUuid(id)) return;
  const { data: path, error } = await supabase.rpc('delete_chore', { p_chore_id: id });
  if (!error && path) await supabase.storage.from('proofs').remove([path as string]);
  revalidatePath('/parent', 'layout');
  redirect('/parent/chores?deleted=1');
}

export async function reviewChore(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await parentSession();
  const id = str(form, 'id');
  const approve = str(form, 'decision') === 'approve';
  const feedback = str(form, 'feedback');
  if (!isUuid(id)) return { error: 'Chore not found.' };
  if (!approve && !feedback) return { error: 'Say what needs changing so they know what to do.' };
  if (feedback.length > 300) return { error: 'Keep the note under 300 characters.' };
  const { error } = await supabase.rpc('review_chore', { p_chore_id: id, p_approve: approve, p_feedback: feedback || null });
  if (error) return { error: errorMessage(error) };
  revalidatePath('/parent', 'layout');
  // Move straight on to the next submission, if there is one.
  const { data: next } = await supabase.from('chores').select('id').eq('status', 'submitted').order('submitted_at').limit(1).maybeSingle();
  redirect(next ? `/parent/chores/${next.id}?reviewed=${approve ? 'approved' : 'changes'}` : `/parent?reviewed=${approve ? 'approved' : 'changes'}`);
}

// ---------------------------------------------------------------- children

export async function addChild(_: FormState, form: FormData): Promise<FormState> {
  const { member } = await parentSession();
  const name = str(form, 'name');
  const pin = str(form, 'pin');
  const color = str(form, 'avatar_color');
  if (!name || name.length > 40) return { error: 'Enter the child’s first name.' };
  if (!/^\d{6}$/.test(pin)) return { error: 'Choose a 6-digit PIN.' };
  if (!(AVATAR_COLORS as readonly string[]).includes(color)) return { error: 'Choose a colour.' };

  const admin = createAdminClient();
  const { data: clash } = await admin.from('members').select('id').eq('household_id', member.household_id).eq('role', 'child').ilike('name', name.replace(/[%_\\]/g, '\\$&')).maybeSingle();
  if (clash) return { error: `There’s already a child called ${name}. Use a different name (for example with an initial).` };

  const id = randomUUID();
  const { error } = await admin.auth.admin.createUser({ id, email: childEmail(id), password: pin, email_confirm: true });
  if (error) return { error: 'The child couldn’t be added. Try again.' };
  const { error: e2 } = await admin.from('members').insert({ id, household_id: member.household_id, role: 'child', name, avatar_color: color });
  if (e2) {
    await admin.auth.admin.deleteUser(id);
    return { error: errorMessage(e2, 'The child couldn’t be added. Try again.') };
  }
  revalidatePath('/parent', 'layout');
  return { message: `${name} has been added. They can sign in with the household code, their name and PIN.` };
}

/** Confirms the child belongs to the caller's household (row level security limits the lookup). */
async function ownChild(childId: string) {
  const { supabase } = await parentSession();
  if (!isUuid(childId)) throw new Error('Child not found.');
  const { data } = await supabase.from('members').select('id, name').eq('id', childId).eq('role', 'child').maybeSingle();
  if (!data) throw new Error('Child not found.');
  return { supabase, child: data };
}

export async function updateChild(_: FormState, form: FormData): Promise<FormState> {
  const name = str(form, 'name');
  const color = str(form, 'avatar_color');
  const pin = str(form, 'pin');
  if (!name || name.length > 40) return { error: 'Enter a first name.' };
  if (pin && !/^\d{6}$/.test(pin)) return { error: 'A new PIN must be 6 digits.' };
  const { supabase, child } = await ownChild(str(form, 'id'));
  const { error } = await supabase.rpc('update_child', { p_child_id: child.id, p_name: name, p_avatar_color: color });
  if (error) return { error: errorMessage(error) };
  if (pin) {
    const { error: e2 } = await createAdminClient().auth.admin.updateUserById(child.id, { password: pin });
    if (e2) return { error: 'Saved, but the PIN couldn’t be changed. Try again.' };
  }
  revalidatePath('/parent', 'layout');
  return { message: pin ? 'Saved. The new PIN works from now on.' : 'Saved.' };
}

export async function removeChild(form: FormData) {
  const { supabase, child } = await ownChild(str(form, 'id'));
  const { data: chores } = await supabase.from('chores').select('photo_path').eq('assigned_to', child.id).not('photo_path', 'is', null);
  const admin = createAdminClient();
  const paths = (chores ?? []).map((c) => c.photo_path as string);
  if (paths.length) await admin.storage.from('proofs').remove(paths);
  // Deleting the account removes the member and their chores (database cascade).
  await admin.auth.admin.deleteUser(child.id);
  revalidatePath('/parent', 'layout');
  redirect('/parent/children?removed=1');
}

// ---------------------------------------------------------------- settings

export async function updateSettings(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, member } = await parentSession();
  const household = str(form, 'household');
  const name = str(form, 'name');
  if (!household || household.length > 60) return { error: 'Enter a household name.' };
  if (!name || name.length > 40) return { error: 'Enter your name.' };
  const a = await supabase.rpc('update_household', { p_name: household });
  const b = await supabase.rpc('update_my_profile', { p_name: name, p_avatar_color: member.avatar_color });
  if (a.error || b.error) return { error: errorMessage(a.error ?? b.error) };
  revalidatePath('/parent', 'layout');
  return { message: 'Saved.' };
}
