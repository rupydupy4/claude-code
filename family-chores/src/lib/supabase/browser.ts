'use client';
import { createBrowserClient } from '@supabase/ssr';

/** Browser client for the signed-in user; used only to upload photo proof straight to private storage. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
