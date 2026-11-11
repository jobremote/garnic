'use client';

import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Modal, Rating, Select, SpoilerGuard, TextArea, type BadgeTone } from 'nogasds';
import { MONTH_NAMES } from 'nogasds';
import { shelfMessages as t, screenshotMessages as m } from '@/lib/shelf/messages';
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '@/lib/shelf/screenshot';
import { STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import { reportScreenshotAction, viewEntryAction, type PublicEntryView } from '../shelf-actions';
import styles from '../shelf.module.css';

const STATUS_TONE: Record<ShelfStatus, BadgeTone> = { 'quero-jogar': 'sky', parado: 'rose', jogando: 'info', zerado: 'success' };

const monthYear = (value: { month: number | null; year: number | null }) =>
  value.month !== null && value.year !== null ? `${MONTH_NAMES[value.month - 1]} de ${value.year}` : null;

const formatMinutes = (total: number) => {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? (minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
};

export interface EntryViewModalProps {
  entryId: string;
  onClose: () => void;
  /** Dona da entrada: o botão "Editar entrada" leva à edição. */
  onEdit: (entryId: string) => void;
  onReported: (alreadyReported: boolean) => void;
}

/** A entrada de um jogo como quem vê o perfil: detalhes, review e screenshot (com spoiler atrás de um clique) e denúncia. */
export function EntryViewModal({ entryId, onClose, onEdit, onReported }: EntryViewModalProps) {
  const [entry, setEntry] = useState<PublicEntryView | 'failed' | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let active = true;
    viewEntryAction(entryId).then((result) => {
      if (active) setEntry(result.ok ? result.entry : 'failed');
    });
    return () => {
      active = false;
    };
  }, [entryId]);

  if (entry === null || entry === 'failed') {
    return (
      <Modal open onClose={onClose} title={m.viewTitle}>
        {entry === 'failed' ? <Banner variant="error" title={t.loadFailed} /> : <p className={styles.hint}>{t.loading}</p>}
      </Modal>
    );
  }

  if (reporting) {
    return (
      <ReportModal
        entryId={entry.entryId}
        onCancel={() => setReporting(false)}
        onDone={(already) => {
          setReporting(false);
          onReported(already);
          setEntry({ ...entry, reportedByViewer: true });
        }}
      />
    );
  }

  const period = [monthYear(entry.started), monthYear(entry.ended)];
  const hasDetails = Boolean(entry.platform || entry.rating || period[0] || period[1] || entry.playMinutes || entry.tags.length > 0);
  const canReport = !entry.own && Boolean(entry.screenshotUrl);

  return (
    <Modal
      open
      onClose={onClose}
      title={m.viewTitle}
      footer={
        entry.own ? (
          <Button onClick={() => onEdit(entry.entryId)}>{t.editEntry}</Button>
        ) : canReport ? (
          <Button variant="danger-ghost" onClick={() => setReporting(true)} disabled={entry.reportedByViewer}>
            {entry.reportedByViewer ? m.alreadyReported : m.report}
          </Button>
        ) : undefined
      }
    >
      <div className={styles.modalBody}>
        <div className={styles.gameHeader}>
          <div className={styles.gameCover} aria-hidden="true">
            {/* Capa pequena do IGDB, já no tamanho certo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {entry.coverUrl ? <img src={entry.coverUrl} alt="" /> : null}
          </div>
          <div>
            <p className={styles.gameName}>{entry.gameName}</p>
            <p className={styles.hint}>{entry.year}</p>
          </div>
          <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
        </div>

        {entry.screenshotUrl ? (
          <SpoilerGuard active={entry.screenshotSpoiler} label={m.spoiler}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.viewShot} src={entry.screenshotUrl} alt={m.alt(entry.gameName)} />
          </SpoilerGuard>
        ) : null}

        {entry.rating ? (
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>{m.rating}</span>
            <Rating label={m.rating} value={entry.rating} readOnly />
          </div>
        ) : null}
        <dl className={styles.facts}>
          {entry.platform ? <Fact label={m.platform} value={entry.platform} /> : null}
          {period[0] ? <Fact label={t.startLabel} value={period[0]} /> : null}
          {period[1] ? <Fact label={t.endLabel} value={period[1]} /> : null}
          {entry.playMinutes ? <Fact label={m.playTime} value={formatMinutes(entry.playMinutes)} /> : null}
        </dl>
        {entry.tags.length > 0 ? (
          <ul className={styles.tagChips} aria-label="Tags">
            {entry.tags.map((tag) => (
              <li key={tag.id} className={`nds-tag nds-tag--static nds-tag--${tag.color}`}>
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}

        {entry.review ? (
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>{m.reviewTitle}</span>
            <SpoilerGuard active={entry.reviewSpoiler} label={m.spoiler}>
              <p className={styles.reviewText}>{entry.review}</p>
            </SpoilerGuard>
          </div>
        ) : null}

        {!hasDetails && !entry.review && !entry.screenshotUrl ? <p className={styles.hint}>{m.noDetails}</p> : null}
      </div>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Denúncia de screenshot: motivo e detalhes opcionais. Só registra para revisão. */
function ReportModal({ entryId, onCancel, onDone }: { entryId: string; onCancel: () => void; onDone: (alreadyReported: boolean) => void }) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'reason' | 'details' | 'form', string>>>({});
  const [saving, setSaving] = useState(false);

  const send = async () => {
    setSaving(true);
    const result = await reportScreenshotAction(entryId, reason, details);
    setSaving(false);
    if (result.ok) return onDone(result.alreadyReported);
    setErrors(
      result.error === 'invalid'
        ? { reason: result.errors?.reason, details: result.errors?.details }
        : { form: m.reportFailed },
    );
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={m.reportTitle}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {t.cancel}
          </Button>
          <Button variant="danger" onClick={send} disabled={saving}>
            {m.send}
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        {errors.form ? <Banner variant="error" title={errors.form} /> : null}
        <p className={styles.hint}>{m.reportText}</p>
        <Select
          label={m.reasonLabel}
          value={reason}
          error={errors.reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {m.reasons[value]}
            </option>
          ))}
        </Select>
        <TextArea
          label={m.detailsLabel}
          value={details}
          rows={3}
          error={errors.details}
          helpText={t.reviewCounter(details.length, REPORT_DETAILS_MAX)}
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>
    </Modal>
  );
}
