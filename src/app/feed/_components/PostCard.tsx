'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, MediaTag, Menu, MenuOption, Modal, Icon, Post, SpoilerGuard } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import type { PostView } from '@/lib/feed/view';
import { STATUS_LABEL } from '@/lib/shelf/status';
import { STATUS_TONE } from '@/app/perfil/_components/AddGameModal';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import { deletePostAction } from '../actions';
import styles from '../feed.module.css';
import { EditPostModal } from './EditPostModal';

/** Post do feed (Figma: Post). Com spoiler, o texto e a imagem ficam atrás de um só aviso. O menu é só de quem postou. */
export function PostCard({ post, viewerId, uploadMode }: { post: PostView; viewerId: string; uploadMode: UploadMode }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deletePostAction(post.id);
    setPending(false);
    if (result.ok) return setDeleting(false);
    setError(result.error === 'not-found' ? t.notFound : t.generic);
  }

  const profile = `/perfil/${post.username}`;
  // Marcas de jogo: depois do conteúdo, como rodapé do post, e fora do aviso de spoiler (decisão de 13/11/2026).
  const tags =
    post.status || post.game ? (
      <>
        {post.status ? <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge> : null}
        {post.game ? <MediaTag thumbnail={post.game.coverUrl}>{post.game.name}</MediaTag> : null}
      </>
    ) : undefined;

  return (
    <>
      <Post
        author={post.authorName}
        authorLink={
          <Link href={profile} className={styles.authorLink}>
            {post.authorName}
          </Link>
        }
        avatar={{ src: post.avatarUrl }}
        meta={
          <>
            <Link href={profile} className={styles.metaLink}>
              @{post.username}
            </Link>
            {` · ${post.time}${post.edited ? ` · ${t.edited}` : ''}`}
          </>
        }
        menu={
          post.own ? (
            <Menu label={t.more} trigger={<Icon name="more-horiz" />}>
              <MenuOption icon="edit" onClick={() => setEditing(true)}>
                {t.edit}
              </MenuOption>
              <MenuOption danger onClick={() => setDeleting(true)}>
                {t.remove}
              </MenuOption>
            </Menu>
          ) : undefined
        }
        tagsAfter={tags}
      >
        <SpoilerGuard active={post.spoiler}>
          {post.body ? <p className={styles.postBody}>{post.body}</p> : null}
          {post.imageUrl ? (
            <div className={styles.postMedia}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.postImage} src={post.imageUrl} alt={t.imageAlt} />
            </div>
          ) : null}
        </SpoilerGuard>
      </Post>
      {editing ? <EditPostModal post={post} userId={viewerId} uploadMode={uploadMode} onClose={() => setEditing(false)} /> : null}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t.deleteTitle}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(false)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={pending}>
              {t.remove}
            </Button>
          </>
        }
      >
        <p className={styles.hint}>{t.deleteText}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
