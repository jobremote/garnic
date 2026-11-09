import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from '../_components/LoginForm';

export const metadata: Metadata = { title: 'Entrar' };

/** Quem já está logado vai direto para o início. Lê o cookie, então fica atrás de um Suspense. */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect('/');
  return null;
}

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <LoginForm />
    </>
  );
}
