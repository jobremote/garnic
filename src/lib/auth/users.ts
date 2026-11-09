import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { users, type User } from '@/lib/db/schema';
import { dummyPasswordHash, hashPassword, verifyPassword } from './crypto';
import { messages } from './messages';
import { normalizeEmail, validateSignup, type SignupErrors, type SignupInput } from './validation';
import { issueCode } from './verification';

/** Conta não validada é excluída após 24 h. */
export const UNVERIFIED_TTL_MS = 24 * 60 * 60 * 1000;

/** A conta não validou o e-mail em 24 h (ela já pode ser excluída). */
export function isSignupExpired(user: Pick<User, 'emailVerifiedAt' | 'createdAt'>, now = new Date()): boolean {
  return !user.emailVerifiedAt && now.getTime() - user.createdAt.getTime() >= UNVERIFIED_TTL_MS;
}

/** Exclui as contas que não validaram o e-mail em 24 h (os códigos e sessões delas saem junto, por cascata). */
export async function purgeUnverifiedUsers(db: Db, now = new Date()): Promise<number> {
  const deleted = await db
    .delete(users)
    .where(and(isNull(users.emailVerifiedAt), lt(users.createdAt, new Date(now.getTime() - UNVERIFIED_TTL_MS))))
    .returning({ id: users.id });
  return deleted.length;
}

export type RegisterResult =
  | { ok: true; user: Pick<User, 'id' | 'name' | 'email'>; code: string; resendAvailableAt: Date }
  | { ok: false; errors: SignupErrors };

/** Cria a conta (ainda não validada) e o primeiro código. O envio do e-mail é feito por quem chama. */
export async function registerUser(db: Db, input: SignupInput, now = new Date()): Promise<RegisterResult> {
  const errors = validateSignup(input);
  const email = normalizeEmail(input.email);
  const username = input.username;

  // Contas vencidas liberam o e-mail e o @usuário antes de conferir se já estão em uso.
  await purgeUnverifiedUsers(db, now);

  const clashes = await db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)));
  if (!errors.username && clashes.some((row) => row.username === username)) errors.username = messages.signup.usernameTaken;
  if (!errors.email && clashes.some((row) => row.email === email)) errors.email = messages.signup.emailTaken;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const passwordHash = await hashPassword(input.password);
  let created: Pick<User, 'id' | 'name' | 'email'>;
  try {
    [created] = await db
      .insert(users)
      .values({ name: input.name.trim(), username, email, passwordHash, termsAcceptedAt: now, createdAt: now })
      .returning({ id: users.id, name: users.name, email: users.email });
  } catch (error) {
    // Duas pessoas cadastrando o mesmo dado ao mesmo tempo: o índice único decide.
    const text = String((error as { message?: string; cause?: { message?: string } })?.cause?.message ?? (error as Error).message);
    if (text.includes('users_email_key')) return { ok: false, errors: { email: messages.signup.emailTaken } };
    if (text.includes('users_username_key')) return { ok: false, errors: { username: messages.signup.usernameTaken } };
    throw error;
  }

  const issued = await issueCode(db, created.id, now);
  if (!issued.ok) throw new Error('Não foi possível gerar o primeiro código de validação.');
  return { ok: true, user: created, code: issued.code, resendAvailableAt: issued.resendAvailableAt };
}

/**
 * Confere e-mail e senha. Devolve `null` para qualquer falha (e-mail desconhecido, senha errada ou conta
 * ainda não validada), sempre gastando o mesmo tempo de cálculo.
 * Login de conta não validada fica fora da primeira versão (`00_gestao/pontos-em-aberto.md`).
 */
export async function authenticate(db: Db, emailInput: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(emailInput))).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !valid || !user.emailVerifiedAt) return null;
  return user;
}

export async function findUserById(db: Db, id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}
