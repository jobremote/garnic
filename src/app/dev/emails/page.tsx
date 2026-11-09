import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { devEmails } from '@/lib/db/schema';
import { devMailboxEnabled } from '@/lib/email/mailer';
import styles from './emails.module.css';

export const metadata: Metadata = { title: 'Caixa de saída (desenvolvimento)', robots: { index: false } };

/** Tela de desenvolvimento: mostra os e-mails que, em produção, seriam enviados (por exemplo, o código de 6 dígitos). */
async function Mailbox() {
  await connection(); // dados de requisição: nunca pré-renderizar
  if (!devMailboxEnabled()) notFound();

  const rows = await (await getDb()).select().from(devEmails).orderBy(desc(devEmails.createdAt)).limit(20);
  if (rows.length === 0) return <p className={styles.empty}>Nenhum e-mail ainda.</p>;

  return (
    <ol className={styles.list}>
      {rows.map((mail) => (
        <li key={mail.id} className={styles.item}>
          <p className={styles.meta}>
            {mail.createdAt.toLocaleString('pt-BR')} · para {mail.toEmail}
          </p>
          <p className={styles.subject}>{mail.subject}</p>
          <pre className={styles.body}>{mail.body}</pre>
        </li>
      ))}
    </ol>
  );
}

export default function DevEmailsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Caixa de saída de desenvolvimento</h1>
      <Suspense fallback={null}>
        <Mailbox />
      </Suspense>
    </main>
  );
}
