import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function Home() {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  if (!s.member) redirect('/setup');
  redirect(s.member.role === 'parent' ? '/parent' : '/child');
}
