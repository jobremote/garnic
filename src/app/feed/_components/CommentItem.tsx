'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Comment, Icon, Menu, MenuOption, Modal } from 'nogasds';
import type { CommentView } from '@/lib/feed/comment-view';
import { feedMessages as t } from '@/lib/feed/messages';
import { createCommentAction, deleteCommentAction, editCommentAction, hideCommentAction } from '../comment-actions';
import styles from '../feed.module.css';
import { CommentForm } from './CommentForm';
import { ReportDialog } from './ReportDialog';
import { useLike } from './use-like';

/**
 * Um comentário (ou resposta) com curtir, responder (só no 1º nível), editar e excluir (do autor) e ocultar (do dono
 * do post). `onChanged` recarrega a lista depois de qualquer mudança.
 */
export function CommentItem({ comment, postId, reply = false, onChanged }: { comment: CommentView; postId: string; reply?: boolean; onChanged: () => Promise<void> }) {
  const like = useLike('comment', comment.id, { liked: comment.liked, count: comment.likeCount });
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = `/perfil/${comment.username}`;
  const readable = comment.status === 'default' || comment.status === 'hidden-owner';

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteCommentAction(comment.id);
    setPending(false);
    if (result.ok) {
      setDeleting(false);
      await onChanged();
      return;
    }
    setError(result.error === 'not-found' ? t.commentNotFound : t.generic);
  }

  async function setHidden(hidden: boolean) {
    setPending(true);
    setError(null);
    const result = await hideCommentAction(comment.id, hidden);
    setPending(false);
    if (result.ok) return onChanged();
    setError(result.error === 'not-found' ? t.commentNotFound : t.generic);
  }

  if (editing && readable) {
    return (
      <div className={reply ? styles.replyForm : undefined}>
        <CommentForm
          label={t.commentEditLabel}
          placeholder={t.commentPlaceholder}
          submitLabel={t.commentSave}
          initial={comment.body ?? ''}
          autoFocus
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            const result = await editCommentAction(comment.id, body);
            if (!result.ok) return result.error;
            setEditing(false);
            await onChanged();
            return null;
          }}
        />
      </div>
    );
  }

  const canEdit = comment.own && readable;
  const canDelete = comment.own && comment.status !== 'deleted';
  const canHide = comment.canModerate && comment.status === 'default';
  const canReport = !comment.own && readable;
  const menu =
    canEdit || canDelete || canHide || canReport ? (
      <Menu label={t.commentMore} trigger={<Icon name="more-horiz" />}>
        {canEdit ? (
          <MenuOption icon="edit" onClick={() => setEditing(true)}>
            {t.commentEdit}
          </MenuOption>
        ) : null}
        {canHide ? (
          <MenuOption icon="visibility-off" onClick={() => void setHidden(true)}>
            {t.commentHide}
          </MenuOption>
        ) : null}
        {canReport ? <MenuOption onClick={() => setReporting(true)}>{t.report}</MenuOption> : null}
        {canDelete ? (
          <MenuOption danger onClick={() => setDeleting(true)}>
            {t.commentDelete}
          </MenuOption>
        ) : null}
      </Menu>
    ) : undefined;

  let textAction: React.ReactNode;
  if (comment.status === 'hidden-owner' && comment.canModerate) {
    textAction = (
      <Button variant="ghost" size="sm" onClick={() => void setHidden(false)} disabled={pending}>
        {t.commentShowAgain}
      </Button>
    );
  } else if (comment.status === 'default' && !reply) {
    textAction = (
      <Button variant="ghost" size="sm" onClick={() => setReplying((open) => !open)}>
        {t.reply}
      </Button>
    );
  }

  const notice =
    comment.status === 'hidden' ? t.commentHiddenNotice : comment.status === 'hidden-owner' ? t.commentHiddenOwnerNotice : comment.status === 'deleted' ? t.commentDeletedNotice : undefined;

  return (
    <div>
      <Comment
        author={comment.authorName}
        authorLink={
          <Link href={profile} className={styles.authorLink}>
            {comment.authorName}
          </Link>
        }
        meta={`@${comment.username} · ${comment.time}${comment.edited ? ` · ${t.commentEdited}` : ''}`}
        avatar={{ src: comment.avatarUrl }}
        reply={reply}
        status={comment.status}
        notice={notice}
        likeCount={like.count}
        liked={like.liked}
        likeLabel={t.like}
        onLike={() => void like.toggle()}
        textAction={textAction}
        menu={menu}
      >
        {readable ? <p className={styles.commentBody}>{comment.body}</p> : null}
      </Comment>
      {error || like.failed ? (
        <p className={reply ? `${styles.error} ${styles.replyForm}` : styles.error} role="alert">
          {error ?? t.likeError}
        </p>
      ) : null}
      {replying ? (
        <div className={styles.replyForm}>
          <CommentForm
            label={t.replyFieldLabel}
            placeholder={t.replyPlaceholder}
            submitLabel={t.replyPublish}
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const result = await createCommentAction(postId, body, comment.id);
              if (!result.ok) return result.error;
              setReplying(false);
              await onChanged();
              return null;
            }}
          />
        </div>
      ) : null}
      {comment.replies.map((item) => (
        <CommentItem key={item.id} comment={item} postId={postId} reply onChanged={onChanged} />
      ))}
      {reporting ? <ReportDialog kind="comment" id={comment.id} onClose={() => setReporting(false)} /> : null}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t.commentDeleteTitle}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(false)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={pending}>
              {t.commentDelete}
            </Button>
          </>
        }
      >
        <p className={styles.hint}>{t.commentDeleteText}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
