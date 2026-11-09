import Link from 'next/link';
import { connection } from 'next/server';
import { devMailboxEnabled } from '@/lib/email/mailer';
import styles from '../auth.module.css';

/** Aviso só de desenvolvimento: onde achar o e-mail (código ou link), já que nada é enviado de verdade. */
export async function DevMailboxHint({ what }: { what: string }) {
  await connection(); // lê variável de ambiente em tempo de requisição
  if (!devMailboxEnabled()) return null;
  return (
    <p className={styles.hint}>
      Ambiente de desenvolvimento: {what} chega na <Link href="/dev/emails">caixa de saída</Link>.
    </p>
  );
}
