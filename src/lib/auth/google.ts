import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { oauthAccounts, users, type User } from '@/lib/db/schema';
import { dummyPasswordHash, verifyPassword } from './crypto';
import { messages } from './messages';
import { isUsernameTaken } from './users';
import { normalizeEmail, normalizeName, NAME_MAX, usernameError } from './validation';

/** Entrar e cadastrar com Google (`01_produto/regras-de-negocio/cadastro.md`, seção "Como o Google funciona"). */
export const GOOGLE = 'google';

/** O que importa do Google: quem é (`sub`, fixo para sempre), o e-mail verificado e o nome. */
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

/**
 * Nome vindo do Google: só aparado, com espaços repetidos corrigidos e no máximo 100 caracteres. A regra de nome e
 * sobrenome do cadastro por e-mail não vale aqui (há nomes de uma palavra só). Sem nome, usa o começo do e-mail.
 */
export function cleanGoogleName(name: unknown, email: string): string {
  const cleaned = typeof name === 'string' ? normalizeName(name).slice(0, NAME_MAX).trim() : '';
  return cleaned || email.split('@')[0].slice(0, NAME_MAX);
}

/**
 * Confere os dados do Google (id token) e devolve o perfil, ou `null` se algo não bate: sem `sub` ou e-mail,
 * e-mail NÃO verificado pelo Google, emissor que não é o Google ou token feito para outro aplicativo.
 * `audience` é o ID do cliente OAuth; `null` só no Google simulado de desenvolvimento.
 */
export function profileFromClaims(claims: unknown, audience: string | null): GoogleProfile | null {
  if (!claims || typeof claims !== 'object') return null;
  const c = claims as Record<string, unknown>;
  if (typeof c.sub !== 'string' || c.sub === '' || typeof c.email !== 'string' || c.email === '') return null;
  if (c.email_verified !== true) return null;
  if (audience !== null) {
    if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') return null;
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(audience)) return null;
  }
  const email = normalizeEmail(c.email);
  return { sub: c.sub, email, name: cleanGoogleName(c.name, email) };
}

export type GoogleResolution =
  /** Esta conta do Google já foi vinculada: entra direto. */
  | { kind: 'login'; user: User }
  /** O e-mail é de uma conta existente e validada: pede a senha para vincular. */
  | { kind: 'link' }
  /** E-mail novo: escolhe o @usuário e aceita os termos. */
  | { kind: 'signup' };

/**
 * Decide o que fazer com quem voltou do Google. Se o e-mail pertence a uma conta que nunca validou o e-mail,
 * essa conta pendente é descartada: o Google prova que a pessoa é a dona do e-mail, quem criou a pendente não provou nada.
 */
export async function resolveGoogleSignIn(db: Db, profile: GoogleProfile): Promise<GoogleResolution> {
  const [linked] = await db
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(and(eq(oauthAccounts.provider, GOOGLE), eq(oauthAccounts.providerAccountId, profile.sub)))
    .limit(1);
  if (linked) return { kind: 'login', user: linked.user };

  const [byEmail] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (!byEmail) return { kind: 'signup' };
  if (byEmail.emailVerifiedAt) return { kind: 'link' };

  await db.delete(users).where(eq(users.id, byEmail.id)); // códigos e sessões saem junto, por cascata
  return { kind: 'signup' };
}

export type CompleteGoogleSignupResult =
  | { ok: true; user: User }
  | { ok: false; errors: { username?: string; terms?: string } }
  /** Nesse meio-tempo a situação mudou (a conta do Google foi vinculada ou o e-mail ganhou conta). */
  | { ok: false; reason: 'changed'; resolution: GoogleResolution };

/** Cria a conta de quem entrou com o Google: @usuário escolhido, termos aceitos, e-mail já validado, sem senha. */
export async function completeGoogleSignup(
  db: Db,
  profile: GoogleProfile,
  input: { username: string; acceptedTerms: boolean },
  now = new Date(),
): Promise<CompleteGoogleSignupResult> {
  const m = messages.signup;
  const errors: { username?: string; terms?: string } = {};
  const format = usernameError(input.username);
  if (format) errors.username = format;
  else if (await isUsernameTaken(db, input.username, now)) errors.username = m.usernameTaken;
  if (!input.acceptedTerms) errors.terms = m.termsRequired;
  if (errors.username || errors.terms) return { ok: false, errors };

  const resolution = await resolveGoogleSignIn(db, profile);
  if (resolution.kind !== 'signup') return { ok: false, reason: 'changed', resolution };

  let user: User;
  try {
    [user] = await db
      .insert(users)
      .values({
        name: profile.name,
        username: input.username,
        email: profile.email,
        passwordHash: null,
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        createdAt: now,
      })
      .returning();
  } catch (error) {
    // Duas pessoas pegando o mesmo @usuário ao mesmo tempo: o índice único decide.
    const text = String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error).message);
    if (text.includes('users_username_key')) return { ok: false, errors: { username: m.usernameTaken } };
    if (text.includes('users_email_key')) return { ok: false, reason: 'changed', resolution: { kind: 'link' } };
    throw error;
  }
  await db.insert(oauthAccounts).values({ userId: user.id, provider: GOOGLE, providerAccountId: profile.sub, createdAt: now });
  return { ok: true, user };
}

export type LinkGoogleResult = { ok: true; user: User } | { ok: false; reason: 'password' | 'not_linkable' };

/** Vincula o Google a uma conta existente e validada, depois de confirmar a senha da conta. */
export async function linkGoogleAccount(db: Db, profile: GoogleProfile, password: string, now = new Date()): Promise<LinkGoogleResult> {
  const [user] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (!user || !user.emailVerifiedAt) return { ok: false, reason: 'not_linkable' };

  // Sempre gasta o mesmo tempo de cálculo, tenha a conta senha ou não.
  const valid = await verifyPassword(password, user.passwordHash ?? (await dummyPasswordHash()));
  if (!valid || !user.passwordHash) return { ok: false, reason: 'password' };

  const [already] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, GOOGLE), eq(oauthAccounts.providerAccountId, profile.sub)))
    .limit(1);
  if (already && already.userId !== user.id) return { ok: false, reason: 'not_linkable' }; // já é de outra conta
  if (!already) {
    await db.insert(oauthAccounts).values({ userId: user.id, provider: GOOGLE, providerAccountId: profile.sub, createdAt: now });
  }
  return { ok: true, user };
}
