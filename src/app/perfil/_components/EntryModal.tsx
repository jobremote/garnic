'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Banner,
  Button,
  Checkbox,
  DurationField,
  Modal,
  MonthYearField,
  Rating,
  ScreenshotField,
  Select,
  Tabs,
  TextArea,
  type DurationValue,
  type MonthYearValue,
} from 'nogasds';
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, mediaUrl } from '@/lib/profile/images';
import { REVIEW_MAX } from '@/lib/shelf/entry';
import { screenshotMessages as sm, shelfMessages as t } from '@/lib/shelf/messages';
import { SHELF_STATUSES, STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import type { TimeToBeat } from '@/lib/igdb/igdb';
import { discardScreenshotAction, openEntryAction, saveEntryAction, type EntryView, type TagData } from '../shelf-actions';
import styles from '../shelf.module.css';
import { EntryTagsField } from './EntryTagsField';
import { uploadImage, type UploadMode } from './upload-image';

type TabValue = 'essential' | 'playthrough' | 'review';
type FieldErrors = Partial<Record<'status' | 'rating' | 'platform' | 'review' | 'started' | 'ended' | 'playMinutes' | 'tags' | 'screenshot', string>>;

/** O que a pessoa está editando. Fica aqui, e não no servidor, até clicar em Salvar. */
interface Draft {
  status: ShelfStatus;
  rating: number | null;
  platform: string;
  review: string;
  spoiler: boolean;
  started: MonthYearValue;
  ended: MonthYearValue;
  time: DurationValue;
  tagIds: string[];
  /** Screenshot mostrada (endereço) e a mudança pendente: referência nova, `null` para remover, ausente se não mudou. */
  shotUrl?: string;
  shotChange?: string | null;
  shotSpoiler: boolean;
}

const toDraft = (entry: EntryView): Draft => ({
  status: entry.status,
  rating: entry.rating,
  platform: entry.platform ?? '',
  review: entry.review ?? '',
  spoiler: entry.reviewSpoiler,
  tagIds: entry.tagIds,
  shotUrl: entry.screenshotUrl,
  shotSpoiler: entry.screenshotSpoiler,
  started: entry.started,
  ended: entry.ended,
  time:
    entry.playMinutes === null
      ? { hours: null, minutes: null }
      : { hours: Math.floor(entry.playMinutes / 60), minutes: entry.playMinutes % 60 },
});

/** Horas e minutos viram minutos. Os dois vazios: sem tempo (`null`). */
const toMinutes = (time: DurationValue): number | null =>
  time.hours === null && time.minutes === null ? null : (time.hours ?? 0) * 60 + (time.minutes ?? 0);

const formatMinutes = (total: number) => {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? (minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
};

export interface EntryModalProps {
  /** `edit`: as 3 abas. `zeroed`: o pop-up opcional de quem acabou de zerar (nota, fim e tempo). */
  mode: 'edit' | 'zeroed';
  entryId: string;
  onClose: () => void;
  /** Depois de salvar: o pai mostra o aviso e fecha. */
  onSaved: (result: { gameName: string; statusChanged: boolean; status: ShelfStatus }) => void;
  /** Pedido de remover (só no modo `edit`). */
  onRemove?: (entryId: string, gameName: string) => void;
  /** Todas as tags da pessoa (para escolher as do jogo). */
  tags: TagData[];
  /** Uma tag criada no "+ Nova tag": o pai a inclui na lista. */
  onTagCreated: (tag: TagData) => void;
  /** Onde as imagens são guardadas neste ambiente e quem está enviando (a pasta é do próprio usuário). */
  uploadMode: UploadMode;
  userId: string;
}

/** Editar a entrada em 3 abas e o pop-up do Zerado (Figma: Editar entrada e Pop-up Zerado). */
export function EntryModal({ mode, entryId, onClose, onSaved, onRemove, tags, onTagCreated, uploadMode, userId }: EntryModalProps) {
  const [loaded, setLoaded] = useState<{ entry: EntryView; timeToBeat: TimeToBeat | null } | 'failed' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let active = true;
    openEntryAction(entryId).then((result) => {
      if (!active) return;
      if (!result.ok) return setLoaded('failed');
      setLoaded({ entry: result.entry, timeToBeat: result.timeToBeat });
      setDraft(toDraft(result.entry));
    });
    return () => {
      active = false;
    };
  }, [entryId]);

  const title = mode === 'zeroed' ? t.zeroedTitle : t.editTitle;

  // Um só <EntryForm> do começo ao fim: o <dialog> não é recriado quando a entrada termina de carregar.
  return (
    <EntryForm
      mode={mode}
      entry={loaded !== null && loaded !== 'failed' ? loaded.entry : null}
      timeToBeat={loaded !== null && loaded !== 'failed' ? loaded.timeToBeat : null}
      failed={loaded === 'failed'}
      draft={draft}
      setDraft={(change) => setDraft((current) => (current ? { ...current, ...change } : current))}
      title={title}
      onClose={onClose}
      onSaved={onSaved}
      onRemove={onRemove}
      tags={tags}
      onTagCreated={onTagCreated}
      uploadMode={uploadMode}
      userId={userId}
    />
  );
}

