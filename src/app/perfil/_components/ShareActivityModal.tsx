'use client';

import { useEffect, useState } from 'react';
import { ActivityGame, ActivityPost, Badge, Button, Modal, SpoilerGuard, TextArea } from 'nogasds';
import { ACTIVITY_NOTE_MAX } from '@/lib/shelf/activity-limits';
import { feedMessages as t } from '@/lib/feed/messages';
import type { ActivityView } from '@/lib/feed/view';
import { STATUS_LABEL } from '@/lib/shelf/status';
import { shareActivityAction, previewActivityAction } from '../activity-actions';
import { STATUS_TONE } from './AddGameModal';
import styles from '../shelf.module.css';

/** Quem está compartilhando (aparece na prévia do post). */
export interface ShareAuthor {
  name: string;
  username: string;
  avatarUrl?: string;
}

/** Capa miniatura do card do jogo (decorativa: o nome do jogo está ao lado). */
function Cover({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" />;
}

/**
 * "Compartilhar atividade" (Figma: Compartilhar atividade, passo 2): prévia do post gerado e texto opcional. Nada é
 * publicado até o clique em Compartilhar.
 */
export function ShareActivityModal({
  activityId,
  author,
  onClose,
  onShared,
}: {
  activityId: string;
  author: ShareAuthor;
  onClose: () => void;
  /** Depois de compartilhar: o pai mostra o aviso "Compartilhado no seu feed" com "Ver post". */
  onShared: (activityId: string, postId: string) => void;
}) {
  const [preview, setPreview] = useState<{ activity: ActivityView; spoiler: boolean } | 'failed' | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    previewActivityAction(activityId).then((result) => {
      if (active) setPreview(result.ok ? { activity: result.activity, spoiler: result.spoiler } : 'failed');
    });
    return () => {
      active = false;
    };
  }, [activityId]);

  async function share() {
    setPending(true);
    setError(null);
    const result = await shareActivityAction(activityId, note);
    setPending(false);
    if (result.ok) return onShared(activityId, result.postId);
    setError(result.error === 'not-found' ? t.shareNotFound : result.error === 'too-long' ? t.shareTooLong : t.shareFailed);
  }

  const activity = preview !== null && preview !== 'failed' ? preview.activity : null;
  const spoiler = preview !== null && preview !== 'failed' ? preview.spoiler : false;
  return (
    <Modal
      open
      onClose={onClose}
      title={t.shareTitle}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t.cancel}
          </Button>
          <Button onClick={() => void share()} disabled={pending || activity === null}>
            {t.shareSend}
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        <p className={styles.hint}>{t.shareIntro}</p>
        {preview === 'failed' ? (
          <p className={styles.fieldError} role="alert">
            {t.shareNotFound}
          </p>
        ) : null}
        {activity ? (
          <ActivityPost
            author={author.name}
            avatar={{ src: author.avatarUrl }}
            meta={`@${author.username} · agora`}
            phrase={activity.phrase}
            note={note.trim() ? <SpoilerGuard active={spoiler}><p>{note.trim()}</p></SpoilerGuard> : undefined}
            excerpt={activity.excerpt ? <SpoilerGuard active={spoiler}>{activity.excerpt}</SpoilerGuard> : undefined}
            media={
              activity.imageUrl ? (
                <SpoilerGuard active={spoiler}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activity.imageUrl} alt={t.activityScreenshotAlt} />
                </SpoilerGuard>
              ) : undefined
            }
            game={
              <ActivityGame
                title={activity.gameName}
                meta={activity.meta || undefined}
                detail={activity.detail}
                cover={activity.coverUrl ? <Cover src={activity.coverUrl} /> : undefined}
                badge={<Badge tone={STATUS_TONE[activity.status]}>{STATUS_LABEL[activity.status]}</Badge>}
              />
            }
          />
        ) : null}
        <TextArea
          label={t.shareNoteLabel}
          placeholder={t.shareNotePlaceholder}
          value={note}
          rows={3}
          error={note.length > ACTIVITY_NOTE_MAX ? t.shareTooLong : undefined}
          helpText={`${note.length}/${ACTIVITY_NOTE_MAX}`}
          onChange={(event) => setNote(event.target.value)}
        />
        {error ? (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
