'use client';

import { useActionState } from 'react';
import { Button, Checkbox, Link, TextField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { signupAction } from '../actions';
import { initialSignupState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader, OrDivider } from './auth-parts';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialSignupState);
  const { values, errors } = state;

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader title="Criar conta" description="Cadastre-se para catalogar seus jogos e escrever sobre eles." />
      <GoogleButton>Cadastrar com Google</GoogleButton>
      <OrDivider />

      <TextField
        name="name"
        label="Nome completo"
        placeholder="Seu nome completo"
        autoComplete="name"
        defaultValue={values.name}
        error={errors.name}
      />
      <TextField
        name="username"
        label="@usuário"
        placeholder="seu.usuario"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={values.username}
        helpText={messages.signup.usernameHint}
        error={errors.username}
      />
      <TextField
        name="email"
        type="email"
        label="E-mail"
        placeholder="voce@email.com"
        autoComplete="email"
        defaultValue={values.email}
        error={errors.email}
      />
      <PasswordField
        name="password"
        label="Senha"
        placeholder="Crie uma senha"
        autoComplete="new-password"
        helpText={messages.signup.passwordHint}
        error={errors.password}
      />
      <PasswordField
        name="confirmPassword"
        label="Repetir senha"
        placeholder="Repita a senha"
        autoComplete="new-password"
        error={errors.confirmPassword}
      />
      <Checkbox
        name="terms"
        defaultChecked={values.terms}
        error={errors.terms}
        label={
          <>
            Li e aceito os{' '}
            <Link href="/termos" target="_blank" rel="noopener">
              Termos de uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" target="_blank" rel="noopener">
              Política de Privacidade
            </Link>
          </>
        }
      />

      <Button type="submit" disabled={pending}>
        Criar conta
      </Button>
      <p className={styles.footer}>
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </form>
  );
}
