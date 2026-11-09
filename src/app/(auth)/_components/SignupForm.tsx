'use client';

import { useActionState, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import { Button, Checkbox, Link, TextField } from 'nogasds';
import { messages } from '@/lib/auth/messages';
import { checkUsername, validateSignup, type SignupErrors, type SignupField, type SignupInput } from '@/lib/auth/validation';
import { checkUsernameTakenAction, signupAction } from '../actions';
import { initialSignupState, type SignupState } from '../state';
import styles from '../auth.module.css';
import { AuthHeader, OrDivider } from './auth-parts';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';

const FIELDS: readonly SignupField[] = ['name', 'username', 'email', 'password', 'confirmPassword', 'terms'];
const isField = (name: string): name is SignupField => (FIELDS as readonly string[]).includes(name);

/** Lê os valores atuais do formulário no formato do cadastro. */
function readInput(form: HTMLFormElement): SignupInput {
  const data = new FormData(form);
  const text = (key: string) => {
    const value = data.get(key);
    return typeof value === 'string' ? value : '';
  };
  return {
    name: text('name'),
    username: text('username'),
    email: text('email'),
    password: text('password'),
    confirmPassword: text('confirmPassword'),
    acceptedTerms: data.get('terms') === 'on',
  };
}

/**
 * A pessoa mudou este campo desde a última resposta do servidor? Os textos voltam do servidor; as senhas
 * voltam vazias, então qualquer interação com elas conta como mudança.
 */
function changedSinceServer(field: SignupField, input: SignupInput, values: SignupState['values']): boolean {
  if (field === 'name' || field === 'username' || field === 'email') return input[field] !== values[field];
  if (field === 'terms') return input.acceptedTerms !== values.terms;
  return true;
}

interface Live {
  /** Resposta do servidor a que este estado ao vivo pertence; resposta nova zera tudo. */
  for: SignupState;
  /** Campos que a pessoa já visitou. */
  touched: SignupField[];
  errors: SignupErrors;
}

/**
 * Validação ao vivo: o erro de um campo aparece quando o cursor sai dele (`blur`) e some assim que a pessoa
 * corrige. As mesmas regras do servidor (`validateSignup`) rodam aqui; o servidor continua sendo quem decide.
 * "@usuário já em uso" é consultado no servidor ao sair do campo; "e-mail já tem conta" só no envio do cadastro.
 */
export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialSignupState);
  const [live, setLive] = useState<Live>({ for: state, touched: [], errors: {} });
  const [taken, setTaken] = useState<{ username: string; taken: boolean } | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const current: Live = live.for === state ? live : { for: state, touched: [], errors: {} };

  /** Erro a mostrar: o ao vivo, se o campo já foi visitado; senão o devolvido pelo servidor. */
  const errorOf = (field: SignupField): string | undefined =>
    current.touched.includes(field) ? current.errors[field] : state.errors[field];

  /** Recalcula os erros dos campos visitados (e de `add`) com os valores atuais do formulário. */
  const recompute = (add?: SignupField, takenNow: typeof taken = taken) => {
    if (!form.current) return;
    const input = readInput(form.current);
    const all = validateSignup(input);
    if (!all.username && takenNow?.taken && takenNow.username === input.username) {
      all.username = messages.signup.usernameTaken;
    }
    setLive((previous) => {
      const base = previous.for === state ? previous.touched : [];
      const touched = add && !base.includes(add) ? [...base, add] : base;
      const errors: SignupErrors = {};
      for (const field of touched) if (all[field]) errors[field] = all[field];
      return { for: state, touched, errors };
    });
  };

  const handleBlur = async (event: FocusEvent<HTMLFormElement>) => {
    // O campo e o botão de mostrar/ocultar senha são um bloco só: sair do botão é sair do campo.
    const target = event.target as HTMLElement;
    const control = target.closest('.nds-text-field__control');
    const element = (control?.querySelector('input') ?? target) as HTMLInputElement;
    if (!isField(element.name)) return;
    const field = element.name;
    // Ir do campo de senha para o botão dele (ou voltar) não é sair.
    const related = event.relatedTarget as Node | null;
    if (related && control?.contains(related)) return;

    const input = readInput(event.currentTarget);
    // Nada mudou desde a resposta do servidor: mantém o erro dele (por exemplo, "e-mail já tem conta").
    if (state.errors[field] && !current.touched.includes(field) && !changedSinceServer(field, input, state.values)) return;

    recompute(field);

    // @usuário com formato válido: pergunta ao servidor se já está em uso.
    if (field === 'username' && checkUsername(input.username) === null && taken?.username !== input.username) {
      const result = await checkUsernameTakenAction(input.username);
      // Só vale se a pessoa não mexeu no campo enquanto a consulta rodava.
      if (form.current && readInput(form.current).username === input.username) {
        const next = { username: input.username, taken: result };
        setTaken(next);
        recompute('username', next);
      }
    }
  };

  /** Ao digitar, o erro de um campo visitado some assim que a regra passa a ser cumprida. */
  const handleChange = (event: ChangeEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement as HTMLInputElement;
    if (!isField(target.name) || !form.current) return;
    const field = target.name;
    const input = readInput(form.current);
    // Corrigir um campo que veio com erro do servidor tira o erro na hora, sem esperar o cursor sair.
    const fixesServerError =
      Boolean(state.errors[field]) && !current.touched.includes(field) && changedSinceServer(field, input, state.values);
    if (fixesServerError) recompute(field);
    else if (current.touched.length > 0) recompute();
  };

  const { values } = state;

  return (
    <form
      ref={form}
      action={formAction}
      noValidate
      className={styles.form}
      aria-busy={pending}
      onBlur={handleBlur}
      onChange={handleChange}
    >
      <AuthHeader title="Criar conta" description="Cadastre-se para catalogar seus jogos e escrever sobre eles." />
      <GoogleButton>Cadastrar com Google</GoogleButton>
      <OrDivider />

      <TextField
        name="name"
        label="Nome completo"
        placeholder="Seu nome completo"
        autoComplete="name"
        defaultValue={values.name}
        error={errorOf('name')}
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
        error={errorOf('username')}
      />
      <TextField
        name="email"
        type="email"
        label="E-mail"
        placeholder="voce@email.com"
        autoComplete="email"
        defaultValue={values.email}
        error={errorOf('email')}
      />
      <PasswordField
        name="password"
        label="Senha"
        placeholder="Crie uma senha"
        autoComplete="new-password"
        helpText={messages.signup.passwordHint}
        error={errorOf('password')}
      />
      <PasswordField
        name="confirmPassword"
        label="Repetir senha"
        placeholder="Repita a senha"
        autoComplete="new-password"
        error={errorOf('confirmPassword')}
      />
      <Checkbox
        name="terms"
        defaultChecked={values.terms}
        error={errorOf('terms')}
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
