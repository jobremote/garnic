'use server';

import { redirect } from 'next/navigation';
import { clearPendingCookie, clearSessionCookie, readPendingUserId, readSessionToken, setPendingCookie, setSessionCookie } from '@/lib/auth/cookies';
import { messages } from '@/lib/auth/messages';
import { createSession, deleteSession } from '@/lib/auth/sessions';
import { authenticate, findUserById, isSignupExpired, isUsernameTaken, purgeUnverifiedUsers, registerUser } from '@/lib/auth/users';
import { checkUsername } from '@/lib/auth/validation';
import { issueCode, verifyCode } from '@/lib/auth/verification';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email/mailer';
import { verificationEmail } from '@/lib/email/templates';
import type { LoginState, SignupState, VerifyState } from './state';
import { buildVerifyState } from './verify-state';

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

/** Cadastro por e-mail: cria a conta, envia o código e leva para a tela de validação. */
export async function signupAction(_previous: SignupState, data: FormData): Promise<SignupState> {
  const input = {
    name: text(data, 'name'),
    username: text(data, 'username'),
    email: text(data, 'email'),
    password: text(data, 'password'),
    confirmPassword: text(data, 'confirmPassword'),
    acceptedTerms: data.get('terms') === 'on',
  };

  const db = await getDb();
  const result = await registerUser(db, input);
  if (!result.ok) {
    return {
      values: { name: input.name, username: input.username, email: input.email, terms: input.acceptedTerms },
      errors: result.errors,
    };
  }

  await sendEmail(db, verificationEmail({ name: result.user.name, email: result.user.email, code: result.code }));
  await setPendingCookie(result.user.id);
  redirect('/cadastrar/validar');
}

/**
 * O @usuário já está em uso? Chamada quando a pessoa sai do campo. O @usuário é público (os perfis são públicos),
 * então esta consulta é segura; já o e-mail só é conferido no envio do cadastro, para ninguém descobrir quem tem conta.
 */
export async function checkUsernameTakenAction(username: string): Promise<boolean> {
  if (typeof username !== 'string' || checkUsername(username) !== null) return false;
  return isUsernameTaken(await getDb(), username);
}

/** Login com e-mail e senha. Qualquer falha mostra a mesma mensagem, sem dizer qual dado errou. */
export async function loginAction(_previous: LoginState, data: FormData): Promise<LoginState> {
  const email = text(data, 'email');
  const password = text(data, 'password');

  const errors: LoginState['errors'] = {};
  if (email.trim() === '') errors.email = messages.login.emailRequired;
  if (password === '') errors.password = messages.login.passwordRequired;
  if (errors.email || errors.password) return { email, failed: false, errors };

  const db = await getDb();
  const user = await authenticate(db, email, password);
  if (!user) return { email, failed: true, errors: {} };

  const { token, expiresAt } = await createSession(db, user.id);
  await setSessionCookie(token, expiresAt);
  redirect('/');
}

/**
 * Tela de validação do e-mail. Os dois botões enviam o mesmo formulário: `intent=verify` confere o código,
 * `intent=resend` pede um código novo.
 */
export async function verifyAction(_previous: VerifyState, data: FormData): Promise<VerifyState> {
  const userId = await readPendingUserId();
  if (!userId) redirect('/cadastrar');

  const db = await getDb();
  const now = new Date();
  const user = await findUserById(db, userId);
  if (!user || isSignupExpired(user, now)) {
    await purgeUnverifiedUsers(db, now);
    await clearPendingCookie();
    redirect('/cadastro-expirado');
  }
  if (user.emailVerifiedAt) redirect('/entrar');

  if (text(data, 'intent') === 'resend') {
    const issued = await issueCode(db, user.id, now);
    if (issued.ok) {
      await sendEmail(db, verificationEmail({ name: user.name, email: user.email, code: issued.code }));
      return buildVerifyState(db, user.id, { sent: true }, now);
    }
    return buildVerifyState(db, user.id, {}, now);
  }

  const result = await verifyCode(db, user.id, text(data, 'code'), now);
  switch (result.status) {
    case 'ok': {
      const { token, expiresAt } = await createSession(db, user.id, now);
      await setSessionCookie(token, expiresAt);
      await clearPendingCookie();
      redirect('/cadastrar/validado');
    }
    case 'wrong':
      return buildVerifyState(db, user.id, { codeError: messages.verify.wrongCode(result.remaining) }, now);
    case 'incomplete':
      return buildVerifyState(db, user.id, { codeError: messages.verify.incomplete }, now);
    default:
      // `expired` e `invalidated`: o estado vindo do banco já descreve o que mostrar.
      return buildVerifyState(db, user.id, {}, now);
  }
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await deleteSession(await getDb(), token);
  await clearSessionCookie();
  redirect('/entrar');
}
