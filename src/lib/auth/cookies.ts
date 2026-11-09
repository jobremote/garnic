import 'server-only';
import { cookies } from 'next/headers';
import { sign, unsign } from './crypto';

const SESSION_COOKIE = 'garnic_session';
/** Guarda quem está no meio da validação do e-mail (assinado, para não dar para trocar o usuário). */
const PENDING_COOKIE = 'garnic_pending';
const PENDING_MAX_AGE_SECONDS = 24 * 60 * 60;

const base = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' });

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { ...base(), expires: expiresAt });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setPendingCookie(userId: string) {
  (await cookies()).set(PENDING_COOKIE, sign(userId), { ...base(), maxAge: PENDING_MAX_AGE_SECONDS });
}

/** Usuário que está validando o e-mail, ou `undefined` se não há cadastro em andamento. */
export async function readPendingUserId(): Promise<string | undefined> {
  const value = (await cookies()).get(PENDING_COOKIE)?.value;
  return (value && unsign(value)) || undefined;
}

export async function clearPendingCookie() {
  (await cookies()).delete(PENDING_COOKIE);
}
