import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { BirthDateForm } from '../_components/BirthDateForm';

export const metadata: Metadata = { title: 'Data de nascimento' };

/** Contas criadas antes da idade mínima (27/11/2026) informam a data de nascimento antes de seguir. */
async function CompleteSignup() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  if (user.hasBirthDate) redirect('/');
  return <BirthDateForm />;
}

export default function CompleteSignupPage() {
  return (
    <Suspense fallback={null}>
      <CompleteSignup />
    </Suspense>
  );
}
