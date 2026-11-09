import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from 'nogasds';
import { logoutAction } from '@/app/(auth)/actions';
import { getCurrentUser } from '@/lib/auth/current-user';
import styles from './home.module.css';

export const metadata: Metadata = { title: { absolute: 'Início · Garnic' } };

/** Início provisório: confirma o login. O feed e a estante chegam nas próximas entregas. */
async function Welcome() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');

  return (
    <>
      <h1 className={styles.title}>Olá, {user.name.split(/\s+/)[0]}</h1>
      <p className={styles.text}>
        Você entrou como <strong>@{user.username}</strong>. A estante de jogos e o feed chegam nas próximas entregas.
      </p>
      <form action={logoutAction}>
        <Button type="submit" variant="outline">
          Sair
        </Button>
      </form>
    </>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <p className={styles.brand}>Garnic</p>
      <Suspense fallback={null}>
        <Welcome />
      </Suspense>
    </main>
  );
}
