import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Button, Checkbox, TextField } from 'nogasds';
import { googleSimulatorEnabled } from '@/lib/auth/google-oauth';
import styles from './google.module.css';

export const metadata: Metadata = { title: 'Google simulado (desenvolvimento)', robots: { index: false } };

/** Tela de desenvolvimento no lugar do Google: você diz quem é a pessoa que "entrou" e ela volta para o Garnic. */
async function Simulator({ searchParams }: { searchParams: PageProps<'/dev/google'>['searchParams'] }) {
  await connection(); // lê variável de ambiente em tempo de requisição
  if (!googleSimulatorEnabled()) notFound();
  const { state } = await searchParams;
  const value = typeof state === 'string' ? state : '';

  return (
    <form method="get" action="/api/auth/google/callback" className={styles.form}>
      <p className={styles.note}>
        Simulação do Google, só em desenvolvimento e só enquanto não há credenciais (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).
        Escolha quem “entrou”: o mesmo identificador sempre é a mesma conta do Google.
      </p>
      <input type="hidden" name="state" value={value} />
      <input type="hidden" name="sim" value="1" />
      <TextField name="sub" label="Identificador da conta (sub)" defaultValue="google-simulado-1" />
      <TextField name="email" type="email" label="E-mail" defaultValue="pessoa@gmail.com" />
      <TextField name="name" label="Nome" defaultValue="Pessoa Teste" />
      <Checkbox name="email_verified" label="E-mail verificado pelo Google" defaultChecked />
      <Button type="submit">Entrar com este Google</Button>
      <Button type="submit" variant="outline" name="error" value="access_denied" formNoValidate>
        Cancelar (como quem recusa no Google)
      </Button>
    </form>
  );
}

export default function SimulatedGooglePage(props: PageProps<'/dev/google'>) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Google simulado</h1>
      <Suspense fallback={null}>
        <Simulator searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
