import type { Db } from '@/lib/db/connect';
import { devEmails } from '@/lib/db/schema';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * A caixa de saída de desenvolvimento fica ligada fora de produção e onde `EMAIL_PROVIDER=dev`
 * (homologação, enquanto o Resend não está configurado).
 */
export const devMailboxEnabled = () => process.env.NODE_ENV !== 'production' || process.env.EMAIL_PROVIDER === 'dev';

/**
 * Envia um e-mail. Hoje só existe o envio de desenvolvimento: grava na tabela `dev_emails`
 * (tela `/dev/emails`) e imprime no terminal, sem enviar nada de verdade.
 * O envio real pelo Resend entra quando houver conta e domínio remetente (`00_gestao/pontos-em-aberto.md`).
 */
export async function sendEmail(db: Db, email: Email): Promise<void> {
  if (!devMailboxEnabled()) {
    throw new Error('O envio de e-mail ainda não está configurado: o Resend não foi ligado. Defina EMAIL_PROVIDER=dev para usar a caixa de desenvolvimento.');
  }
  await db.insert(devEmails).values({ toEmail: email.to, subject: email.subject, body: email.text });
  console.log(`\n[e-mail de desenvolvimento] Para: ${email.to}\nAssunto: ${email.subject}\n${email.text}\n`);
}
