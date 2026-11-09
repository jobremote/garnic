import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { readPendingUserId } from '@/lib/auth/cookies';
import { findUserById, isSignupExpired } from '@/lib/auth/users';
import { getDb } from '@/lib/db';
import { devMailboxEnabled } from '@/lib/email/mailer';
import { VerifyForm } from '../../_components/VerifyForm';
import { buildVerifyState } from '../../verify-state';
import styles from '../../auth.module.css';

export const metadata: Metadata = { title: 'Valide seu e-mail' };

/** Lê o cadastro em andamento (cookie) e o estado do código (banco): por isso fica atrás de um Suspense. */
async function VerifyContent() {
  await connection(); // o prazo do código e a contagem do reenvio dependem da hora: nunca pré-renderizar
  const userId = await readPendingUserId();
  if (!userId) redirect('/cadastrar');

  const db = await getDb();
  const user = await findUserById(db, userId);
  if (!user || isSignupExpired(user)) redirect('/cadastro-expirado');
  if (user.emailVerifiedAt) redirect('/entrar');

  return (
    <>
      <VerifyForm email={user.email} initialState={await buildVerifyState(db, user.id)} />
      {devMailboxEnabled() ? (
        <p className={styles.hint}>
          Ambiente de desenvolvimento: o código chega na <Link href="/dev/emails">caixa de saída</Link>.
        </p>
      ) : null}
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
