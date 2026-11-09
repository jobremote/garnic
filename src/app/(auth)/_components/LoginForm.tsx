'use client';

import { useActionState } from 'react';
import { Banner, Button, Link, TextField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { loginAction } from '../actions';
import { initialLoginState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader, OrDivider } from './auth-parts';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialLoginState);

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader title="Entrar" description="Acesse sua conta para continuar catalogando seus jogos." />
      {state.failed ? (
        <Banner variant="error" title={messages.login.badCredentialsTitle}>
          {messages.login.badCredentialsText}
        </Banner>
      ) : null}
      <GoogleButton>Continuar com Google</GoogleButton>
      <OrDivider />

      <TextField
        name="email"
        type="email"
        label="E-mail"
        placeholder="voce@email.com"
        autoComplete="email"
        defaultValue={state.email}
        error={state.errors.email}
      />
      <PasswordField
        name="password"
        label="Senha"
        placeholder="Sua senha"
        autoComplete="current-password"
        error={state.errors.password}
      />
      <div className={styles.alignEnd}>
        {/* A recuperação de senha é uma entrega à parte; até lá o link fica desabilitado. */}
        <Link href="/recuperar-senha" disabled>
          Esqueci a senha
        </Link>
      </div>

      <Button type="submit" disabled={pending}>
        Entrar
      </Button>
      <p className={styles.footer}>
        Não tem conta? <Link href="/cadastrar">Criar conta</Link>
      </p>
    </form>
  );
}
