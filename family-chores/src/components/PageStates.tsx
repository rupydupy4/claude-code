'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Skeleton, buttonClass } from './ui';

/** Shown by loading.tsx while a page's data loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-36" />
      <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-48" />
    </div>
  );
}

/** Shown by error.tsx when a page fails. Server error details are never shown. */
export function ErrorView({ error, retry, homeHref }: { error: Error & { digest?: string }; retry: () => void; homeHref: string }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md rounded-card border border-line bg-card p-6 text-center">
      <AlertTriangle size={28} className="mx-auto text-warn" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-1 text-ink-2">This page couldn’t be loaded. Check your connection and try again.</p>
      {error.digest && <p className="mt-2 text-xs text-ink-3">Reference: {error.digest}</p>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={() => retry()} className={buttonClass('primary')}><RotateCw size={17} aria-hidden="true" />Try again</button>
        <Link href={homeHref} className={buttonClass('secondary')}>Go to home</Link>
      </div>
    </div>
  );
}
