import type { Metadata } from 'next';
import { Banner } from 'nogasds';
import { AuthHeader } from '../../_components/auth-parts';
import { NavButton } from '../../_components/NavButton';
import styles from '../../auth.module.css';

export const metadata: Metadata = { title: 'Senha atualizada' };

export default function PasswordUpdatedPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Senha atualizada" />
      <Banner variant="success" title="Tudo certo">
        Agora você já pode entrar com a nova senha.
      </Banner>
      <NavButton href="/entrar">Ir para o login</NavButton>
    </div>
  );
}
