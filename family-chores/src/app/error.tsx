'use client';
import { ErrorView } from '@/components/PageStates';

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center px-4 py-10">
      <ErrorView error={error} retry={retry} homeHref="/" />
    </main>
  );
}