interface EntryFormProps extends Omit<EntryModalProps, 'entryId'> {
  /** `null` enquanto carrega (ou se falhou). */
  entry: EntryView | null;
  timeToBeat: TimeToBeat | null;
  failed: boolean;
  draft: Draft | null;
  setDraft: (change: Partial<Draft>) => void;
  title: string;
}

function EntryForm({ mode, entry, timeToBeat, failed, draft, setDraft, title, onClose: closeModal, onSaved, onRemove, tags, onTagCreated, uploadMode, userId }: EntryFormProps) {
  const [uploading, setUploading] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  // Fechar sem salvar: a imagem enviada e ainda não salva é apagada do armazenamento.
  const onClose = () => {
    if (typeof draft?.shotChange === 'string') void discardScreenshotAction(draft.shotChange);
    closeModal();
  };
  const [tab, setTab] = useState<TabValue>('essential');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const base = useId();
  const panel = (value: TabValue) => `${base}-${value}`;

  if (!entry || !draft) {
    return (
      <Modal open onClose={onClose} title={title}>
        {failed ? <Banner variant="error" title={t.loadFailed} /> : <p className={styles.hint}>{t.loading}</p>}
      </Modal>
    );
  }
  const zeroed = draft.status === 'zerado';

  /** Envia a imagem direto ao armazenamento ao escolher; a entrada só muda quando clicar em Salvar. */
  const pickShot = async (file: File) => {
    setShotError(null);
    if (file.size > IMAGE_MAX_BYTES.screenshot) return setShotError(sm.tooBig(`${IMAGE_MAX_BYTES.screenshot / 1024 / 1024} MB`));
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) return setShotError(sm.wrongType);
    if (uploadMode === 'unavailable') return setShotError(sm.uploadUnavailable);
    setUploading(true);
    try {
      const ref = await uploadImage(uploadMode, 'screenshot', file, userId);
      // Uma imagem enviada antes e ainda não salva é trocada por esta: apaga a anterior.
      if (typeof draft.shotChange === 'string') void discardScreenshotAction(draft.shotChange);
      setDraft({ shotUrl: mediaUrl(ref), shotChange: ref });
    } catch {
      setShotError(sm.uploadFailed);
    } finally {
      setUploading(false);
    }
  };
  const removeShot = () => {
    setShotError(null);
    if (typeof draft.shotChange === 'string') void discardScreenshotAction(draft.shotChange);
    // Se a imagem já estava salva, a remoção só vale ao Salvar; se era uma nova ainda não salva, volta a como estava.
    setDraft({ shotUrl: undefined, shotChange: entry.screenshotUrl ? null : undefined, shotSpoiler: false });
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    const time = toMinutes(draft.time);
    const payload =
      mode === 'zeroed'
        ? { rating: draft.rating, ended: draft.ended, playMinutes: time }
        : {
            status: draft.status,
            rating: draft.rating,
            platform: draft.platform === '' ? null : draft.platform,
            review: draft.review,
            reviewSpoiler: draft.spoiler,
            ...(draft.shotChange !== undefined ? { screenshot: draft.shotChange } : {}),
            screenshotSpoiler: draft.shotSpoiler,
            tagIds: draft.tagIds,
            started: draft.started,
            ended: draft.ended,
            // O tempo só se informa em Zerado; fora dele o valor salvo é mantido, sem mexer.
            ...(zeroed ? { playMinutes: time } : {}),
          };
    const result = await saveEntryAction(entry.entryId, payload);
    setSaving(false);
    if (result.ok) return onSaved(result);
    if (result.error === 'not-found') return setFormError(t.failed);
    setErrors(result.errors);
    // Leva para a primeira aba que tem erro.
    if (mode === 'edit') {
      const { status, rating, platform, review, started, ended, playMinutes, tags: tagsError, screenshot } = result.errors;
      if (status || rating || platform || tagsError) setTab('essential');
      else if (started || ended || playMinutes) setTab('playthrough');
      else if (review || screenshot) setTab('review');
    }
  };

  const ratingField = (
    <div className={styles.ratingRow}>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t.ratingLabel}</span>
        <Rating label={t.ratingLabel} value={draft.rating ?? 0} onChange={(value) => setDraft({ rating: value })} />
      </div>
      {draft.rating !== null ? (
        <Button variant="ghost" size="sm" onClick={() => setDraft({ rating: null })}>
          {t.clearRating}
        </Button>
      ) : null}
    </div>
  );
  const ratingError = errors.rating ? <p className={styles.fieldError}>{errors.rating}</p> : null;

  const timeFields = (
    <>
      <DurationField
        label={t.timeLabel}
        value={draft.time}
        onChange={(time) => setDraft({ time })}
        error={errors.playMinutes}
      />
      <IgdbTimes time={timeToBeat} />
    </>
  );

  const footer =
    mode === 'zeroed' ? (
      <>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {t.zeroedSkip}
        </Button>
        <Button onClick={save} disabled={saving}>
          {t.save}
        </Button>
      </>
    ) : (
      <div className={styles.entryFooter}>
        <Button variant="danger-ghost" onClick={() => onRemove?.(entry.entryId, entry.gameName)} disabled={saving}>
          {t.removeEntry}
        </Button>
        <div className={styles.entryFooterEnd}>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t.save}
          </Button>
        </div>
      </div>
    );

  return (
    <Modal open onClose={onClose} title={title} footer={footer}>
      <div className={styles.modalBody}>
        <GameHeader entry={entry} />
        {formError ? <Banner variant="error" title={formError} /> : null}

        {mode === 'zeroed' ? (
          <>
            <Banner variant="success" title={t.zeroedBanner(entry.gameName)}>
              {t.zeroedText}
            </Banner>
            <div className={styles.fieldGroup}>
              {ratingField}
              {ratingError}
            </div>
            <MonthYearField label={t.endLabel} value={draft.ended} onChange={(ended) => setDraft({ ended })} error={errors.ended} />
            {timeFields}
          </>
        ) : (
          <>
            <Tabs
              label={t.tabsLabel}
              id={`${base}-tabs`}
              value={tab}
              onChange={(value) => setTab(value as TabValue)}
              items={[
                { value: 'essential', label: t.tabEssential, controls: panel('essential'), filled: draft.rating !== null || draft.platform !== '' || draft.tagIds.length > 0, filledLabel: t.filledTab },
                {
                  value: 'playthrough',
                  label: t.tabPlaythrough,
                  controls: panel('playthrough'),
                  filled: draft.started.month !== null || draft.ended.month !== null || toMinutes(draft.time) !== null,
                  filledLabel: t.filledTab,
                },
                { value: 'review', label: t.tabReview, controls: panel('review'), filled: draft.review.trim() !== '' || Boolean(draft.shotUrl), filledLabel: t.filledTab },
              ]}
            />

            <Panel id={panel('essential')} tabId={`${base}-tabs-essential`} hidden={tab !== 'essential'}>
              <Select
                label={t.statusLabel}
                placeholder={null}
                value={draft.status}
                error={errors.status}
                onChange={(event) => setDraft({ status: event.target.value as ShelfStatus })}
              >
                {SHELF_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
              <div className={styles.fieldGroup}>
                {ratingField}
                {ratingError}
              </div>
              <Select
                label={t.platformLabel}
                placeholder={null}
                value={draft.platform}
                error={errors.platform}
                onChange={(event) => setDraft({ platform: event.target.value })}
              >
                <option value="">{t.platformNone}</option>
                {entry.platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </Select>
              <EntryTagsField
                tags={tags}
                value={draft.tagIds}
                onChange={(tagIds) => setDraft({ tagIds })}
                onTagCreated={onTagCreated}
                error={errors.tags}
              />
            </Panel>

            <Panel id={panel('playthrough')} tabId={`${base}-tabs-playthrough`} hidden={tab !== 'playthrough'}>
              <MonthYearField label={t.startLabel} value={draft.started} onChange={(started) => setDraft({ started })} error={errors.started} />
              <MonthYearField label={t.endLabel} value={draft.ended} onChange={(ended) => setDraft({ ended })} error={errors.ended} />
              {zeroed ? timeFields : <p className={styles.hint}>{t.timeOnlyZeroed}</p>}
            </Panel>

            <Panel id={panel('review')} tabId={`${base}-tabs-review`} hidden={tab !== 'review'}>
              <TextArea
                label={t.reviewLabel}
                value={draft.review}
                rows={6}
                error={errors.review ?? (draft.review.length > REVIEW_MAX ? t.reviewCounter(draft.review.length, REVIEW_MAX) : undefined)}
                helpText={t.reviewCounter(draft.review.length, REVIEW_MAX)}
                onChange={(event) => setDraft({ review: event.target.value })}
              />
              <Checkbox label={t.reviewSpoiler} checked={draft.spoiler} onChange={(event) => setDraft({ spoiler: event.target.checked })} />
              <p className={styles.hint}>{t.reviewSpoilerHint}</p>
              <ScreenshotField
                label={sm.label}
                src={draft.shotUrl}
                alt={sm.alt(entry.gameName)}
                accept={IMAGE_ACCEPT}
                uploading={uploading}
                helpText={sm.help(`${IMAGE_MAX_BYTES.screenshot / 1024 / 1024} MB`)}
                error={shotError ?? errors.screenshot}
                onSelect={pickShot}
                onRemove={removeShot}
              />
              <Checkbox label={sm.spoilerCheckbox} checked={draft.shotSpoiler} disabled={!draft.shotUrl} onChange={(event) => setDraft({ shotSpoiler: event.target.checked })} />
              <p className={styles.hint}>{sm.spoilerHint}</p>
            </Panel>
          </>
        )}
      </div>
    </Modal>
  );
}

function Panel({ id, tabId, hidden, children }: { id: string; tabId: string; hidden: boolean; children: ReactNode }) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={tabId} hidden={hidden} className={styles.panel}>
      {children}
    </div>
  );
}

