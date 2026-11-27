import type { Metadata } from 'next';
import { Banner, Link } from 'nogasds';
import { AuthHeader } from '../../_components/auth-parts';
import styles from '../../auth.module.css';

export const metadata: Metadata = { title: 'Idade mínima' };

/**
 * Quem tem menos de 16 anos não cria conta, por enquanto (ECA Digital, art. 24; decisão de 27/11/2026). Nada do
 * cadastro foi gravado. Figma: Login e cadastro, seção 7, "Cadastro – menos de 16 anos".
 */
export default function MinimumAgePage() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Ainda não dá para criar sua conta" description="O Garnic é para pessoas com 16 anos ou mais, por enquanto." />
      <Banner variant="info" title="Queremos você aqui em breve">
        Pela lei, contas de quem tem até 16 anos precisam estar ligadas à conta de um responsável, com ferramentas para ele
        acompanhar. Estamos preparando isso. Nenhum dado seu foi guardado.
      </Banner>
      <p className={styles.footer}>
        <Link href="/entrar">Voltar ao início</Link>
      </p>
    </div>
  );
}
