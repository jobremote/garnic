'use client';

import { useActionState } from 'react';
import { Banner, Button, Link, TextField } from 'nogasds';
import { requestResetAction } from '../recovery-actions';
import { initialRequestResetState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';
import { ResendButton } from './ResendButton';

/** "Esqueci a senha": pede o e-mail e, depois do envio, mostra "Verifique seu e-mail" com o reenvio do link. */
export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestResetAction, initialRequestResetState);

  if (state.status === 'sent') {
    return (
      <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
        <AuthHeader
          title="Verifique seu e-mail"
          description={`Se existir uma conta para ${state.email}, enviamos um link para redefinir a senha.`}
        />
        <Banner variant="info" title="Link enviado">
          Confira também a caixa de spam.
        </Banner>
        <input type="hidden" name="email" value={state.email} />
        <ResendButton key={state.nonce} initialSeconds={state.resendInSeconds} label="Reenviar link" />
        <div className={styles.alignCenter}>
          <Link href="/entrar">Voltar para o login</Link>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader
        title="Recuperar senha"
        description="Informe seu e-mail e enviaremos um link para criar uma nova senha."
      />
      <TextField
        name="email"
        type="email"
        label="E-mail"
        placeholder="voce@email.com"
        autoComplete="email"
        defaultValue={state.email}
        error={state.error}
      />
      <Button type="submit" disabled={pending}>
        Enviar link
      </Button>
      <div className={styles.alignCenter}>
        <Link href="/entrar">Voltar para o login</Link>
      </div>
    </form>
  );
}
