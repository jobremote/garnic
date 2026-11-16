'use client';

import { useRef, useState } from 'react';
import { Button, IconButton, Switch, Tag } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { POST_GAMES_MAX } from '@/lib/feed/posts';
import { IMAGE_ACCEPT } from '@/lib/profile/images';
import styles from '../feed.module.css';
import { MarkGameModal, type MarkedGame } from './MarkGameModal';
import type { PostDraftApi } from './use-post-draft';

/**
 * Ferramentas do post (Figma: Criar post): imagem, marcar jogo e "contém spoiler". Serve ao compositor e à janela de
 * edição. O botão "Marcar jogo" abre a janela de busca e dá o mesmo resultado do "@": `onPickGame` põe o "@Nome" no
 * texto e o jogo na lista (ver `useMentions`).
 */
export function PostTools({ api, disabled, onPickGame }: { api: PostDraftApi; disabled?: boolean; onPickGame: (game: MarkedGame) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [marking, setMarking] = useState(false);
  const { draft } = api;
  const full = draft.games.length >= POST_GAMES_MAX;

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void api.pickImage(file);
        }}
      />
      <IconButton icon="image" label={t.addImage} size="sm" onClick={() => input.current?.click()} disabled={disabled || api.uploading} type="button" />
      <Button variant="ghost" size="sm" type="button" onClick={() => setMarking(true)} disabled={disabled || full}>
        {t.markGame}
      </Button>
      <Switch label={t.spoiler} checked={draft.spoiler} onChange={(event) => api.setSpoiler(event.target.checked)} disabled={disabled} />
      <MarkGameModal
        open={marking}
        onClose={() => setMarking(false)}
        onPick={(game) => {
          onPickGame(game);
          setMarking(false);
        }}
      />
    </>
  );
}

/** Jogos marcados no post, como etiquetas removíveis, com o contador "n/10 jogos". Não mostra nada sem jogos. */
export function MarkedGames({ api }: { api: PostDraftApi }) {
  const { games } = api.draft;
  if (games.length === 0) return null;
  return (
    <>
      {games.map((game) => (
        <Tag key={game.igdbId} onRemove={() => api.removeGame(game.igdbId)} removeLabel={`${t.removeGame}: ${game.name}`}>
          {game.name}
        </Tag>
      ))}
      <span className={styles.gamesCount} aria-live="polite">
        {t.gamesCount(games.length)}
      </span>
    </>
  );
}

/** Prévia da imagem escolhida, com botão de remover e o aviso de envio ou o erro. */
export function ImagePreview({ api }: { api: PostDraftApi }) {
  return (
    <>
      {api.imageUrl ? (
        <div className={styles.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.postImage} src={api.imageUrl} alt={t.imageAlt} />
          <span className={styles.previewRemove}>
            <IconButton icon="close" label={t.removeImage} size="sm" variant="secondary" type="button" onClick={api.removeImage} />
          </span>
        </div>
      ) : null}
      {api.uploading ? (
        <p className={styles.hint} role="status">
          {t.uploading}
        </p>
      ) : null}
      {api.imageError ? (
        <p className={styles.error} role="alert">
          {api.imageError}
        </p>
      ) : api.imageUrl ? (
        <p className={styles.hint}>{t.imageHint}</p>
      ) : null}
    </>
  );
}
