'use client';
import { ErrorView } from '@/components/PageStates';

export default function ParentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/parent" />;
}
