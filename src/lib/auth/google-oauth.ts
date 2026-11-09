import 'server-only';
import { decodeIdToken, generateCodeVerifier, generateState, Google } from 'arctic';
import { appUrl } from './app-url';
import { profileFromClaims, type GoogleProfile } from './google';

/**
 * Login com Google (OAuth 2.0 com PKCE, pela biblioteca Arctic).
 * Credenciais: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Endereço de retorno a cadastrar no Google Cloud:
 * `{APP_URL}/api/auth/google/callback`.
 */
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Google simulado: só existe fora de produção e enquanto não há credenciais. Mostra uma tela local (`/dev/google`)
 * no lugar do Google, para testar o fluxo inteiro sem conta no Google Cloud. Nunca roda em produção.
 */
export const googleSimulatorEnabled = () => process.env.NODE_ENV !== 'production' && !googleConfigured();

const redirectUri = () => `${appUrl()}/api/auth/google/callback`;

function client() {
  return new Google(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, redirectUri());
}

/** Começa o fluxo: devolve o endereço do Google e o `state` e o `code_verifier` que ficam guardados nos cookies. */
export function startGoogleSignIn(): { url: URL; state: string; verifier: string } {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = client().createAuthorizationURL(state, verifier, ['openid', 'profile', 'email']);
  return { url, state, verifier };
}

/**
 * Troca o `code` pelo id token e confere os dados (e-mail verificado, emissor e aplicativo certos).
 * O id token chega direto do endereço do Google, por HTTPS, então não precisa conferir assinatura.
 */
export async function profileFromAuthorizationCode(code: string, verifier: string): Promise<GoogleProfile | null> {
  try {
    const tokens = await client().validateAuthorizationCode(code, verifier);
    return profileFromClaims(decodeIdToken(tokens.idToken()), process.env.GOOGLE_CLIENT_ID!);
  } catch (error) {
    console.error('Falha na troca do código do Google:', error instanceof Error ? error.message : error);
    return null;
  }
}

export { generateState, generateCodeVerifier };
