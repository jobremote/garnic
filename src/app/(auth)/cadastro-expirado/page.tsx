import type { Metadata } from 'next';
import { Banner } from 'nogasds';
import { AuthHeader } from '../_components/auth-parts';
import { NavButton } from '../_components/NavButton';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Cadastro expirado' };

export default function ExpiredSignupPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Cadastro expirado" description="Contas não validadas em 24 horas são excluídas." />
      <Banner variant="error" title="Conta excluída">
        Não recebemos a validação do seu e-mail a tempo. Crie sua conta de novo para continuar.
      </Banner>
      <div className={styles.actions}>
        <NavButton href="/cadastrar">Criar conta novamente</NavButton>
        <NavButton href="/entrar" variant="outline">
          Voltar para o login
        </NavButton>
      </div>
    </div>
  );
}