/** Capa, título e ano do jogo: fica sempre à vista, fora das abas. */
function GameHeader({ entry }: { entry: EntryView }) {
  return (
    <div className={styles.gameHeader}>
      <div className={styles.gameCover} aria-hidden="true">
        {/* Capa pequena do IGDB, já no tamanho certo: o otimizador de imagens do Next não ajuda aqui. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {entry.coverUrl ? <img src={entry.coverUrl} alt="" /> : null}
      </div>
      <div>
        <p className={styles.gameName}>{entry.gameName}</p>
        {entry.year ? <p className={styles.hint}>{entry.year}</p> : null}
      </div>
    </div>
  );
}

/** As 3 estimativas do IGDB, só quando houver dado. Sem dado, nada aparece (nem zero). */
function IgdbTimes({ time }: { time: TimeToBeat | null }) {
  if (!time) return null;
  const rows: [string, number | null][] = [
    [t.timeFast, time.hastily],
    [t.timeNormal, time.normally],
    [t.timeComplete, time.completely],
  ];
  return (
    <section className={styles.igdbTimes} aria-label={t.igdbTimes}>
      <p className={styles.fieldLabel}>{t.igdbTimes}</p>
      <dl className={styles.timesList}>
        {rows
          .filter(([, minutes]) => minutes !== null)
          .map(([label, minutes]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatMinutes(minutes as number)}</dd>
            </div>
          ))}
      </dl>
      <p className={styles.hint}>{t.igdbTimesHint}</p>
    </section>
  );
}

/** Confirmação de remover (Figma: Remover jogo), com o botão Perigo. */
export function RemoveEntryModal({ name, pending, onCancel, onConfirm }: { name: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open
      onClose={onCancel}
      title={t.removeTitle}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t.cancel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {t.remove}
          </Button>
        </>
      }
    >
      <Banner variant="error" title={t.removeTitle}>
        {t.removeText(name)}
      </Banner>
    </Modal>
  );
}
