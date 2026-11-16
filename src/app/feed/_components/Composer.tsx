'use client';

import { useState } from 'react';
import { PostComposer } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { withoutMentions } from '@/lib/feed/mentions';
import { POST_MAX } from '@/lib/feed/posts';
import { createPostAction } from '../actions';
import type { UploadMode } from '@/app/perfil/_components/upload-image';
import styles from '../feed.module.css';
import { ImagePreview, MarkedGames, PostTools } from './PostTools';
import { usePostDraft, type PostDraft } from './use-post-draft';
import { useMentions } from './use-mentions';

const EMPTY: PostDraft = { body: '', imageRef: null, spoiler: false, games: [] };

/**
 * Criar post (Figma: Criar post): texto até 1.500 caracteres, 1 imagem, até 10 jogos marcados (com "@" ou pelo botão) e
 * "contém spoiler".
 */
export function Composer({ userId, name, avatarUrl, uploadMode }: { userId: string; name: string; avatarUrl?: string; uploadMode: UploadMode }) {
  const api = usePostDraft(EMPTY, uploadMode, userId);
  const mentions = useMentions(api);
  const { draft } = api;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Texto ou imagem é obrigatório: só marcar o jogo não basta (o "@Nome" dos jogos marcados não conta como texto).
  const canSubmit = (withoutMentions(draft.body, draft.games) !== '' || draft.imageRef !== null) && !api.uploading && !pending;

  async function publish() {
    setPending(true);
    setMessage(null);
    const result = await createPostAction({ body: draft.body, imageRef: draft.imageRef, spoiler: draft.spoiler, igdbIds: draft.games.map((game) => game.igdbId) });
    setPending(false);
    if (result.ok) {
      api.reset(EMPTY);
      setMessage({ kind: 'ok', text: t.published });
      return;
    }
    const text =
      result.error === 'empty' || result.error === 'too-long' || result.error === 'too-many-games'
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
        onChange={mentions.change}
        onSubmit={() => void publish()}
        maxLength={POST_MAX}
        submitLabel={t.publish}
        canSubmit={canSubmit}
        inputRef={mentions.attachField}
        inputProps={mentions.inputProps}
        suggestions={mentions.suggestions}
        attachments={draft.games.length > 0 ? <MarkedGames api={api} /> : undefined}
        tools={<PostTools api={api} disabled={pending} onPickGame={mentions.insertGame} />}
      />
      <ImagePreview api={api} />
      {mentions.notice ? (
        <p className={styles.error} role="alert">
          {mentions.notice}
        </p>
      ) : null}
      {message ? (
        <p className={message.kind === 'error' ? styles.error : styles.hint} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
