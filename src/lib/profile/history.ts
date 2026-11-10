import type { Db } from '@/lib/db/connect';
import { profileNameChanges } from '@/lib/db/schema';

/** Grava a linha inicial do histórico de nome e @usuário (`oldValue` nulo), logo depois de criar a conta. */
export async function recordInitialNames(
  db: Db,
  user: { id: string; name: string; username: string },
  now: Date,
): Promise<void> {
  await db.insert(profileNameChanges).values([
    { userId: user.id, field: 'name', oldValue: null, newValue: user.name, changedAt: now },
    { userId: user.id, field: 'username', oldValue: null, newValue: user.username, changedAt: now },
  ]);
}
