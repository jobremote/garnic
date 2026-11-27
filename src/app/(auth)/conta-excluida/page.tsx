import type { Metadata } from 'next';
import { Banner, Link } from 'nogasds';
import { AuthHeader } from '../_components/auth-parts';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Conta excluída' };

/** Depois de excluir a conta: a sessão já foi encerrada e os dados apagados. */
export default function DeletedAccountPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Sua conta foi excluída" description="Obrigado por ter passado pelo Garnic." />
      <Banner variant="success" title="Tudo apagado">
        Seu perfil, seu Game Shelf, seus posts, comentários, curtidas e imagens foram apagados.
      </Banner>
      <p className={styles.footer}>
        <Link href="/cadastrar">Criar uma conta nova</Link>
      </p>
    </div>
  );
}
