'use client';

import { useRef, useState } from 'react';
import { Button, IconButton, Switch, Tag } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { IMAGE_ACCEPT } from '@/lib/profile/images';
import styles from '../feed.module.css';
import { MarkGameModal } from './MarkGameModal';
import type { PostDraftApi } from './use-post-draft';

/**
 * Ferramentas do post (Figma: Criar post): imagem, marcar jogo e "contém spoiler". Serve ao compositor e à janela de
 * edição. O jogo marcado aparece como etiqueta removível; a janela de busca abre aqui.
 */
export function PostTools({ api, disabled }: { api: PostDraftApi; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [marking, setMarking] = useState(false);
  const { draft } = api;

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
      {draft.game ? (
        <Tag onRemove={() => api.setGame(null)} removeLabel={t.removeGame}>
          {draft.game.name}
        </Tag>
      ) : (
        <Button variant="ghost" size="sm" type="button" onClick={() => setMarking(true)} disabled={disabled}>
          {t.markGame}
        </Button>
      )}
      <Switch label={t.spoiler} checked={draft.spoiler} onChange={(event) => api.setSpoiler(event.target.checked)} disabled={disabled} />
      <MarkGameModal
        open={marking}
        onClose={() => setMarking(false)}
        onPick={(game) => {
          api.setGame(game);
          setMarking(false);
        }}
      />
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
