import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { FeedView } from './feed/_components/FeedView';
import type { FeedTab } from './feed/_components/FeedTabs';

export const metadata: Metadata = { title: { absolute: 'Início · Garnic' } };

/** Início: o feed (abas Seguindo e Meus jogos). Só para quem está logado. */
async function Feed({ searchParams }: { searchParams: Promise<{ aba?: string | string[] }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect('/entrar');
  const { aba } = await searchParams;
  const tab: FeedTab = aba === 'meus-jogos' ? 'meus-jogos' : 'seguindo';
  return <FeedView viewer={viewer} tab={tab} />;
}

export default function HomePage({ searchParams }: PageProps<'/'>) {
  return (
    <Suspense fallback={null}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}
