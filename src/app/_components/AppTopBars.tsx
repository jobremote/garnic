import Link from 'next/link';
import { Avatar, Button, MobileTopBar, TopBar } from 'nogasds';
import { logoutAction } from '@/app/(auth)/actions';
import type { CurrentUser } from '@/lib/auth/current-user';
import { mediaUrl } from '@/lib/profile/images';
import styles from './app-top-bars.module.css';

/** Barra superior das telas de quem está logado (desktop e mobile): marca à esquerda; perfil e sair à direita. */
export function AppTopBars({ viewer }: { viewer: CurrentUser }) {
  const brand = (
    <Link href="/" className={styles.brand}>
      Garnic
    </Link>
  );
  const actions = (
    <>
      <Link href={`/perfil/${viewer.username}`} aria-label="Meu perfil">
        <Avatar name={viewer.name} src={mediaUrl(viewer.avatarKey)} size="md" />
      </Link>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm">
          Sair
        </Button>
      </form>
    </>
  );
  return (
    <>
      <TopBar className={styles.desktopOnly} brand={brand} actions={actions} />
      <MobileTopBar className={styles.mobileOnly} brand={brand} actions={actions} />
    </>
  );
}
