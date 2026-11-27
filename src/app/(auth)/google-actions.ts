'use server';

import { redirect } from 'next/navigation';
import { clearGooglePending, readGooglePending, setSessionCookie } from '@/lib/auth/cookies';
import { completeGoogleSignup, linkGoogleAccount } from '@/lib/auth/google';
import { createSession } from '@/lib/auth/sessions';
import { getDb } from '@/lib/db';
import type { GoogleSignupState, LinkGoogleState } from './state';

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

/** Abre a sessão, apaga o perfil pendente do Google e vai para o início. */
async function signIn(userId: string): Promise<never> {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  await setSessionCookie(token, expiresAt);
  await clearGooglePending();
  redirect('/');
}

/** Cria a conta de quem entrou com o Google: escolhe o @usuário e aceita os termos. */
export async function completeGoogleSignupAction(_previous: GoogleSignupState, data: FormData): Promise<GoogleSignupState> {
  const profile = await readGooglePending();
  if (!profile) redirect('/entrar/erro-google'); // passou dos 10 minutos ou não veio do Google

  const username = text(data, 'username');
  const birthDate = text(data, 'birthDate');
  const terms = data.get('terms') === 'on';
  const result = await completeGoogleSignup(await getDb(), profile, { username, acceptedTerms: terms, birthDate });

  if (result.ok) return signIn(result.user.id);
  if ('underAge' in result) {
    // Menos de 16 anos: nada foi gravado, e o perfil do Google em espera é descartado.
    await clearGooglePending();
    redirect('/cadastrar/idade-minima');
  }
  if ('errors' in result) return { username, birthDate, terms, errors: result.errors };
  // A situação mudou no meio do caminho (outra aba concluiu, ou o e-mail ganhou conta).
  if (result.resolution.kind === 'login') return signIn(result.resolution.user.id);
  redirect(result.resolution.kind === 'link' ? '/entrar/vincular-google' : '/entrar/erro-google');
}

/** Vincula o Google a uma conta existente, confirmando a senha da conta. */
export async function linkGoogleAction(_previous: LinkGoogleState, data: FormData): Promise<LinkGoogleState> {
  const profile = await readGooglePending();
  if (!profile) redirect('/entrar/erro-google');

  const result = await linkGoogleAccount(await getDb(), profile, text(data, 'password'));
  if (result.ok) return signIn(result.user.id);
  if (result.reason === 'not_linkable') redirect('/entrar/erro-google');
  return { failed: true };
}
