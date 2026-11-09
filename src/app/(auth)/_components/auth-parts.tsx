import type { ReactNode } from 'react';
import styles from '../auth.module.css';

/** Cabeçalho das telas: marca, título e descrição. */
export function AuthHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className={styles.header}>
      <p className={styles.brand}>Garnic</p>
      <h1 className={styles.title}>{title}</h1>
      {description ? <p className={styles.description}>{description}</p> : null}
    </header>
  );
}

/** Linha "ou" entre o login com Google e o formulário. */
export function OrDivider() {
  return (
    <div className={styles.divider} role="separator">
      ou
    </div>
  );
}
