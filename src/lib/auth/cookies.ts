import 'server-only';
import { cookies } from 'next/headers';
import { sign, unsign } from './crypto';
import type { GoogleProfile } from './google';

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

/** Entre o retorno do Google e a escolha do @usuário (ou a senha de vínculo): perfil assinado, vale 10 minutos. */
const GOOGLE_PENDING_COOKIE = 'garnic_google';
const GOOGLE_PENDING_MAX_AGE_SECONDS = 10 * 60;

export async function setGooglePending(profile: GoogleProfile) {
  const payload = Buffer.from(JSON.stringify({ ...profile, exp: Date.now() + GOOGLE_PENDING_MAX_AGE_SECONDS * 1000 })).toString('base64url');
  (await cookies()).set(GOOGLE_PENDING_COOKIE, sign(payload), { ...base(), maxAge: GOOGLE_PENDING_MAX_AGE_SECONDS });
}

/** Perfil do Google que está esperando a conclusão, ou `undefined` se não há, está adulterado ou venceu. */
export async function readGooglePending(): Promise<GoogleProfile | undefined> {
  const value = (await cookies()).get(GOOGLE_PENDING_COOKIE)?.value;
  const payload = value && unsign(value);
  if (!payload) return undefined;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return undefined;
    if (typeof data.sub !== 'string' || typeof data.email !== 'string' || typeof data.name !== 'string') return undefined;
    return { sub: data.sub, email: data.email, name: data.name };
  } catch {
    return undefined;
  }
}

export async function clearGooglePending() {
  (await cookies()).delete(GOOGLE_PENDING_COOKIE);
}

/** `state` e `code_verifier` (PKCE) do OAuth: só valem na rota de retorno do Google, por 10 minutos. */
const OAUTH_STATE_COOKIE = 'garnic_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'garnic_oauth_verifier';

export async function setOAuthFlow(state: string, verifier: string) {
  const store = await cookies();
  const options = { ...base(), path: '/api/auth/google', maxAge: 10 * 60 };
  store.set(OAUTH_STATE_COOKIE, state, options);
  store.set(OAUTH_VERIFIER_COOKIE, verifier, options);
}

/** Lê e apaga o fluxo em andamento (cada `state` serve uma vez só). */
export async function takeOAuthFlow(): Promise<{ state?: string; verifier?: string }> {
  const store = await cookies();
  const flow = { state: store.get(OAUTH_STATE_COOKIE)?.value, verifier: store.get(OAUTH_VERIFIER_COOKIE)?.value };
  store.delete({ name: OAUTH_STATE_COOKIE, path: '/api/auth/google' });
  store.delete({ name: OAUTH_VERIFIER_COOKIE, path: '/api/auth/google' });
  return flow;
}
