/**
 * The Smith Family demo household. Self-contained (no app imports) so it runs both from the
 * app's "Reset demo" button and from `npm run demo:seed`. Resetting deletes and recreates only
 * the demo household and its accounts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const DEMO = {
  householdName: 'The Smith Family',
  joinCode: 'SMITHS',
  timeZone: 'Europe/Dublin',
  parent: { name: 'Sarah', email: 'sarah@demo.family-chores.invalid', password: 'smith-demo-2026' },
  children: [
    { name: 'Alex', pin: '111111', color: 'teal' },
    { name: 'Jamie', pin: '222222', color: 'violet' },
  ],
} as const;

const childEmail = (id: string) => `child-${id}@children.family-chores.invalid`;

function dayOffset(timeZone: string, n: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function removeDemo(admin: SupabaseClient) {
  const { data: hh } = await admin.from('households').select('id').eq('join_code', DEMO.joinCode).maybeSingle();
  if (hh) {
    const { data: members } = await admin.from('members').select('id').eq('household_id', hh.id);
    // Photos: <household>/<chore>/<file>
    const { data: folders } = await admin.storage.from('proofs').list(hh.id, { limit: 1000 });
    for (const f of folders ?? []) {
      const { data: files } = await admin.storage.from('proofs').list(`${hh.id}/${f.name}`, { limit: 1000 });
      if (files?.length) await admin.storage.from('proofs').remove(files.map((x) => `${hh.id}/${f.name}/${x.name}`));
    }
    for (const m of members ?? []) await admin.auth.admin.deleteUser(m.id);
    await admin.from('households').delete().eq('id', hh.id);
  }
  // A demo parent left without a household (e.g. after a failed seed).
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const stray = list?.users.find((u) => u.email === DEMO.parent.email);
  if (stray) await admin.auth.admin.deleteUser(stray.id);
}

export async function seedDemo(admin: SupabaseClient) {
  await removeDemo(admin);
  const must = <R extends { data: unknown; error: { message: string } | null }>(r: R, what: string) => {
    if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? 'no data'}`);
    return r.data as NonNullable<R['data']>;
  };
  const ok = (r: { error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
  };

  const parent = must(await admin.auth.admin.createUser({ email: DEMO.parent.email, password: DEMO.parent.password, email_confirm: true }), 'parent').user!;
  const household = must(await admin.from('households').insert({ name: DEMO.householdName, join_code: DEMO.joinCode, time_zone: DEMO.timeZone }).select('id').single(), 'household') as { id: string };
  ok(await admin.from('members').insert({ id: parent.id, household_id: household.id, role: 'parent', name: DEMO.parent.name, avatar_color: 'slate' }), 'parent member');

  const ids: Record<string, string> = {};
  for (const c of DEMO.children) {
    const id = randomUUID();
    ok(await admin.auth.admin.createUser({ id, email: childEmail(id), password: c.pin, email_confirm: true }), c.name);
    ok(await admin.from('members').insert({ id, household_id: household.id, role: 'child', name: c.name, avatar_color: c.color }), `${c.name} member`);
    ids[c.name] = id;
  }

  const today = dayOffset(DEMO.timeZone, 0);
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  // Bulk inserts send every column for every row, so give each row the same keys.
  const base = { household_id: household.id, created_by: parent.id, status: 'assigned', reward_amount: null, reward_note: null, due_date: null, submitted_at: null, approved_at: null, reviewed_by: null, created_at: new Date().toISOString() };
  ok(await admin.from('chores').insert([
    { ...base, title: 'Clean bedroom', description: 'Make the bed, put clothes in the wash basket and clear the floor. Hoover when you’re done.', assigned_to: ids.Alex, reward_type: 'money', reward_amount: 500, due_date: today },
    { ...base, title: 'Take out bins', description: 'Take the green and black bins to the end of the drive. Bring them back in after collection.', assigned_to: ids.Jamie, reward_type: 'screen_time', reward_amount: 30, due_date: today },
    { ...base, title: 'Feed the dog', description: 'One scoop of dry food in the morning and fresh water in the bowl.', assigned_to: ids.Alex, reward_type: 'money', reward_amount: 200, due_date: today },
    { ...base, title: 'Unload the dishwasher', description: 'Put everything back where it belongs.', assigned_to: ids.Jamie, reward_type: 'money', reward_amount: 150, status: 'approved', submitted_at: ago(1.1), approved_at: ago(1), reviewed_by: parent.id, created_at: ago(2) },
    { ...base, title: 'Tidy the shoe rack', description: 'Pair up the shoes and put away anything that isn’t worn this week.', assigned_to: ids.Alex, reward_type: 'custom', reward_note: 'Pick Friday’s film', status: 'approved', submitted_at: ago(2.1), approved_at: ago(2), reviewed_by: parent.id, created_at: ago(3) },
  ]), 'chores');
  return { householdId: household.id };
}
