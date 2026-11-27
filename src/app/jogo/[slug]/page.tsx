import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Badge, DataList, DataRow, Link, MediaHero, Stat } from 'nogasds';
import { AppFooter } from '@/app/_components/AppFooter';
import { AppTopBars } from '@/app/_components/AppTopBars';
import { FeedList } from '@/app/feed/_components/FeedList';
import { requireViewer } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { listPosts } from '@/lib/feed/posts';
import { toPostView } from '@/lib/feed/view';
import { creditsLine, formatMinutes, formatRating, gameMessages as t } from '@/lib/game/messages';
import { communityStats, ensureGameDetails, findGame, listGameScreenshots, viewerEntry } from '@/lib/game/page';
import { backdropUrl, coverUrl, getIgdbClient } from '@/lib/igdb/igdb';
import { mediaUrl } from '@/lib/profile/images';
import { storageMode } from '@/lib/storage';
import { getTranslator } from '@/lib/translate/deepl';
import { GameHeroActions } from '../_components/GameHeroActions';
import { GameScreenshots } from '../_components/GameScreenshots';
import { toScreenshotView } from '../view';
import styles from '../game.module.css';

export const metadata: Metadata = { title: 'Jogo' };

/**
 * Página do jogo (entrega 4): dados do IGDB, nota média e tempos da comunidade, screenshots dos usuários e posts sobre o
 * jogo. Só para quem está logado e só para jogos que já estão no Garnic.
 */
async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const viewer = await requireViewer();
  const { slug } = await params;
  const db = await getDb();
  const found = await findGame(db, decodeURIComponent(slug));
  if (!found) notFound();
  const game = await ensureGameDetails(db, found, getIgdbClient(), getTranslator());

  const [stats, shots, page, entry] = await Promise.all([
    communityStats(db, game.id),
    listGameScreenshots(db, game.id, viewer.id),
    listPosts(db, { kind: 'game', gameId: game.id }, { viewerId: viewer.id }),
    viewerEntry(db, viewer.id, game.id),
  ]);
  const now = new Date();
  const posts = page.posts.map((post) => toPostView(post, viewer.id, now));
  const year = game.releasedAt ? String(new Date(game.releasedAt).getUTCFullYear()) : null;
  const meta = [year, game.platforms.join(', ') || null].filter(Boolean).join(' · ');
  const credits = creditsLine(game.developers, game.publishers);
  const cover = coverUrl(game.coverImageId, 'cover_big', true);
  const summary = game.summaryPt ?? game.summary;
  const igdbPage = game.slug ? `https://www.igdb.com/games/${encodeURIComponent(game.slug)}` : null;
  const hasIgdbTime = Boolean(game.timeHastily || game.timeNormally || game.timeCompletely);
  const hasTimes = hasIgdbTime || stats.timeAverage !== null;

  return (
    <div className={styles.page}>
      <AppTopBars viewer={viewer} />
      <MediaHero
        title={game.name}
        backgroundSrc={backdropUrl(game.backdropImageId)}
        // eslint-disable-next-line @next/next/no-img-element
        cover={cover ? <img src={cover} alt={t.coverAlt(game.name)} /> : undefined}
        meta={meta || undefined}
        badges={game.genres.length > 0 ? game.genres.map((genre) => <Badge key={genre}>{genre}</Badge>) : undefined}
        credits={credits ?? undefined}
        actions={<GameHeroActions igdbId={game.igdbId} gameName={game.name} username={viewer.username} entry={entry} />}
      />
      <main className={styles.layout}>
        <aside className={styles.side}>
          <section className={styles.card} aria-labelledby="comunidade">
            <h2 id="comunidade" className={styles.cardTitle}>
              {t.community}
            </h2>
            <dl className={styles.stats}>
              {stats.ratingAverage !== null ? <Stat value={formatRating(stats.ratingAverage)} label={t.ratingLabel(stats.ratingCount)} /> : null}
              <Stat value={stats.owners} label={t.ownersLabel(stats.owners)} />
            </dl>
          </section>
          {hasTimes ? (
            <section className={styles.card} aria-labelledby="tempos">
              <h2 id="tempos" className={styles.cardTitle}>
                {t.times}
              </h2>
              {hasIgdbTime ? (
                <>
                  <h3 className={styles.overline}>{t.igdbEstimate}</h3>
                  <DataList>
                    <DataRow label={t.hastily} value={game.timeHastily ? formatMinutes(game.timeHastily) : null} />
                    <DataRow label={t.normally} value={game.timeNormally ? formatMinutes(game.timeNormally) : null} />
                    <DataRow label={t.completely} value={game.timeCompletely ? formatMinutes(game.timeCompletely) : null} />
                  </DataList>
                </>
              ) : null}
              {stats.timeAverage !== null ? (
                <>
                  <h3 className={styles.overline}>{t.communityTime}</h3>
                  <DataList>
                    <DataRow label={t.communityTimeLabel(stats.timeCount)} value={formatMinutes(stats.timeAverage)} />
                  </DataList>
                </>
              ) : null}
              <p className={styles.note}>{t.timesNote}</p>
            </section>
          ) : null}
        </aside>

        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="sobre">
            <h2 id="sobre" className={styles.cardTitle}>
              {t.about}
            </h2>
            {summary ? (
              <>
                <p className={styles.summary}>{summary}</p>
                <p className={styles.note}>{game.summaryPt ? t.summaryTranslated : t.summaryOriginal}</p>
              </>
            ) : (
              <p className={styles.empty}>{t.noSummary}</p>
            )}
            {/* Caminho até a fonte dos dados, como pede o acordo da Twitch (seção VII.C). */}
            {igdbPage ? (
              <p className={styles.source}>
                <Link href={igdbPage} target="_blank" rel="noopener noreferrer">
                  {t.viewOnIgdb}
                </Link>
              </p>
            ) : null}
          </section>

          <section className={styles.card} aria-labelledby="screenshots">
            <h2 id="screenshots" className={styles.cardTitle}>
              {shots.total > 0 ? t.screenshotsCount(shots.total) : t.screenshots}
            </h2>
            <GameScreenshots
              gameId={game.id}
              gameName={game.name}
              initial={shots.screenshots.flatMap((shot) => toScreenshotView(shot, mediaUrl))}
              next={shots.next}
            />
          </section>

          <section className={styles.posts} aria-labelledby="posts">
            <h2 id="posts" className={styles.sectionTitle}>
              {t.posts}
            </h2>
            {posts.length > 0 ? (
              <FeedList initial={posts} next={page.next} scope={{ kind: 'game', gameId: game.id }} viewerId={viewer.id} uploadMode={storageMode()} label={t.posts} />
            ) : (
              <p className={styles.empty}>{t.noPosts}</p>
            )}
          </section>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}

export default function GameRoute({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={null}>
      <GamePage params={params} />
    </Suspense>
  );
}
