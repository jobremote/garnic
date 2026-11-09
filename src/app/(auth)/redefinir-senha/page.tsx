import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { findValidResetToken } from '@/lib/auth/password-reset';
import { getDb } from '@/lib/db';
import { ExpiredLink } from '../_components/ExpiredLink';
import { ResetPasswordForm } from '../_components/ResetPasswordForm';

// O token está na URL: sem `Referer`, ele não vaza para nenhum site aberto a partir desta página.
export const metadata: Metadata = { title: 'Criar nova senha', referrer: 'no-referrer' };

/** Confere o link (banco e hora): mostra o formulário se ele vale, ou "Link expirado". */
async function ResetContent({ searchParams }: { searchParams: PageProps<'/redefinir-senha'>['searchParams'] }) {
  await connection(); // a validade do link depende da hora: nunca pré-renderizar
  const { token } = await searchParams;
  const value = typeof token === 'string' ? token : '';
  const valid = value ? await findValidResetToken(await getDb(), value) : null;
  return valid ? <ResetPasswordForm token={value} /> : <ExpiredLink />;
}

export default function ResetPasswordPage(props: PageProps<'/redefinir-senha'>) {
  return (
    <Suspense fallback={null}>
      <ResetContent searchParams={props.searchParams} />
    </Suspense>
  );
}
