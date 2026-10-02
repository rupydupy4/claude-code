// Usage: npm run demo:seed   (reads .env.local; needs SUPABASE_SERVICE_ROLE_KEY)
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { seedDemo, DEMO } from '../src/lib/demo-seed.ts';

config({ path: ['.env.local', '.env'], quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).');
const admin = createClient(url, key, { auth: { persistSession: false } });
await seedDemo(admin);
console.log(`Demo ready: ${DEMO.householdName} (code ${DEMO.joinCode})`);
console.log(`  Parent: ${DEMO.parent.email} / ${DEMO.parent.password}`);
for (const c of DEMO.children) console.log(`  Child: ${c.name}, PIN ${c.pin}`);
