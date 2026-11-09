import styles from './auth.module.css';

/** Frase do painel da marca: provisória, genérica por enquanto (decisão de 09/11/2026). */
const brandLine = 'Catalogue o que você joga. Escreva sobre isso. No mesmo lugar.';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={styles.shell}>
      <main className={styles.formPanel}>
        <div className={styles.content}>{children}</div>
      </main>
      <aside className={styles.brandPanel} aria-hidden="true">
        <p className={styles.brandText}>{brandLine}</p>
      </aside>
    </div>
  );
}
