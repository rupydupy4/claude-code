import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/AuthCard';
import { SignUpForm } from '@/components/AuthForms';

export const metadata: Metadata = { title: 'Create a household' };

export default function SignUpPage() {
  return (
    <AuthCard title="Create your household" subtitle="You’ll be the parent account. Add children next." footer={<p>Already have an account? <Link href="/login" className="font-semibold text-accent">Sign in</Link></p>}>
      <SignUpForm />
    </AuthCard>
  );
}
