import type { Metadata } from 'next';
import { Link } from 'nogasds';
import { AuthHeader } from '../_components/auth-parts';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Política de Privacidade' };

/** Página provisória: o texto da política ainda será redigido (`00_gestao/pontos-em-aberto.md`). */
export default function PrivacyPage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Política de Privacidade" description="O texto da política de privacidade ainda está em elaboração." />
      <Link href="/cadastrar">Voltar para o cadastro</Link>
    </div>
  );
}
