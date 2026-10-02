'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { errorMessage } from '@/lib/format';
import { AVATAR_COLORS } from '@/lib/types';
import type { FormState } from './auth';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** The photo (if any) is already in private storage; the database checks it belongs to this chore. */
export async function submitChore(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s.member || s.member.role !== 'child') return { error: 'Please sign in again.' };
  const id = str(form, 'id');
  const photoPath = str(form, 'photo_path') || null;
  const note = str(form, 'note');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Chore not found.' };
  if (note.length > 300) return { error: 'Keep your note short (300 characters).' };
  const { error } = await s.supabase.rpc('submit_chore', { p_chore_id: id, p_photo_path: photoPath, p_note: note || null });
  if (error) return { error: errorMessage(error) };
  revalidatePath('/child', 'layout');
  redirect(`/child?done=${id}`);
}

export async function updateMyColor(form: FormData) {
  const s = await getSession();
  if (!s.member) return;
  const color = str(form, 'avatar_color');
  if (!(AVATAR_COLORS as readonly string[]).includes(color)) return;
  await s.supabase.rpc('update_my_profile', { p_name: s.member.name, p_avatar_color: color });
  revalidatePath('/child', 'layout');
}
