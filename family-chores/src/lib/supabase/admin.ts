import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client: bypasses row level security. Server-only, and used for exactly two things:
 * managing children's sign-in accounts (after checking the caller is their parent) and the demo.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Children sign in with a PIN, so their auth account uses an internal address nobody receives mail at. */
export const childEmail = (memberId: string) => `child-${memberId}@children.family-chores.invalid`;
