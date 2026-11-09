'use client';

import { useActionState, useState } from 'react';
import { Banner, Button, CodeField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { verifyAction } from '../actions';
import type { VerifyState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';
import { ResendButton } from './ResendButton';

export function VerifyForm({ email, initialState }: { email: string; initialState: VerifyState }) {
  const [state, formAction, pending] = useActionState(verifyAction, initialState);
  // Dígitos digitados na resposta atual do servidor. Quando chega uma resposta nova, o campo reinicia e a conta zera.
  const [entered, setEntered] = useState({ nonce: state.nonce, count: 0 });
  const digits = entered.nonce === state.nonce ? entered.count : 0;
  const invalidated = state.mode === 'invalidated';
  const expired = state.mode === 'expired';

  const codeError = state.codeError ?? (expired ? messages.verify.expired : undefined);

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader
        title="Valide seu e-mail"
        description={`Enviamos um código de 6 dígitos para ${email}. Ele vale por 10 minutos.`}
      />

      {state.sent ? (
        <Banner variant="info" title={messages.verify.sentTitle}>
          {messages.verify.sentText}
        </Banner>
      ) : null}
      {invalidated ? (
        <Banner variant="error" title={messages.verify.invalidatedTitle}>
          {messages.verify.invalidatedText}
        </Banner>
      ) : null}
      {state.limitReached ? (
        <Banner variant="error" title={messages.verify.limitTitle}>
          {messages.verify.limitText}
        </Banner>
      ) : null}

      <CodeField
        key={state.nonce}
        name="code"
        label="Código de verificação"
        autoFocus
        disabled={invalidated}
        error={invalidated ? undefined : codeError}
        onChange={(value) => setEntered({ nonce: state.nonce, count: value.length })}
      />

      {invalidated ? null : (
        <Button type="submit" name="intent" value="verify" disabled={pending || expired || digits < 6}>
          Validar e-mail
        </Button>
      )}

      <div className={styles.actions}>
        {invalidated || expired ? null : <p className={styles.centerText}>Não recebeu o código?</p>}
        <ResendButton
          key={state.nonce}
          name="intent"
          value="resend"
          initialSeconds={state.resendInSeconds}
          blocked={state.limitReached}
          variant={invalidated ? 'primary' : 'outline'}
          label={invalidated || expired ? 'Enviar novo código' : 'Reenviar código'}
        />
      </div>
    </form>
  );
}
