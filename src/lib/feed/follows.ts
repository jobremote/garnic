import { and, count, desc, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { follows, users } from '@/lib/db/schema';

/** Seguir e deixar de seguir (`01_produto/regras-de-negocio/feed.md`). Perfil sempre público: seguir não exige aprovação. */

export type FollowResult = { ok: true; changed: boolean } | { ok: false; error: 'self' | 'not-found' };

/** Segue uma pessoa. Seguir de novo não duplica (`changed: false`). Não dá para seguir a si mesmo nem uma conta não validada. */
export async function followUser(db: Db, followerId: string, followeeId: string): Promise<FollowResult> {
  if (followerId === followeeId) return { ok: false, error: 'self' };
  const [target] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, followeeId), isNotNull(users.emailVerifiedAt))).limit(1);
  if (!target) return { ok: false, error: 'not-found' };
  const created = await db.insert(follows).values({ followerId, followeeId }).onConflictDoNothing().returning({ id: follows.followeeId });
  return { ok: true, changed: created.length > 0 };
}

/** Deixa de seguir. Se já não seguia, não faz nada (`changed: false`). */
export async function unfollowUser(db: Db, followerId: string, followeeId: string): Promise<{ ok: true; changed: boolean }> {
  const removed = await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .returning({ id: follows.followeeId });
  return { ok: true, changed: removed.length > 0 };
}

export async function isFollowing(db: Db, followerId: string, followeeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .limit(1);
  return Boolean(row);
}

export interface FollowCounters {
  followers: number;
  following: number;
}

/** Seguidores (quem segue a pessoa) e Seguindo (quem a pessoa segue). */
export async function followCounters(db: Db, userId: string): Promise<FollowCounters> {
  const [followers] = await db.select({ total: count() }).from(follows).where(eq(follows.followeeId, userId));
  const [following] = await db.select({ total: count() }).from(follows).where(eq(follows.followerId, userId));
  return { followers: Number(followers?.total ?? 0), following: Number(following?.total ?? 0) };
}

export interface SuggestedUser {
  id: string;
  name: string;
  username: string;
  avatarKey: string | null;
}

/**
 * "Quem seguir": contas validadas que a pessoa ainda não segue, das mais novas para as mais antigas. Sem algoritmo de
 * recomendação no MVP.
 */
export async function suggestedUsers(db: Db, viewerId: string, limit = 5): Promise<SuggestedUser[]> {
  const followed = db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, viewerId));
  return db
    .select({ id: users.id, name: users.name, username: users.username, avatarKey: users.avatarKey })
    .from(users)
    .where(and(isNotNull(users.emailVerifiedAt), sql`${users.id} <> ${viewerId}`, notInArray(users.id, followed)))
    .orderBy(desc(users.createdAt))
    .limit(limit);
}
