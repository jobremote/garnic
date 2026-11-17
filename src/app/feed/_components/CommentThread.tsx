'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from 'nogasds';
import type { CommentView } from '@/lib/feed/comment-view';
import { feedMessages as t } from '@/lib/feed/messages';
import { createCommentAction, loadCommentsAction } from '../comment-actions';
import styles from '../feed.module.css';
import { CommentForm } from './CommentForm';
import { CommentItem } from './CommentItem';

/**
 * Comentários da página do post: campo para comentar, a lista do mais antigo para o mais novo (20 por vez, "Ver mais")
 * e as respostas de 1 nível. Depois de qualquer mudança a lista é recarregada do servidor (com tudo o que já estava aberto).
 */
export function CommentThread({ postId, initial, next, total }: { postId: string; initial: CommentView[]; next: string | null; total: number }) {
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [cursor, setCursor] = useState(next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reload() {
    const result = await loadCommentsAction(postId, null, comments.length);
    if (result.ok) {
      setComments(result.comments);
      setCursor(result.next);
    }
    // Atualiza os contadores do post (comentários e curtidas) vindos do servidor.
    router.refresh();
  }

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const result = await loadCommentsAction(postId, cursor);
    setLoading(false);
    if (!result.ok) return setFailed(true);
    setComments((current) => [...current, ...result.comments.filter((item) => !current.some((known) => known.id === item.id))]);
    setCursor(result.next);
  }

  return (
    <section className={styles.comments} aria-labelledby="comentarios-titulo">
      <h2 id="comentarios-titulo" className={styles.sectionTitle}>
        {t.commentsCount(total)}
      </h2>
      <CommentForm
        id="comentar"
        label={t.commentFieldLabel}
        placeholder={t.commentPlaceholder}
        submitLabel={t.commentPublish}
        onSubmit={async (body) => {
          const result = await createCommentAction(postId, body);
          if (!result.ok) return result.error;
          await reload();
          return null;
        }}
      />
      {comments.length === 0 ? (
        <p className={styles.muted}>{t.commentsEmpty}</p>
      ) : (
        <div className={styles.commentList}>
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} postId={postId} onChanged={reload} />
          ))}
        </div>
      )}
      {cursor ? (
        <div className={styles.more}>
          <Button variant="outline" onClick={() => void more()} disabled={loading}>
            {loading ? t.loadingMore : t.commentsLoadMore}
          </Button>
          {failed ? (
            <p className={styles.error} role="alert">
              {t.commentsLoadError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
