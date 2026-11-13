import { Banner, ButtonLink, ProfileSummary, Stat, SuggestedAccount } from 'nogasds';
import { AppFooter } from '@/app/_components/AppFooter';
import { AppTopBars } from '@/app/_components/AppTopBars';
import type { CurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { suggestedUsers } from '@/lib/feed/follows';
import { feedMessages as t } from '@/lib/feed/messages';
import { countMyGames, filterFor, listPosts, type FeedScope } from '@/lib/feed/posts';
import { toPostView, type PostView } from '@/lib/feed/view';
import { mediaUrl } from '@/lib/profile/images';
import { profileMessages as p } from '@/lib/profile/messages';
import { getPublicProfile } from '@/lib/profile/profile';
import { shelfCounters } from '@/lib/shelf/shelf';
import { storageMode } from '@/lib/storage';
import styles from '../feed.module.css';
import { Composer } from './Composer';
import { FeedList } from './FeedList';
import { FeedTabs, type FeedTab } from './FeedTabs';
import { FollowButton } from './FollowButton';

/** Muda quando a lista muda (novo post, edição, exclusão): a lista no navegador recomeça com os dados novos do servidor. */
const listKey = (posts: PostView[]) => posts.map((post) => `${post.id}:${post.edited ? 1 : 0}`).join(',');

/**
 * Feed (Figma: "Feed"). Abas Seguindo e Meus jogos em ordem cronológica, sem algoritmo; resumo do perfil à esquerda e
 * "Quem seguir" à direita. Sem nada para mostrar: banner de boas-vindas com os posts recentes da comunidade (cold
 * start) ou o convite para adicionar o primeiro jogo.
 */
export async function FeedView({ viewer, tab }: { viewer: CurrentUser; tab: FeedTab }) {
  const db = await getDb();
  const now = new Date();
  const uploadMode = storageMode();
  const scope: FeedScope = tab === 'meus-jogos' ? { kind: 'my-games' } : { kind: 'following' };

  const [page, profile, counters, suggestions] = await Promise.all([
    listPosts(db, filterFor(scope, viewer.id)),
    getPublicProfile(db, viewer.username),
    shelfCounters(db, viewer.id),
    suggestedUsers(db, viewer.id),
  ]);
  const posts = page.posts.map((post) => toPostView(post, viewer.id, now));

  let content: React.ReactNode;
  if (posts.length > 0) {
    content = <FeedList key={listKey(posts)} initial={posts} next={page.next} scope={scope} viewerId={viewer.id} uploadMode={uploadMode} label={tab === 'meus-jogos' ? t.tabMyGames : t.tabFollowing} />;
  } else if (tab === 'meus-jogos') {
    const hasGames = (await countMyGames(db, viewer.id)) > 0;
    content = hasGames ? (
      <Banner title={t.noMyGamesPostsTitle}>{t.noMyGamesPostsText}</Banner>
    ) : (
      <div className={styles.empty}>
        <h2 className={styles.sideTitle}>{t.noGamesTitle}</h2>
        <p className={styles.muted}>{t.noGamesText}</p>
        <ButtonLink href={`/perfil/${viewer.username}`}>{t.addFirstGame}</ButtonLink>
      </div>
    );
  } else {
    // Cold start: quem ainda não segue ninguém (ou segue gente que não postou) vê o que a comunidade anda postando.
    const global = await listPosts(db, { kind: 'all' });
    const globalPosts = global.posts.map((post) => toPostView(post, viewer.id, now));
    content = (
      <>
        <Banner title={t.welcomeTitle}>{t.welcomeText}</Banner>
        {globalPosts.length > 0 ? (
          <>
            <h2 className={styles.sectionTitle}>{t.communityTitle}</h2>
            <FeedList key={listKey(globalPosts)} initial={globalPosts} next={global.next} scope={{ kind: 'all' }} viewerId={viewer.id} uploadMode={uploadMode} label={t.communityTitle} />
          </>
        ) : null}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <AppTopBars viewer={viewer} />
      <main className={styles.layout}>
        <aside className={`${styles.side} ${styles.left}`} aria-label="Seu perfil">
          <ProfileSummary
            name={viewer.name}
            handle={`@${viewer.username}`}
            avatar={{ src: mediaUrl(viewer.avatarKey) }}
            bio={profile?.bio ?? undefined}
            href={`/perfil/${viewer.username}`}
            linkLabel={t.viewMyProfile}
            stats={
              <>
                <Stat value={counters.wantToPlay} label={p.wantToPlay} />
                <Stat value={counters.zeroed} label={p.zeroed} />
              </>
            }
          />
          <ButtonLink href={`/perfil/${viewer.username}`} variant="outline" className={styles.fullWidth}>
            {t.viewMyProfile}
          </ButtonLink>
        </aside>

        <section className={styles.center} aria-label="Feed">
          <Composer userId={viewer.id} name={viewer.name} avatarUrl={mediaUrl(viewer.avatarKey)} uploadMode={uploadMode} />
          <FeedTabs value={tab} />
          <div id="feed-panel" role="tabpanel" className={styles.center}>
            {content}
          </div>
        </section>

        <aside className={`${styles.side} ${styles.right}`} aria-label={t.whoToFollow}>
          <div className={styles.sideCard}>
            <h2 className={styles.sideTitle}>{t.whoToFollow}</h2>
            {suggestions.length === 0 ? (
              <p className={styles.muted}>{t.noSuggestions}</p>
            ) : (
              suggestions.map((user) => (
                <SuggestedAccount
                  key={user.id}
                  name={user.name}
                  handle={`@${user.username}`}
                  avatar={{ src: mediaUrl(user.avatarKey) }}
                  href={`/perfil/${user.username}`}
                  linkLabel={t.viewProfileOf(user.name)}
                  action={<FollowButton userId={user.id} name={user.name} initialFollowing={false} />}
                />
              ))
            )}
          </div>
        </aside>
      </main>
      <AppFooter />
    </div>
  );
}
