import type { Metadata } from 'next';
import { Icon } from 'nogasds';
import { AuthHeader } from '../../_components/auth-parts';
import { NavButton } from '../../_components/NavButton';
import styles from '../../auth.module.css';

export const metadata: Metadata = { title: 'E-mail validado' };

export default function VerifiedPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="E-mail validado" />
      <p className={styles.successMark}>
        <Icon name="check-circle" size={32} />
        Tudo certo
      </p>
      <p className={styles.description}>Sua conta está pronta. Vamos começar a montar sua estante.</p>
      <NavButton href="/">Continuar</NavButton>
    </div>
  );
}
