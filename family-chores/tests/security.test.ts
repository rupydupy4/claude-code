/**
 * Database security tests against a running Supabase (local: `supabase start`, then `npm test`).
 * They act as real parents, children and outsiders through the public API, exactly as a
 * browser could, and check that row level security and the chore functions hold.
 */
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

config({ path: ['.env.local', '.env'], quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = randomUUID().slice(0, 8);
const created: string[] = [];

async function signedIn(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

async function makeParent(label: string, household: string) {
  const email = `${label}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'password-123', email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const c = await signedIn(email, 'password-123');
  const { data: hid, error: e2 } = await c.rpc('create_household', { p_household_name: household, p_parent_name: label, p_time_zone: 'Europe/Dublin' });
  if (e2) throw e2;
  return { client: c, id: data.user.id, householdId: hid as string };
}

async function makeChild(householdId: string, name: string) {
  const id = randomUUID();
  const email = `child-${id}@children.family-chores.invalid`;
  const { error } = await admin.auth.admin.createUser({ id, email, password: '123456', email_confirm: true });
  if (error) throw error;
  created.push(id);
  const { error: e2 } = await admin.from('members').insert({ id, household_id: householdId, role: 'child', name });
  if (e2) throw e2;
  return { client: await signedIn(email, '123456'), id };
}

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(1), 0xff, 0xd9])], { type: 'image/jpeg' });

let A: Awaited<ReturnType<typeof makeParent>>;
let B: Awaited<ReturnType<typeof makeParent>>;
let alex: { client: SupabaseClient; id: string };
let jamie: { client: SupabaseClient; id: string };
let outsiderChild: { client: SupabaseClient; id: string };
let choreId: string;
let photoPath: string;

beforeAll(async () => {
  A = await makeParent('parentA', 'Household A');
  B = await makeParent('parentB', 'Household B');
  alex = await makeChild(A.householdId, `Alex${run}`);
  jamie = await makeChild(A.householdId, `Jamie${run}`);
  outsiderChild = await makeChild(B.householdId, `Sam${run}`);
  const { data, error } = await A.client.rpc('create_chore', {
    p_title: 'Clean bedroom', p_description: 'Make the bed', p_assigned_to: alex.id,
    p_reward_type: 'money', p_reward_amount: 500, p_reward_note: null, p_due_date: null,
  });
  if (error) throw error;
  choreId = data as string;
  photoPath = `${A.householdId}/${choreId}/${randomUUID()}.jpg`;
}, 60_000);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  for (const h of [A?.householdId, B?.householdId].filter(Boolean)) await admin.from('households').delete().eq('id', h!);
  if (photoPath) await admin.storage.from('proofs').remove([photoPath]);
});

describe('household isolation', () => {
  it('a parent sees only their own household, members and chores', async () => {
    const hh = await B.client.from('households').select('id');
    expect(hh.data?.map((h) => h.id)).toEqual([B.householdId]);
    const members = await B.client.from('members').select('id');
    expect(members.data?.map((m) => m.id).sort()).toEqual([B.id, outsiderChild.id].sort());
    const chores = await B.client.from('chores').select('id');
    expect(chores.data).toEqual([]);
  });

  it('a child sees only chores assigned to them', async () => {
    expect((await alex.client.from('chores').select('id')).data?.map((c) => c.id)).toEqual([choreId]);
    expect((await jamie.client.from('chores').select('id')).data).toEqual([]);
    expect((await outsiderChild.client.from('chores').select('id')).data).toEqual([]);
  });

  it('signed-out visitors see nothing', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.from('chores').select('id')).data ?? []).toEqual([]);
    expect((await anon.from('households').select('id')).data ?? []).toEqual([]);
    expect((await anon.rpc('review_chore', { p_chore_id: choreId, p_approve: true, p_feedback: null })).error).toBeTruthy();
  });

  it('a parent cannot assign a chore to another household’s child', async () => {
    const { error } = await A.client.rpc('create_chore', {
      p_title: 'Sneaky', p_description: '', p_assigned_to: outsiderChild.id,
      p_reward_type: 'money', p_reward_amount: 100, p_reward_note: null, p_due_date: null,
    });
    expect(error?.message).toMatch(/Choose a child/);
  });

  it('a parent cannot review another household’s chore', async () => {
    const { error } = await B.client.rpc('review_chore', { p_chore_id: choreId, p_approve: true, p_feedback: null });
    expect(error?.message).toMatch(/not found/);
  });
});

describe('children cannot act as parents', () => {
  it('cannot create, edit or delete chores', async () => {
    const create = await alex.client.rpc('create_chore', {
      p_title: 'Free money', p_description: '', p_assigned_to: alex.id, p_reward_type: 'money', p_reward_amount: 100000, p_reward_note: null, p_due_date: null,
    });
    expect(create.error?.message).toMatch(/Only a parent/);
    expect((await alex.client.rpc('delete_chore', { p_chore_id: choreId })).error?.message).toMatch(/Only a parent/);
  });

  it('cannot write tables directly, even to change their own role or a chore status', async () => {
    const upd = await alex.client.from('chores').update({ status: 'approved' }).eq('id', choreId).select();
    expect(upd.error ?? (upd.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const role = await alex.client.from('members').update({ role: 'parent' }).eq('id', alex.id).select();
    expect(role.error ?? (role.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const ins = await alex.client.from('members').insert({ id: randomUUID(), household_id: A.householdId, role: 'parent', name: 'Evil' });
    expect(ins.error).toBeTruthy();
    const { data } = await admin.from('chores').select('status').eq('id', choreId).single();
    expect(data?.status).toBe('assigned');
  });

  it('cannot hand in a chore assigned to someone else', async () => {
    expect((await jamie.client.rpc('submit_chore', { p_chore_id: choreId, p_photo_path: null, p_note: null })).error?.message).toMatch(/not found/);
  });
});

describe('photo proof storage', () => {
  it('rejects uploads from other children, wrong folders, non-images and large files', async () => {
    expect((await jamie.client.storage.from('proofs').upload(`${A.householdId}/${choreId}/x.jpg`, jpeg())).error).toBeTruthy();
    expect((await alex.client.storage.from('proofs').upload(`${B.householdId}/${choreId}/x.jpg`, jpeg())).error).toBeTruthy();
    expect((await alex.client.storage.from('proofs').upload(`${A.householdId}/${choreId}/x.txt`, new Blob(['hi'], { type: 'text/plain' }))).error).toBeTruthy();
    const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/jpeg' });
    expect((await alex.client.storage.from('proofs').upload(`${A.householdId}/${choreId}/big.jpg`, big)).error).toBeTruthy();
  });

  it('lets the assigned child upload, then hand in with the photo', async () => {
    const up = await alex.client.storage.from('proofs').upload(photoPath, jpeg(), { contentType: 'image/jpeg' });
    expect(up.error).toBeNull();
    const bad = await alex.client.rpc('submit_chore', { p_chore_id: choreId, p_photo_path: `${B.householdId}/x/y.jpg`, p_note: null });
    expect(bad.error?.message).toMatch(/Invalid photo/);
    const ok = await alex.client.rpc('submit_chore', { p_chore_id: choreId, p_photo_path: photoPath, p_note: 'Done!' });
    expect(ok.error).toBeNull();
    expect((await alex.client.rpc('submit_chore', { p_chore_id: choreId, p_photo_path: null, p_note: null })).error?.message).toMatch(/already/);
  });

  it('photos are private: no public URL, no access from another household', async () => {
    const res = await fetch(`${URL}/storage/v1/object/public/proofs/${photoPath}`);
    expect(res.ok).toBe(false);
    expect((await B.client.storage.from('proofs').createSignedUrl(photoPath, 60)).error).toBeTruthy();
    expect((await outsiderChild.client.storage.from('proofs').createSignedUrl(photoPath, 60)).error).toBeTruthy();
    expect((await jamie.client.storage.from('proofs').createSignedUrl(photoPath, 60)).error).toBeTruthy();
    const mine = await A.client.storage.from('proofs').createSignedUrl(photoPath, 60);
    expect(mine.error).toBeNull();
    expect((await fetch(mine.data!.signedUrl)).ok).toBe(true);
  });
});

describe('review workflow', () => {
  it('a child can never approve, even their own submitted chore', async () => {
    const { error } = await alex.client.rpc('review_chore', { p_chore_id: choreId, p_approve: true, p_feedback: null });
    expect(error?.message).toMatch(/Only a parent/);
  });

  it('asking for changes needs a reason, and the child can resubmit', async () => {
    expect((await A.client.rpc('review_chore', { p_chore_id: choreId, p_approve: false, p_feedback: ' ' })).error?.message).toMatch(/Say what needs/);
    expect((await A.client.rpc('review_chore', { p_chore_id: choreId, p_approve: false, p_feedback: 'Please hoover too' })).error).toBeNull();
    const seen = await alex.client.from('chores').select('status, feedback').eq('id', choreId).single();
    expect(seen.data).toEqual({ status: 'needs_changes', feedback: 'Please hoover too' });
    expect((await alex.client.rpc('submit_chore', { p_chore_id: choreId, p_photo_path: null, p_note: 'Hoovered' })).error).toBeNull();
  });

  it('a parent approves and the reward is recorded', async () => {
    expect((await A.client.rpc('review_chore', { p_chore_id: choreId, p_approve: true, p_feedback: null })).error).toBeNull();
    const { data } = await alex.client.from('chores').select('status, approved_at, reward_amount, photo_path').eq('id', choreId).single();
    expect(data?.status).toBe('approved');
    expect(data?.approved_at).toBeTruthy();
    expect(data?.reward_amount).toBe(500);
    expect(data?.photo_path).toBe(photoPath);
    expect((await A.client.rpc('review_chore', { p_chore_id: choreId, p_approve: false, p_feedback: 'x' })).error?.message).toMatch(/isn.t waiting/);
  });
});

// ---------------------------------------------------------------- part 2: repeating chores, points, payouts

const dublinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const plusDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoDow = (day: string) => { const w = new Date(`${day}T12:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
const choreArgs = (assignee: string, extra: Record<string, unknown> = {}) => ({
  p_title: 'Feed the cat', p_description: '', p_assigned_to: assignee, p_reward_type: 'money', p_reward_amount: 100,
  p_reward_note: null, p_due_date: null, ...extra,
});

describe('repeating chores', () => {
  let dailyId: string;

  it('validates the repeat rule in the database', async () => {
    const noDays = await A.client.rpc('create_chore', choreArgs(alex.id, { p_repeat: 'weekly', p_repeat_days: [] }));
    expect(noDays.error?.message).toMatch(/Choose at least one day/);
    const badPoints = await A.client.rpc('create_chore', choreArgs(alex.id, { p_points: 5000 }));
    expect(badPoints.error).toBeTruthy();
    const badDays = await A.client.rpc('create_chore', choreArgs(alex.id, { p_repeat: 'weekly', p_repeat_days: [0, 8, 3, 3] }));
    expect(badDays.error).toBeNull();
    const { data } = await admin.from('chores').select('repeat_days').eq('id', badDays.data as string).single();
    expect(data?.repeat_days).toEqual([3]); // cleaned to valid, unique weekdays
    await A.client.rpc('delete_chore', { p_chore_id: badDays.data });
  });

  it('children cannot create repeating chores or change points', async () => {
    expect((await alex.client.rpc('create_chore', choreArgs(alex.id, { p_repeat: 'daily', p_points: 1000 }))).error?.message).toMatch(/Only a parent/);
    const upd = await alex.client.from('chores').update({ points: 1000, repeat: 'daily' }).eq('id', choreId).select();
    expect(upd.error ?? (upd.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const { data } = await admin.from('chores').select('points').eq('id', choreId).single();
    expect(data?.points).toBe(10);
  });

  it('a daily chore without a date starts today, and approving it creates exactly one next instance', async () => {
    const today = dublinToday();
    const { data, error } = await A.client.rpc('create_chore', choreArgs(alex.id, { p_repeat: 'daily', p_points: 15 }));
    expect(error).toBeNull();
    dailyId = data as string;
    const first = await alex.client.from('chores').select('due_date, repeat, points').eq('id', dailyId).single();
    expect(first.data).toEqual({ due_date: today, repeat: 'daily', points: 15 });

    expect((await alex.client.rpc('submit_chore', { p_chore_id: dailyId, p_photo_path: null, p_note: null })).error).toBeNull();
    expect((await A.client.rpc('review_chore', { p_chore_id: dailyId, p_approve: true, p_feedback: null })).error).toBeNull();
    // A second approval is refused, so no duplicate is created.
    expect((await A.client.rpc('review_chore', { p_chore_id: dailyId, p_approve: true, p_feedback: null })).error?.message).toMatch(/isn.t waiting/);

    const next = await alex.client.from('chores').select('id, status, due_date, points, repeat, series_id, title, reward_amount').eq('series_id', dailyId);
    expect(next.data).toHaveLength(1);
    expect(next.data![0]).toMatchObject({ status: 'assigned', due_date: plusDays(today, 1), points: 15, repeat: 'daily', title: 'Feed the cat', reward_amount: 100 });
    // Other households and other children can't see the new instance.
    expect((await B.client.from('chores').select('id').eq('series_id', dailyId)).data).toEqual([]);
    expect((await jamie.client.from('chores').select('id').eq('series_id', dailyId)).data).toEqual([]);
  });

  it('sending a repeating chore back does not create a new one', async () => {
    const { data: next } = await admin.from('chores').select('id').eq('series_id', dailyId).single();
    await alex.client.rpc('submit_chore', { p_chore_id: next!.id, p_photo_path: null, p_note: null });
    expect((await A.client.rpc('review_chore', { p_chore_id: next!.id, p_approve: false, p_feedback: 'Fill the water bowl too' })).error).toBeNull();
    expect((await admin.from('chores').select('id').eq('series_id', dailyId)).data).toHaveLength(1);
    await A.client.rpc('delete_chore', { p_chore_id: next!.id });
  });

  it('a weekly chore is scheduled on the next chosen weekday', async () => {
    const today = dublinToday();
    const days = [isoDow(plusDays(today, 2)), isoDow(plusDays(today, 5))];
    const { data: id } = await A.client.rpc('create_chore', choreArgs(jamie.id, { p_repeat: 'weekly', p_repeat_days: days, p_due_date: today }));
    await jamie.client.rpc('submit_chore', { p_chore_id: id, p_photo_path: null, p_note: null });
    expect((await A.client.rpc('review_chore', { p_chore_id: id, p_approve: true, p_feedback: null })).error).toBeNull();
    const { data } = await admin.from('chores').select('due_date, assigned_to').eq('series_id', id as string).single();
    expect(data).toEqual({ due_date: plusDays(today, 2), assigned_to: jamie.id });
  });

  it('internal helpers cannot be called by users', async () => {
    expect((await alex.client.rpc('household_today', { p_household: A.householdId })).error).toBeTruthy();
    expect((await A.client.rpc('next_due_date', { p_after: '2026-01-01', p_repeat: 'daily', p_days: [] })).error).toBeTruthy();
  });
});

describe('reward payouts', () => {
  it('children cannot mark rewards as paid out, even their own', async () => {
    const { error } = await alex.client.rpc('mark_rewards_paid', { p_child_id: alex.id, p_reward_type: 'money', p_chore_id: null });
    expect(error?.message).toMatch(/Only a parent/);
    const ins = await alex.client.from('payouts').insert({ household_id: A.householdId, child_id: alex.id, reward_type: 'money', amount: 1, chore_count: 1 });
    expect(ins.error).toBeTruthy();
  });

  it('signed-out visitors and other households cannot mark payouts', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc('mark_rewards_paid', { p_child_id: alex.id, p_reward_type: 'money', p_chore_id: null })).error).toBeTruthy();
    expect((await B.client.rpc('mark_rewards_paid', { p_child_id: alex.id, p_reward_type: 'money', p_chore_id: null })).error?.message).toMatch(/Choose a child/);
    const { data } = await admin.from('chores').select('payout_id').eq('id', choreId).single();
    expect(data?.payout_id).toBeNull();
  });

  it('a parent marks all owed money as paid out once; the payout is recorded', async () => {
    // Alex has two approved money chores: €5 (Clean bedroom) and €1 (the first daily Feed the cat).
    const { data: pid, error } = await A.client.rpc('mark_rewards_paid', { p_child_id: alex.id, p_reward_type: 'money', p_chore_id: null });
    expect(error).toBeNull();
    const { data: payout } = await A.client.from('payouts').select('child_id, reward_type, amount, chore_count, paid_by').eq('id', pid as string).single();
    expect(payout).toEqual({ child_id: alex.id, reward_type: 'money', amount: 600, chore_count: 2, paid_by: A.id });
    const { data: chore } = await alex.client.from('chores').select('payout_id, paid_at').eq('id', choreId).single();
    expect(chore?.payout_id).toBe(pid);
    expect(chore?.paid_at).toBeTruthy();
    // Nothing left to pay, so a second tap does nothing.
    expect((await A.client.rpc('mark_rewards_paid', { p_child_id: alex.id, p_reward_type: 'money', p_chore_id: null })).error?.message).toMatch(/Nothing to pay out/);
  });

  it('payout records are private to the household, and children see only their own', async () => {
    expect((await alex.client.from('payouts').select('child_id')).data?.map((p) => p.child_id)).toEqual([alex.id]);
    expect((await jamie.client.from('payouts').select('id')).data).toEqual([]);
    expect((await B.client.from('payouts').select('id')).data).toEqual([]);
    expect((await outsiderChild.client.from('payouts').select('id')).data).toEqual([]);
  });

  it('only approved chores can be paid, and a chore from another child is refused', async () => {
    const { data: open } = await A.client.rpc('create_chore', choreArgs(jamie.id));
    expect((await A.client.rpc('mark_rewards_paid', { p_child_id: jamie.id, p_reward_type: 'money', p_chore_id: open })).error?.message).toMatch(/Nothing to pay out/);
    expect((await A.client.rpc('mark_rewards_paid', { p_child_id: alex.id, p_reward_type: 'money', p_chore_id: open })).error?.message).toMatch(/Nothing to pay out/);
  });
});
