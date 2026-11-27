import { eq, isNotNull, and } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { posts, shelfActivities, shelfEntries, users } from '@/lib/db/schema';

/**
 * Exclui a conta e tudo o que é dela (decisão de 27/11/2026; política de privacidade, "Seus direitos"). O banco apaga em
 * cascata perfil, sessões, Game Shelf, tags, atividades, posts, comentários (e as respostas a eles), curtidas, quem a
 * pessoa segue e quem a segue, denúncias feitas e recebidas e o histórico de nomes. Devolve as imagens que precisam
 * sair do armazenamento (quem chama apaga), ou `null` se a conta não existe.
 */
export async function deleteAccount(db: Db, userId: string): Promise<{ imageRefs: string[] } | null> {
  const [user] = await db.select({ avatarKey: users.avatarKey, coverKey: users.coverKey }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [screenshots, postImages, activityImages] = await Promise.all([
    db.select({ ref: shelfEntries.screenshotRef }).from(shelfEntries).where(and(eq(shelfEntries.userId, userId), isNotNull(shelfEntries.screenshotRef))),
    db.select({ ref: posts.imageRef }).from(posts).where(and(eq(posts.userId, userId), isNotNull(posts.imageRef))),
    db.select({ ref: shelfActivities.screenshotRef }).from(shelfActivities).where(and(eq(shelfActivities.userId, userId), isNotNull(shelfActivities.screenshotRef))),
  ]);
  await db.delete(users).where(eq(users.id, userId));
  const refs = [user.avatarKey, user.coverKey, ...screenshots.map((row) => row.ref), ...postImages.map((row) => row.ref), ...activityImages.map((row) => row.ref)];
  return { imageRefs: [...new Set(refs.filter((ref): ref is string => typeof ref === 'string' && ref !== ''))] };
}
