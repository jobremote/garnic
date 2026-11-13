'use client';

import { useState } from 'react';
import { PostComposer } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { POST_MAX } from '@/lib/feed/posts';
import { createPostAction } from '../actions';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import styles from '../feed.module.css';
import { ImagePreview, PostTools } from './PostTools';
import { usePostDraft, type PostDraft } from './use-post-draft';

const EMPTY: PostDraft = { body: '', imageRef: null, spoiler: false, game: null };

/** Criar post (Figma: Criar post): texto até 1.500 caracteres, 1 imagem, 1 jogo marcado e "contém spoiler". */
export function Composer({ userId, name, avatarUrl, uploadMode }: { userId: string; name: string; avatarUrl?: string; uploadMode: UploadMode }) {
  const api = usePostDraft(EMPTY, uploadMode, userId);
  const { draft } = api;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Texto ou imagem é obrigatório: só marcar o jogo não basta.
  const canSubmit = (draft.body.trim() !== '' || draft.imageRef !== null) && !api.uploading && !pending;

  async function publish() {
    setPending(true);
    setMessage(null);
    const result = await createPostAction({ body: draft.body, imageRef: draft.imageRef, spoiler: draft.spoiler, igdbId: draft.game?.igdbId ?? null });
    setPending(false);
    if (result.ok) {
      api.reset(EMPTY);
      setMessage({ kind: 'ok', text: t.published });
      return;
    }
    const text =
      result.error === 'empty' || result.error === 'too-long'
        ? t.postErrors[result.error]
        : result.error === 'invalid-image'
          ? t.invalidImage
          : result.error === 'game-not-found'
            ? t.gameNotFound
            : result.error === 'game-unavailable'
              ? t.unavailable
              : t.generic;
    setMessage({ kind: 'error', text });
  }

  return (
    <div className={styles.composerWrap}>
      <PostComposer
        className={styles.composer}
        label={t.composerLabel}
        placeholder={t.composerPlaceholder}
        avatar={{ name, src: avatarUrl }}
        value={draft.body}
        onChange={api.setBody}
        onSubmit={() => void publish()}
        maxLength={POST_MAX}
        submitLabel={t.publish}
        canSubmit={canSubmit}
        tools={<PostTools api={api} disabled={pending} />}
      />
      <ImagePreview api={api} />
      {message ? (
        <p className={message.kind === 'error' ? styles.error : styles.hint} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
