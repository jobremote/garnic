import { NextResponse, type NextRequest } from 'next/server';
import { setOAuthFlow } from '@/lib/auth/cookies';
import { generateCodeVerifier, generateState, googleConfigured, googleSimulatorEnabled, startGoogleSignIn } from '@/lib/auth/google-oauth';

/** Começa o login ou cadastro com Google: guarda `state` e `code_verifier` e manda a pessoa para o Google. */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  if (googleConfigured()) {
    const { url, state, verifier } = startGoogleSignIn();
    await setOAuthFlow(state, verifier);
    return NextResponse.redirect(url);
  }
  if (googleSimulatorEnabled()) {
    // Sem credenciais, em desenvolvimento: uma tela local faz o papel do Google (ver `/dev/google`).
    const state = generateState();
    await setOAuthFlow(state, generateCodeVerifier());
    return to(`/dev/google?state=${encodeURIComponent(state)}`);
  }
  // Produção sem credenciais: não há como entrar com o Google.
  return to('/entrar/erro-google');
}
