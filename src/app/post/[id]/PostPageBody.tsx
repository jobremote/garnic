'use client';

import { useRouter } from 'next/navigation';
import { ButtonLink } from 'nogasds';
import type { CommentView } from '@/lib/feed/comment-view';
import type { PostView } from '@/lib/feed/view';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import { CommentThread } from '@/app/feed/_components/CommentThread';
import { PostCard } from '@/app/feed/_components/PostCard';
import { feedMessages as t } from '@/lib/feed/messages';
import styles from '@/app/feed/feed.module.css';

/** O post e os comentários. Excluir o post leva de volta ao feed (a página não existe mais). */
export function PostPageBody({
  post,
  viewerId,
  uploadMode,
  comments,
  next,
}: {
  post: PostView;
  viewerId: string;
  uploadMode: UploadMode;
  comments: CommentView[];
  next: string | null;
}) {
  const router = useRouter();
  return (
    <>
      <ButtonLink href="/" variant="ghost" size="sm" className={styles.backLink}>
        {t.backToFeed}
      </ButtonLink>
      <PostCard post={post} viewerId={viewerId} uploadMode={uploadMode} onDeleted={() => router.push('/')} />
      <CommentThread postId={post.id} initial={comments} next={next} total={post.commentCount} />
    </>
  );
}
