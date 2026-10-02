import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/AuthCard';
import { ChildSignInForm } from '@/components/AuthForms';

export const metadata: Metadata = { title: 'Child sign in' };

export default function ChildLoginPage() {
  return (
    <AuthCard title="Hi there" subtitle="Sign in with your household code, first name and PIN." footer={<Link href="/login" className="font-semibold text-accent">Parent sign in</Link>}>
      <ChildSignInForm />
    </AuthCard>
  );
}
