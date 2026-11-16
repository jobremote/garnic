'use client';

import { useState } from 'react';
import { Button, Modal, TextArea } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { withoutMentions } from '@/lib/feed/mentions';
import { POST_MAX } from '@/lib/feed/posts';
import type { PostView } from '@/lib/feed/view';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import { updatePostAction } from '../actions';
import styles from '../feed.module.css';
import { ImagePreview, MarkedGames, PostTools } from './PostTools';
import { usePostDraft, type PostDraft } from './use-post-draft';
import { useMentions } from './use-mentions';

function initialDraft(post: PostView): PostDraft {
  return {
    body: post.body,
    imageRef: post.edit?.imageRef ?? null,
    spoiler: post.spoiler,
    games: post.games.map((game) => ({ igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl })),
  };
}

/** A lista de jogos mudou (outros jogos, outra ordem ou menos jogos)? */
const sameGames = (a: PostDraft['games'], b: PostDraft['games']) => a.length === b.length && a.every((game, index) => game.igdbId === b[index].igdbId);

/** Editar o próprio post: os mesmos campos de criar, com os valores atuais. Salvar com mudança marca o post como "editado". */
export function EditPostModal({ post, userId, uploadMode, onClose }: { post: PostView; userId: string; uploadMode: UploadMode; onClose: () => void }) {
  const [original] = useState(() => initialDraft(post));
  const api = usePostDraft(original, uploadMode, userId);
  const { attachField, change, inputProps, suggestions, notice, insertGame } = useMentions(api);
  const { draft } = api;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = (withoutMentions(draft.body, draft.games) !== '' || draft.imageRef !== null) && draft.body.length <= POST_MAX && !api.uploading && !pending;

  async function save() {
    setPending(true);
    setError(null);
    const result = await updatePostAction(post.id, {
      body: draft.body,
      spoiler: draft.spoiler,
      // Só manda o que mudou: sem `imageRef` e sem `igdbIds` o servidor mantém a imagem e os jogos como estão.
      ...(draft.imageRef !== original.imageRef ? { imageRef: draft.imageRef } : {}),
      ...(!sameGames(draft.games, original.games) ? { igdbIds: draft.games.map((game) => game.igdbId) } : {}),
    });
    setPending(false);
    if (result.ok) return onClose();
    setError(
      result.error === 'empty' || result.error === 'too-long' || result.error === 'too-many-games'
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
        <TextArea
          {...inputProps}
          ref={attachField}
          label={t.composerLabel}
          value={draft.body}
          onChange={(event) => change(event.target.value)}
          maxLength={POST_MAX}
          rows={5}
          helpText={t.counter(draft.body.length)}
        />
        {suggestions}
        {draft.games.length > 0 ? (
          <div className={styles.attachments}>
            <MarkedGames api={api} />
          </div>
        ) : null}
        <div className={styles.attachments}>
          <PostTools api={api} disabled={pending} onPickGame={insertGame} />
        </div>
        <ImagePreview api={api} />
        {notice ? (
          <p className={styles.error} role="alert">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
