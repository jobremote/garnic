import Link from 'next/link';
import { Avatar, Banner, BoardColumn, Button, Cover, IconButton, MobileTopBar, Stat, TopBar } from 'nogasds';
import { logoutAction } from '@/app/(auth)/actions';
import type { CurrentUser } from '@/lib/auth/current-user';
import { mediaUrl } from '@/lib/profile/images';
import { formatDate, profileMessages as t } from '@/lib/profile/messages';
import type { EditLocks, PublicProfile } from '@/lib/profile/profile';
import { storageMode } from '@/lib/storage';
import styles from '../profile.module.css';
import { EditProfile } from './EditProfile';

function TopBars({ viewer }: { viewer: CurrentUser }) {
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

/**
 * Perfil público (Figma: "Perfil do usuário"). Game Shelf, posts, Seguir e Denunciar aparecem como no protótipo,
 * mas ainda sem função: pertencem aos blocos Gameshelf e Feed.
 */
export function ProfileView({
  viewer,
  profile,
  locks,
}: {
  viewer: CurrentUser;
  profile: PublicProfile;
  locks: EditLocks | null;
}) {
  const own = viewer.id === profile.id;

  return (
    <div className={styles.page}>
      <TopBars viewer={viewer} />
      <main className={styles.content}>
        <header className={styles.head}>
          <Cover src={mediaUrl(profile.coverKey)} />
          <section className={styles.identity} aria-label="Perfil">
            <div className={styles.identityRow}>
              <Avatar name={profile.name} src={mediaUrl(profile.avatarKey)} size="lg" />
              <div className={styles.names}>
                <h1 className={styles.name}>{profile.name}</h1>
                <p className={styles.handle}>@{profile.username}</p>
              </div>
              <div className={styles.actions}>
                {own ? (
                  <EditProfile
                    name={profile.name}
                    username={profile.username}
                    bio={profile.bio ?? ''}
                    userId={profile.id}
                    uploadMode={storageMode()}
                    avatarUrl={mediaUrl(profile.avatarKey)}
                    coverUrl={mediaUrl(profile.coverKey)}
                    nameLocked={locks?.nameUnlocksAt ? t.nameLocked(locks.nameUnlocksAt) : undefined}
                    usernameLocked={locks?.usernameUnlocksAt ? t.usernameLocked(locks.usernameUnlocksAt) : undefined}
                  />
                ) : (
                  <>
                    <Button variant="ghost" disabled>
                      {t.report}
                    </Button>
                    <Button disabled>{t.follow}</Button>
                  </>
                )}
              </div>
            </div>
            {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
            {/* Hierarquia: os contadores de jogo (o assunto do produto) em destaque; os sociais, de apoio. */}
            <div className={styles.stats}>
              <dl className={styles.statGroup} aria-label="Jogos">
                <Stat value={0} label={t.zeroedThisYear} />
                <Stat value={0} label={t.backlog} />
              </dl>
              {/* Seguidores e Seguindo dependem do bloco Feed (seguir): 0 até lá. */}
              <dl className={styles.statGroup} aria-label="Comunidade">
                <Stat emphasis="secondary" value={0} label={t.followers} />
                <Stat emphasis="secondary" value={0} label={t.following} />
              </dl>
            </div>
          </section>
        </header>

        <section className={styles.section} aria-labelledby="game-shelf">
          <div className={styles.sectionHeader}>
            <h2 id="game-shelf" className={styles.sectionTitle}>
              {t.gameShelf}
            </h2>
            {own ? <IconButton icon="add" label={t.gameShelfAdd} variant="outline" size="sm" disabled /> : null}
          </div>
          {/* Rolagem para o lado no celular: a região precisa receber foco para quem usa só o teclado. */}
          <div className={styles.kanban} role="region" aria-label={t.gameShelf} tabIndex={0}>
            {t.statuses.map((status) => (
              <BoardColumn key={status} className={styles.column} title={status} count={0} emptyMessage={t.shelfEmpty} />
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="posts">
          <h2 id="posts" className={styles.sectionTitle}>
            {t.posts}
          </h2>
          <Banner title={t.noPostsTitle}>{own ? t.noPostsTextOwn : t.noPostsTextOther}</Banner>
        </section>
      </main>
    </div>
  );
}

export { formatDate };
