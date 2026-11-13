'use client';

import { useState } from 'react';
import { Button, Modal, TextArea } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { POST_MAX } from '@/lib/feed/posts';
import type { PostView } from '@/lib/feed/view';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import { updatePostAction } from '../actions';
import styles from '../feed.module.css';
import { ImagePreview, PostTools } from './PostTools';
import { usePostDraft, type PostDraft } from './use-post-draft';

function initialDraft(post: PostView): PostDraft {
  return {
    body: post.body,
    imageRef: post.edit?.imageRef ?? null,
    spoiler: post.spoiler,
    game: post.game && post.edit?.gameIgdbId != null ? { igdbId: post.edit.gameIgdbId, name: post.game.name, coverUrl: post.game.coverUrl } : null,
  };
}

/** Editar o próprio post: os mesmos campos de criar, com os valores atuais. Salvar com mudança marca o post como "editado". */
export function EditPostModal({ post, userId, uploadMode, onClose }: { post: PostView; userId: string; uploadMode: UploadMode; onClose: () => void }) {
  const original = initialDraft(post);
  const api = usePostDraft(original, uploadMode, userId);
  const { draft } = api;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = (draft.body.trim() !== '' || draft.imageRef !== null) && draft.body.length <= POST_MAX && !api.uploading && !pending;

  async function save() {
    setPending(true);
    setError(null);
    const result = await updatePostAction(post.id, {
      body: draft.body,
      spoiler: draft.spoiler,
      // Só manda o que mudou: sem `imageRef` e sem `igdbId` o servidor mantém a imagem e o jogo como estão.
      ...(draft.imageRef !== original.imageRef ? { imageRef: draft.imageRef } : {}),
      ...(draft.game?.igdbId !== original.game?.igdbId ? { igdbId: draft.game?.igdbId ?? null } : {}),
    });
    setPending(false);
    if (result.ok) return onClose();
    setError(
      result.error === 'empty' || result.error === 'too-long'
        ? t.postErrors[result.error]
        : result.error === 'invalid-image'
          ? t.invalidImage
          : result.error === 'game-not-found'
            ? t.gameNotFound
            : result.error === 'game-unavailable'
              ? t.unavailable
              : result.error === 'not-found'
                ? t.notFound
                : t.generic,
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.editTitle}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t.cancel}
          </Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {t.save}
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        <TextArea label={t.composerLabel} value={draft.body} onChange={(event) => api.setBody(event.target.value)} maxLength={POST_MAX} rows={5} helpText={t.counter(draft.body.length)} />
        <div className={styles.attachments}>
          <PostTools api={api} disabled={pending} />
        </div>
        <ImagePreview api={api} />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
