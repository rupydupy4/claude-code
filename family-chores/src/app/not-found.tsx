import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buttonClass } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center px-4 py-10">
      <div className="mx-auto max-w-md rounded-card border border-line bg-card p-6 text-center">
        <SearchX size={28} className="mx-auto text-ink-3" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-ink-2">This chore or page doesn’t exist, or you don’t have access to it.</p>
        <Link href="/" className={`${buttonClass('primary')} mt-5`}>Go to home</Link>
      </div>
    </main>
  );
}
