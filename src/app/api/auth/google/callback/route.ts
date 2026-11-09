import { NextResponse, type NextRequest } from 'next/server';
import { setGooglePending, setSessionCookie, takeOAuthFlow } from '@/lib/auth/cookies';
import { profileFromClaims, resolveGoogleSignIn, type GoogleProfile } from '@/lib/auth/google';
import { googleConfigured, googleSimulatorEnabled, profileFromAuthorizationCode } from '@/lib/auth/google-oauth';
import { createSession } from '@/lib/auth/sessions';
import { getDb } from '@/lib/db';

/**
 * Volta do Google. Confere o `state`, troca o código pelos dados da pessoa e decide:
 * conta já vinculada entra direto; e-mail novo vai escolher o @usuário; e-mail de conta existente vai vincular com senha.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  const params = request.nextUrl.searchParams;
  const flow = await takeOAuthFlow(); // cada `state` serve uma vez só

  // Quem cancelou na tela do Google só volta para o login.
  if (params.get('error') === 'access_denied') return to('/entrar');

  const state = params.get('state');
  if (!flow.state || !state || state !== flow.state) return to('/entrar/erro-google');

  let profile: GoogleProfile | null = null;
  if (googleConfigured()) {
    const code = params.get('code');
    profile = code && flow.verifier ? await profileFromAuthorizationCode(code, flow.verifier) : null;
  } else if (googleSimulatorEnabled() && params.get('sim') === '1') {
    profile = profileFromClaims(
      { sub: params.get('sub'), email: params.get('email'), email_verified: params.get('email_verified') === 'on', name: params.get('name') },
      null,
    );
  }
  if (!profile) return to('/entrar/erro-google');

  const db = await getDb();
  const resolution = await resolveGoogleSignIn(db, profile);
  if (resolution.kind === 'login') {
    const { token, expiresAt } = await createSession(db, resolution.user.id);
    await setSessionCookie(token, expiresAt);
    return to('/');
  }
  await setGooglePending(profile);
  return to(resolution.kind === 'link' ? '/entrar/vincular-google' : '/cadastrar/google');
}
