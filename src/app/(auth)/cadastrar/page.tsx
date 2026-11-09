import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { SignupForm } from '../_components/SignupForm';

export const metadata: Metadata = { title: 'Criar conta' };

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect('/');
  return null;
}

export default function SignupPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <SignupForm />
    </>
  );
}
