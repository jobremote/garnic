'use client';

import { useState } from 'react';
import { Button } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import type { FeedScope } from '@/lib/feed/posts';
import type { PostView } from '@/lib/feed/view';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import { loadMorePostsAction } from '../actions';
import styles from '../feed.module.css';
import { PostCard } from './PostCard';

/** Lista de posts do mais recente para o mais antigo, com "Ver mais" para as páginas seguintes (sem algoritmo). */
export function FeedList({
  initial,
  next,
  scope,
  viewerId,
  uploadMode,
  label,
}: {
  initial: PostView[];
  next: string | null;
  scope: FeedScope;
  viewerId: string;
  uploadMode: UploadMode;
  /** Nome acessível da lista. */
  label: string;
}) {
  const [posts, setPosts] = useState(initial);
  const [cursor, setCursor] = useState(next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const result = await loadMorePostsAction(scope, cursor);
    setLoading(false);
    if (!result.ok) return setFailed(true);
    // Um post que já está na lista (por exemplo, publicado enquanto a pessoa rolava) não se repete.
    setPosts((current) => [...current, ...result.posts.filter((post) => !current.some((item) => item.id === post.id))]);
    setCursor(result.next);
  }

  return (
    <>
      <ul className={styles.list} aria-label={label}>
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} viewerId={viewerId} uploadMode={uploadMode} />
          </li>
        ))}
      </ul>
      {cursor ? (
        <div className={styles.more}>
          <Button variant="outline" onClick={() => void more()} disabled={loading}>
            {loading ? t.loadingMore : t.loadMore}
          </Button>
          {failed ? (
            <p className={styles.error} role="alert">
              {t.loadMoreError}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
