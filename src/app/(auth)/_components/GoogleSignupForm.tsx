'use client';

import { useActionState, useState } from 'react';
import { Button, Checkbox, Link, TextField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { usernameError } from '@/lib/auth/validation';
import { checkUsernameTakenAction } from '../actions';
import { completeGoogleSignupAction } from '../google-actions';
import { initialGoogleSignupState, type GoogleSignupState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader } from './auth-parts';

type Field = 'username' | 'terms';

/**
 * Escolher o @usuário depois de entrar com o Google. Nome e e-mail vêm do Google e não se editam aqui.
 * Os erros aparecem quando o cursor sai do campo (mesma regra do cadastro); o @usuário em uso é consultado ao sair.
 */
export function GoogleSignupForm({ name, email }: { name: string; email: string }) {
  const [state, formAction, pending] = useActionState(completeGoogleSignupAction, initialGoogleSignupState);
  const [username, setUsername] = useState('');
  const [terms, setTerms] = useState(false);
  const [taken, setTaken] = useState<{ username: string; taken: boolean } | null>(null);
  // Campos já visitados desde a última resposta do servidor; resposta nova zera (a chave é o `state`).
  const [visited, setVisited] = useState<{ for: GoogleSignupState; fields: Field[] }>({ for: state, fields: [] });
  const fields = visited.for === state ? visited.fields : [];
  const touch = (field: Field) => setVisited({ for: state, fields: fields.includes(field) ? fields : [...fields, field] });

  const liveUsername = usernameError(username) ?? (taken?.taken && taken.username === username ? messages.signup.usernameTaken : undefined);
  const liveTerms = terms ? undefined : messages.signup.termsRequired;
  const usernameMessage = fields.includes('username') ? liveUsername : state.errors.username;
  const termsMessage = fields.includes('terms') ? liveTerms : state.errors.terms;

  const checkTaken = async () => {
    if (usernameError(username) || taken?.username === username) return;
    const result = await checkUsernameTakenAction(username);
    setTaken({ username, taken: result });
  };

  return (
    <form action={formAction} noValidate className={styles.form} aria-busy={pending}>
      <AuthHeader title="Escolha seu @usuário" description="Você entrou com o Google. Falta só escolher como você aparece no Garnic." />
      <TextField label="Nome completo" value={name} readOnly disabled />
      <TextField label="E-mail" value={email} readOnly disabled />
      <TextField
        name="username"
        label="@usuário"
        placeholder="seu.usuario"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
          if (state.errors.username && !fields.includes('username')) touch('username');
        }}
        onBlur={() => {
          touch('username');
          void checkTaken();
        }}
        helpText={messages.signup.usernameHint}
        error={usernameMessage}
      />
      <Checkbox
        name="terms"
        checked={terms}
        onChange={(event) => {
          setTerms(event.target.checked);
          if (state.errors.terms && !fields.includes('terms')) touch('terms');
        }}
        onBlur={() => touch('terms')}
        error={termsMessage}
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
    </form>
  );
}
