import type { Metadata } from 'next';
import { Banner } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { AuthHeader } from '../../_components/auth-parts';
import { NavButton } from '../../_components/NavButton';
import styles from '../../auth.module.css';

export const metadata: Metadata = { title: 'Não foi possível entrar com o Google' };

/** O Google não confirmou a pessoa (e-mail não verificado, etapa vencida, erro na volta): mensagem única e volta ao login. */
export default function GoogleProblemPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Entrar com o Google" />
      <Banner variant="error" title={messages.google.failedTitle}>
        {messages.google.failedText}
      </Banner>
      <NavButton href="/entrar">Voltar para o login</NavButton>
    </div>
  );
}
