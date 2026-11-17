'use client';

import { useState } from 'react';
import { Button, TextArea } from 'nogasds';
import { COMMENT_MAX, type CommentErrorCode } from '@/lib/feed/comments';
import { feedMessages as t } from '@/lib/feed/messages';
import styles from '../feed.module.css';

/**
 * Campo de comentário (novo, resposta ou edição): só texto, até 500 caracteres. `onSubmit` devolve `null` se deu certo
 * ou o código do erro; a mensagem aparece abaixo do campo.
 */
export function CommentForm({
  id,
  label,
  placeholder,
  submitLabel,
  initial = '',
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  id?: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<CommentErrorCode | 'not-found' | 'invalid' | null>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLong = body.length > COMMENT_MAX;

  async function submit() {
    setPending(true);
    setError(null);
    const failure = await onSubmit(body);
    setPending(false);
    if (failure === null) return setBody('');
    setError(failure === 'not-found' ? t.commentNotFound : failure === 'invalid' ? t.generic : t.commentErrors[failure]);
  }

  return (
    <div className={styles.commentForm}>
      <TextArea
        id={id}
        label={label}
        placeholder={placeholder}
        rows={3}
        value={body}
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        helpText={t.commentCounter(body.length)}
        error={error ?? (tooLong ? t.commentErrors['too-long'] : undefined)}
        disabled={pending}
      />
      <div className={styles.commentFormActions}>
        {onCancel ? (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {t.cancel}
          </Button>
        ) : null}
        <Button size="sm" onClick={() => void submit()} disabled={pending || body.trim() === '' || tooLong}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
