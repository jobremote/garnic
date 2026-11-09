'use client';

import { useActionState } from 'react';
import { Banner, Button, Link, TextField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { linkGoogleAction } from '../google-actions';
import { initialLinkGoogleState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';
import { PasswordField } from './PasswordField';

/** O e-mail do Google já tem conta: confirma a senha da conta para vincular. */
export function LinkGoogleForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(linkGoogleAction, initialLinkGoogleState);

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader title="Já existe uma conta com esse e-mail" description="Confirme a senha da conta para vincular com o Google." />
      {state.failed ? (
        <Banner variant="error" title={messages.google.wrongPasswordTitle}>
          {messages.google.wrongPasswordText}
        </Banner>
      ) : null}
      <TextField label="E-mail" value={email} readOnly disabled />
      <PasswordField
        name="password"
        label="Senha"
        placeholder="Sua senha"
        autoComplete="current-password"
        // O banner (role="alert") já explica o erro; o campo só fica com a borda de erro, como no protótipo.
        containerClassName={state.failed ? 'nds-text-field--invalid' : undefined}
      />
      <div className={styles.alignEnd}>
        <Link href="/recuperar-senha">Esqueci a senha</Link>
      </div>
      <Button type="submit" disabled={pending}>
        Vincular conta
      </Button>
      <div className={styles.alignCenter}>
        <Link href="/entrar">Cancelar</Link>
      </div>
    </form>
  );
}
