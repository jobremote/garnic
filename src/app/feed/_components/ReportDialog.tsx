'use client';

import { useEffect, useState } from 'react';
import { Banner, Button, Modal, Radio, TextArea, Toast } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '@/lib/shelf/screenshot';
import { reportAction } from '../report-actions';
import styles from '../feed.module.css';

export type ReportKind = 'post' | 'comment' | 'user';

/** Quanto tempo o aviso "Denúncia enviada" fica na tela. */
const NOTICE_MS = 5000;

/**
 * Denúncia de post, comentário ou usuário (Figma: "Denunciar post", "Denunciar comentário", "Denunciar usuário"): motivo
 * em opções de escolha única e detalhes opcionais. Só registra. Depois de enviar, mostra um aviso por alguns segundos
 * ("Denúncia enviada" ou "Você já denunciou…") e chama `onClose`.
 */
export function ReportDialog({ kind, id, onClose }: { kind: ReportKind; id: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'reason' | 'details' | 'form', string>>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ already: boolean } | null>(null);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onClose, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [done, onClose]);

  async function send() {
    setSaving(true);
    setErrors({});
    const result = await reportAction(kind, id, reason, details);
    setSaving(false);
    if (result.ok) return setDone({ already: result.alreadyReported });
    if (result.error === 'invalid') {
      return setErrors({
        reason: result.errors?.reason ? t.reportPickReason : undefined,
        details: result.errors?.details ? t.reportDetailsTooLong : undefined,
      });
    }
    setErrors({ form: result.error === 'not-found' ? t.reportNotFound : t.reportFailed });
  }

  if (done) {
    return (
      <div className={styles.toast}>
        <Toast variant={done.already ? 'info' : 'success'} title={done.already ? t.reportAlready[kind] : t.reportSent} onClose={onClose} closeLabel={t.closeToast} />
      </div>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.reportTitle[kind]}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button variant="danger" onClick={() => void send()} disabled={saving}>
            {t.reportSend}
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        {errors.form ? <Banner variant="error" title={errors.form} /> : null}
        <p className={styles.hint}>{t.reportQuestion[kind]}</p>
        <fieldset className={styles.reasons} aria-describedby={errors.reason ? 'report-reason-error' : undefined}>
          <legend className={styles.srOnly}>{t.reportReasonLegend}</legend>
          {REPORT_REASONS.map((value) => (
            <Radio key={value} name="report-reason" value={value} label={t.reportReasons[value]} checked={reason === value} onChange={() => setReason(value)} />
          ))}
        </fieldset>
        {errors.reason ? (
          <p id="report-reason-error" className={styles.error} role="alert">
            {errors.reason}
          </p>
        ) : null}
        <TextArea
          label={t.reportDetails}
          placeholder={t.reportDetailsPlaceholder}
          value={details}
          rows={3}
          error={errors.details}
          helpText={`${details.length}/${REPORT_DETAILS_MAX}`}
          onChange={(event) => setDetails(event.target.value)}
        />
      </div>
    </Modal>
  );
}
