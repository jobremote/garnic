import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppFooter } from '@/app/_components/AppFooter';
import { AppTopBars } from '@/app/_components/AppTopBars';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { toCommentView } from '@/lib/feed/comment-view';
import { listComments } from '@/lib/feed/comments';
import { feedMessages as t } from '@/lib/feed/messages';
import { listPosts } from '@/lib/feed/posts';
import { toPostView } from '@/lib/feed/view';
import { storageMode } from '@/lib/storage';
import styles from '../../feed/feed.module.css';
import { PostPageBody } from './PostPageBody';

export const metadata: Metadata = { title: 'Post' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Página do post: o post inteiro e os comentários dele (curtir, comentar, responder, ocultar). Só para quem está logado. */
async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect('/entrar');
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const db = await getDb();
  const page = await listPosts(db, { kind: 'post', postId: id }, { viewerId: viewer.id, limit: 1 });
  const post = page.posts[0];
  if (!post) notFound();
  const comments = await listComments(db, id, viewer.id);
  const now = new Date();

  return (
    <div className={styles.page}>
      <AppTopBars viewer={viewer} />
      <main className={styles.postLayout} aria-label={t.commentsTitle}>
        <PostPageBody
          post={toPostView(post, viewer.id, now)}
          viewerId={viewer.id}
          uploadMode={storageMode()}
          comments={comments.comments.map((node) => toCommentView(node, viewer.id, post.author.id, now))}
          next={comments.next}
        />
      </main>
      <AppFooter />
    </div>
  );
}

export default function PostRoute({ params }: PageProps<'/post/[id]'>) {
  return (
    <Suspense fallback={null}>
      <PostPage params={params} />
    </Suspense>
  );
}
