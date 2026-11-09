import { and, eq, gt, isNotNull } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { sessions, users, type User } from '@/lib/db/schema';
import { hashSessionToken, newSessionToken } from './crypto';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Cria a sessão e devolve o token que vai no cookie. No banco fica só o hash dele. */
export async function createSession(db: Db, userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/** Usuário da sessão, ou `null` se o token não existe, venceu ou a conta não validou o e-mail. */
export async function getSessionUser(db: Db, token: string, now = new Date()): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashSessionToken(token)), gt(sessions.expiresAt, now), isNotNull(users.emailVerifiedAt)))
    .limit(1);
  return row?.user ?? null;
}

/** Encerra todos os logins do usuário (por exemplo, depois de trocar a senha). */
export async function deleteUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}
