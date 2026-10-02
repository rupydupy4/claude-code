'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, childEmail } from '@/lib/supabase/admin';
import { DEMO, seedDemo } from '@/lib/demo-seed';

export const demoEnabled = async () => process.env.DEMO_MODE === 'true';

/** Signs in as one of the Smith family (creating the demo household on first use). */
export async function demoSignIn(form: FormData) {
  if (!(await demoEnabled())) return;
  const who = String(form.get('who'));
  const admin = createAdminClient();
  let { data: hh } = await admin.from('households').select('id').eq('join_code', DEMO.joinCode).maybeSingle();
  if (!hh) {
    await seedDemo(admin);
    ({ data: hh } = await admin.from('households').select('id').eq('join_code', DEMO.joinCode).maybeSingle());
  }
  const supabase = await createClient();
  if (who === 'parent') {
    await supabase.auth.signInWithPassword({ email: DEMO.parent.email, password: DEMO.parent.password });
    redirect('/parent');
  }
  const child = DEMO.children.find((c) => c.name === who);
  if (!child || !hh) return;
  const { data: m } = await admin.from('members').select('id').eq('household_id', hh.id).eq('name', child.name).maybeSingle();
  if (m) await supabase.auth.signInWithPassword({ email: childEmail(m.id), password: child.pin });
  redirect('/child');
}

export async function resetDemo() {
  if (!(await demoEnabled())) return;
  const supabase = await createClient();
  await supabase.auth.signOut();
  await seedDemo(createAdminClient());
  redirect('/login?reset=1');
}
