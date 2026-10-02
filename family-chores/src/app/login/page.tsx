import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/AuthCard';
import { SignInForm } from '@/components/AuthForms';
import { Notice, buttonClass } from '@/components/ui';
import { demoSignIn, resetDemo } from '@/app/actions/demo';
import { DEMO } from '@/lib/demo-seed';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage(props: PageProps<'/login'>) {
  const { reset } = await props.searchParams;
  const demo = process.env.DEMO_MODE === 'true';
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Parents sign in with email."
      footer={
        <>
          <p>New here? <Link href="/signup" className="font-semibold text-accent">Create a household</Link></p>
          {demo && (
            <section aria-labelledby="demo-h" className="rounded-card border border-line bg-card p-5 text-left">
              <h2 id="demo-h" className="font-semibold text-ink">Try the demo</h2>
              <p className="mt-1 text-ink-2">{DEMO.householdName}: Sarah (parent) with Alex and Jamie. Shared sample data.</p>
              {reset && <div className="mt-3"><Notice tone="ok">Demo data has been reset.</Notice></div>}
              <form action={demoSignIn} className="mt-4 grid grid-cols-3 gap-2">
                <button name="who" value="parent" className={buttonClass('secondary', 'sm')}>Sarah</button>
                {DEMO.children.map((c) => <button key={c.name} name="who" value={c.name} className={buttonClass('secondary', 'sm')}>{c.name}</button>)}
              </form>
              <p className="mt-3 text-xs text-ink-3">Child sign-in: code {DEMO.joinCode}, PINs {DEMO.children.map((c) => `${c.name} ${c.pin}`).join(', ')}.</p>
              <form action={resetDemo} className="mt-2"><button className="text-xs font-semibold text-ink-2 underline underline-offset-2">Reset demo data</button></form>
            </section>
          )}
        </>
      }
    >
      <SignInForm />
      <div className="mt-6 border-t border-line pt-5 text-center">
        <Link href="/login/child" className={buttonClass('secondary', 'lg') + ' w-full'}>I’m a child</Link>
      </div>
    </AuthCard>
  );
}
