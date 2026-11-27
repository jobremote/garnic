'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActivityGame, ActivityPost, Badge, Button, GroupedTags, MediaTag, Menu, MenuOption, Modal, Icon, Post, PostAction, SpoilerGuard } from 'nogasds';
import { groupByStatus } from '@/lib/feed/groups';
import { feedMessages as t } from '@/lib/feed/messages';
import type { PostView } from '@/lib/feed/view';
import { STATUS_LABEL } from '@/lib/shelf/status';
import { STATUS_TONE } from '@/app/perfil/_components/AddGameModal';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import { deletePostAction } from '../actions';
import styles from '../feed.module.css';
import { EditPostModal } from './EditPostModal';
import { ReportDialog } from './ReportDialog';
import { useLike } from './use-like';

/** Capa miniatura do card do jogo (decorativa: o nome do jogo está ao lado). */
function ActivityCover({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" />;
}

/** Post do feed (Figma: Post). Com spoiler, o texto e a imagem ficam atrás de um só aviso. O menu é só de quem postou. */
export function PostCard({ post, viewerId, uploadMode, onDeleted }: { post: PostView; viewerId: string; uploadMode: UploadMode; /** Depois de excluir (a página do post volta ao feed). */ onDeleted?: () => void }) {
  const router = useRouter();
  const like = useLike('post', post.id, { liked: post.liked, count: post.likeCount });
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deletePostAction(post.id);
    setPending(false);
    if (result.ok) {
      setDeleting(false);
      onDeleted?.();
      return;
    }
    setError(result.error === 'not-found' ? t.notFound : t.generic);
  }

  const profile = `/perfil/${post.username}`;
  // Marcas de jogo: depois do conteúdo, como rodapé do post, e fora do aviso de spoiler (decisão de 13/11/2026). Em
  // linhas por status (Zerado, Jogando, Quero jogar, Parado e, por último, os que não estão no Game Shelf de quem
  // postou, sem selo), com um divisor em cima de cada uma (decisão de 16/11/2026).
  const groups = groupByStatus(post.games).map((group) => ({
    id: group.status ?? 'sem-status',
    name: group.status ? STATUS_LABEL[group.status] : undefined,
    label: group.status ? <Badge tone={STATUS_TONE[group.status]}>{STATUS_LABEL[group.status]}</Badge> : undefined,
    children: group.items.map((game) => (
      <MediaTag key={game.igdbId} thumbnail={game.coverUrl} href={game.href}>
        {game.name}
      </MediaTag>
    )),
  }));
  const tags = groups.length > 0 ? <GroupedTags groups={groups} /> : undefined;

  const authorLink = (
    <Link href={profile} className={styles.authorLink}>
      {post.authorName}
    </Link>
  );
  const meta = (
    <>
      <Link href={profile} className={styles.metaLink}>
        @{post.username}
      </Link>
      {' · '}
      <Link href={`/post/${post.id}`} className={styles.metaLink}>
        {post.time}
      </Link>
      {post.edited ? ` · ${t.edited}` : ''}
    </>
  );
  const actions = (
    <>
      <PostAction icon="favorite" pressedIcon="favorite-fill" label={t.like} count={like.count} pressed={like.liked} onClick={() => void like.toggle()} />
      <PostAction icon="chat" label={t.comment} count={post.commentCount} onClick={() => router.push(`/post/${post.id}#comentar`)} />
    </>
  );
  // O post de atividade não tem imagem nem jogos marcados para editar: quem compartilhou só exclui.
  const menu = (
    <Menu label={t.more} trigger={<Icon name="more-horiz" />}>
      {post.own ? (
        <>
          {post.activity ? null : (
            <MenuOption icon="edit" onClick={() => setEditing(true)}>
              {t.edit}
            </MenuOption>
          )}
          <MenuOption danger onClick={() => setDeleting(true)}>
            {t.remove}
          </MenuOption>
        </>
      ) : (
        <MenuOption onClick={() => setReporting(true)}>{t.report}</MenuOption>
      )}
    </Menu>
  );

  const activity = post.activity;
  return (
    <>
      {activity ? (
        <ActivityPost
          author={post.authorName}
          authorLink={authorLink}
          avatar={{ src: post.avatarUrl }}
          meta={meta}
          menu={menu}
          actions={actions}
          phrase={activity.phrase}
          // Com spoiler (review ou screenshot), o texto, o trecho e a imagem ficam atrás do aviso; a frase e o jogo continuam visíveis.
          note={
            post.body ? (
              <SpoilerGuard active={post.spoiler}>
                <p className={styles.postBody}>{post.body}</p>
              </SpoilerGuard>
            ) : undefined
          }
          excerpt={activity.excerpt ? <SpoilerGuard active={post.spoiler}>{activity.excerpt}</SpoilerGuard> : undefined}
          media={
            activity.imageUrl ? (
              <SpoilerGuard active={post.spoiler}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activity.imageUrl} alt={t.activityScreenshotAlt} />
              </SpoilerGuard>
            ) : undefined
          }
          game={
            <ActivityGame
              title={activity.gameName}
              href={activity.gameHref}
              meta={activity.meta || undefined}
              detail={activity.detail}
              cover={activity.coverUrl ? <ActivityCover src={activity.coverUrl} /> : undefined}
              badge={<Badge tone={STATUS_TONE[activity.status]}>{STATUS_LABEL[activity.status]}</Badge>}
            />
          }
        />
      ) : (
        <Post author={post.authorName} authorLink={authorLink} avatar={{ src: post.avatarUrl }} meta={meta} actions={actions} menu={menu} tagsAfter={tags}>
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
      )}
      {reporting ? <ReportDialog kind="post" id={post.id} onClose={() => setReporting(false)} /> : null}
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
