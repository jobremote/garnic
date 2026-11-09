import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { readGooglePending } from '@/lib/auth/cookies';
import { GoogleSignupForm } from '../../_components/GoogleSignupForm';

export const metadata: Metadata = { title: 'Escolha seu @usuário' };

/** Quem voltou do Google com um e-mail novo. O perfil vem de um cookie assinado de 10 minutos. */
async function Content() {
  await connection(); // o cookie vence com o tempo: nunca pré-renderizar
  const profile = await readGooglePending();
  if (!profile) redirect('/entrar/erro-google');
  return <GoogleSignupForm name={profile.name} email={profile.email} />;
}

export default function GoogleSignupPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
