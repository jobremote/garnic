import { Avatar, Banner, Button, Cover, Stat } from 'nogasds';
import { AppFooter } from '@/app/_components/AppFooter';
import { AppTopBars } from '@/app/_components/AppTopBars';
import { FeedList } from '@/app/feed/_components/FeedList';
import { FollowButton } from '@/app/feed/_components/FollowButton';
import type { CurrentUser } from '@/lib/auth/current-user';
import type { FollowCounters } from '@/lib/feed/follows';
import type { PostView } from '@/lib/feed/view';
import { coverUrl } from '@/lib/igdb/igdb';
import { mediaUrl } from '@/lib/profile/images';
import { formatDate, profileMessages as t } from '@/lib/profile/messages';
import type { EditLocks, PublicProfile } from '@/lib/profile/profile';
import type { ShelfColumns, ShelfCounters } from '@/lib/shelf/shelf';
import { SHELF_STATUSES } from '@/lib/shelf/status';
import type { TagData } from '../shelf-actions';
import { storageMode } from '@/lib/storage';
import styles from '../profile.module.css';
import { EditProfile } from './EditProfile';
import { GameShelf, type ShelfData } from './GameShelf';

/** Só o que o card precisa vai para o navegador: id da entrada, nome, ano e capa. */
function toShelfData(shelf: ShelfColumns): ShelfData {
  const data = {} as ShelfData;
  for (const status of SHELF_STATUSES) {
    data[status] = shelf[status].map((card) => ({
      entryId: card.entryId,
      name: card.game.name,
      detail: card.game.releasedAt ? String(card.game.releasedAt.getUTCFullYear()) : '',
      coverUrl: coverUrl(card.game.coverImageId, 'cover_small'),
      tags: card.tags,
    }));
  }
  return data;
}

/**
 * Perfil público (Figma: "Perfil do usuário"). Game Shelf, posts e Seguir funcionam; Denunciar ainda não (próxima
 * entrega do Feed).
 */
export function ProfileView({
  viewer,
  profile,
  locks,
  shelf,
  counters,
  tags,
  following,
  followCounters,
  posts,
  postsNext,
}: {
  viewer: CurrentUser;
  profile: PublicProfile;
  locks: EditLocks | null;
  shelf: ShelfColumns;
  counters: ShelfCounters;
  /** Tags da pessoa do perfil (para o filtro; só quem é dona também as edita). */
  tags: TagData[];
  /** Quem está vendo já segue esta pessoa. */
  following: boolean;
  followCounters: FollowCounters;
  /** Primeira página dos posts da pessoa, do mais recente para o mais antigo. */
  posts: PostView[];
  postsNext: string | null;
}) {
  const own = viewer.id === profile.id;

  return (
    <div className={styles.page}>
      <AppTopBars viewer={viewer} />
      <main className={styles.content}>
        <header className={styles.head}>
          <Cover src={mediaUrl(profile.coverKey)} positionY={profile.coverPosition} />
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
                    coverPosition={profile.coverPosition}
                    nameLocked={locks?.nameUnlocksAt ? t.nameLocked(locks.nameUnlocksAt) : undefined}
                    usernameLocked={locks?.usernameUnlocksAt ? t.usernameLocked(locks.usernameUnlocksAt) : undefined}
                  />
                ) : (
                  <>
                    <Button variant="ghost" disabled>
                      {t.report}
                    </Button>
                    <FollowButton userId={profile.id} name={profile.name} initialFollowing={following} size="md" />
                  </>
                )}
              </div>
            </div>
            {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
            {/* Hierarquia: os contadores de jogo (o assunto do produto) em destaque; os sociais, de apoio. */}
            <div className={styles.stats}>
              <dl className={styles.statGroup} aria-label="Jogos">
                <Stat value={counters.wantToPlay} label={t.wantToPlay} />
                <Stat value={counters.zeroed} label={t.zeroed} />
              </dl>
              <dl className={styles.statGroup} aria-label="Comunidade">
                <Stat emphasis="secondary" value={followCounters.followers} label={t.followers} />
                <Stat emphasis="secondary" value={followCounters.following} label={t.following} />
              </dl>
            </div>
          </section>
        </header>

        <section className={styles.section} aria-labelledby="game-shelf">
          <GameShelf columns={toShelfData(shelf)} own={own} title={t.gameShelf} tags={tags} uploadMode={storageMode()} userId={profile.id} />
        </section>

        <section className={styles.section} aria-labelledby="posts">
          <h2 id="posts" className={styles.sectionTitle}>
            {t.posts}
          </h2>
          {posts.length > 0 ? (
            <FeedList key={posts.map((post) => `${post.id}:${post.edited ? 1 : 0}`).join(',')} initial={posts} next={postsNext} scope={{ kind: 'user', userId: profile.id }} viewerId={viewer.id} uploadMode={storageMode()} label={t.posts} />
          ) : (
            <Banner title={t.noPostsTitle}>{own ? t.noPostsTextOwn : t.noPostsTextOther}</Banner>
          )}
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

export { formatDate };
