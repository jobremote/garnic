import type { Metadata } from 'next';
import { Link } from 'nogasds';
import { AuthHeader } from '../_components/auth-parts';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Termos de uso' };

/** Página provisória: o texto dos termos ainda será redigido (`00_gestao/pontos-em-aberto.md`). */
export default function TermsPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Termos de uso" description="O texto dos termos de uso ainda está em elaboração." />
      <Link href="/cadastrar">Voltar para o cadastro</Link>
    </div>
  );
}
