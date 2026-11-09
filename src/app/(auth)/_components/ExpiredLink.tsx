import { Banner, Link } from 'nogasds';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';
import { NavButton } from './NavButton';

/** "Link expirado": o link de recuperar senha é inválido, já foi usado, foi substituído ou venceu. */
export function ExpiredLink() {
  return (
    <div className={styles.form}>
      <AuthHeader title="Link expirado" />
      <Banner variant="error" title="Esse link não é mais válido">
        Peça um novo link para criar sua nova senha.
      </Banner>
      <NavButton href="/recuperar-senha">Enviar novo link</NavButton>
      <div className={styles.alignCenter}>
        <Link href="/entrar">Voltar para o login</Link>
      </div>
    </div>
  );
}
