import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { readGooglePending } from '@/lib/auth/cookies';
import { LinkGoogleForm } from '../../_components/LinkGoogleForm';

export const metadata: Metadata = { title: 'Vincular conta' };

/** Quem voltou do Google com o e-mail de uma conta existente. O perfil vem de um cookie assinado de 10 minutos. */
async function Content() {
  await connection(); // o cookie vence com o tempo: nunca pré-renderizar
  const profile = await readGooglePending();
  if (!profile) redirect('/entrar/erro-google');
  return <LinkGoogleForm email={profile.email} />;
}

export default function LinkGooglePage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
