'use client';

import { useActionState, useState } from 'react';
import { Button } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { validateNewPassword } from '@/lib/auth/validation';
import { resetPasswordAction } from '../recovery-actions';
import { initialResetPasswordState, type ResetPasswordState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';
import { ExpiredLink } from './ExpiredLink';
import { PasswordField } from './PasswordField';

type Field = 'password' | 'confirmPassword';

/**
 * "Criar nova senha". Os erros aparecem quando o cursor sai do campo e somem ao corrigir (mesma regra do cadastro).
 * Erro devolvido pelo servidor (por exemplo, "senha igual ao @usuário", que só ele sabe) fica até a pessoa mexer no campo.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialResetPasswordState);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Campos já visitados desde a última resposta do servidor; resposta nova zera (a chave é o `state`).
  const [visited, setVisited] = useState<{ for: ResetPasswordState; fields: Field[] }>({ for: state, fields: [] });
  const fields = visited.for === state ? visited.fields : [];

  if (state.expired) return <ExpiredLink />;

  const live = validateNewPassword(password, confirm);
  const errorOf = (field: Field) => (fields.includes(field) ? live[field] : state.errors[field]);
  const touch = (field: Field) => setVisited({ for: state, fields: fields.includes(field) ? fields : [...fields, field] });

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader title="Criar nova senha" description="Escolha uma senha nova para sua conta." />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label="Nova senha"
        placeholder="Crie uma senha"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (state.errors.password && !fields.includes('password')) touch('password');
        }}
        onBlur={() => touch('password')}
        helpText={messages.signup.passwordHint}
        error={errorOf('password')}
      />
      <PasswordField
        name="confirmPassword"
        label="Repetir nova senha"
        placeholder="Repita a senha"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => {
          setConfirm(event.target.value);
          if (state.errors.confirmPassword && !fields.includes('confirmPassword')) touch('confirmPassword');
        }}
        onBlur={() => touch('confirmPassword')}
        error={errorOf('confirmPassword')}
      />
      <Button type="submit" disabled={pending}>
        Salvar nova senha
      </Button>
    </form>
  );
}
