import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { comments, follows, posts, sessions, shelfEntries, users } from '@/lib/db/schema';
import { createSession } from '@/lib/auth/sessions';
import { addComment } from '@/lib/feed/comments';
import { createPost } from '@/lib/feed/posts';
import { addToShelf } from '@/lib/shelf/shelf';
import { createTestDb, validSignup } from '@/test/db';
import { deleteAccount } from './delete-account';

const T0 = new Date('2026-11-27T12:00:00.000Z');

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `excl${counter}`, email: `excl${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

describe('excluir a conta', () => {
  it('apaga a conta e tudo o que é dela, devolve as imagens e não mexe nas outras contas', async () => {
    const [me, other] = [await account(), await account()];
    await db.update(users).set({ avatarKey: `avatars/${me}.jpg`, coverKey: `covers/${me}.jpg` }).where(eq(users.id, me));
    const game = { igdbId: 77, name: 'Jogo 77', slug: 'jogo-77', coverImageId: null, releasedAt: null, platforms: ['PC'] };
    const entry = await addToShelf(db, me, game, 'zerado', T0);
    if (!entry.ok) throw new Error('add');
    await db.update(shelfEntries).set({ screenshotRef: `screenshots/${me}.png` }).where(eq(shelfEntries.id, entry.entryId));
    const mine = await createPost(db, me, { body: 'Meu post', imageRef: `posts/${me}.png` }, T0);
    const theirs = await createPost(db, other, { body: 'Post da outra pessoa' }, T0);
    if (!mine.ok || !theirs.ok) throw new Error('post');
    await addComment(db, me, theirs.postId, { body: 'Meu comentário' }, T0);
    await db.insert(follows).values({ followerId: me, followeeId: other });
    await createSession(db, me, T0);

    const result = await deleteAccount(db, me);
    expect(result?.imageRefs.sort()).toEqual([`avatars/${me}.jpg`, `covers/${me}.jpg`, `posts/${me}.png`, `screenshots/${me}.png`].sort());
    expect(await db.select().from(users).where(eq(users.id, me))).toHaveLength(0);
    expect(await db.select().from(shelfEntries).where(eq(shelfEntries.userId, me))).toHaveLength(0);
    expect(await db.select().from(posts).where(eq(posts.userId, me))).toHaveLength(0);
    expect(await db.select().from(comments).where(eq(comments.userId, me))).toHaveLength(0);
    expect(await db.select().from(follows).where(eq(follows.followerId, me))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, me))).toHaveLength(0);
    // A outra conta e o post dela continuam.
    expect(await db.select().from(posts).where(eq(posts.id, theirs.postId))).toHaveLength(1);
  });

  it('conta que não existe devolve nulo', async () => {
    expect(await deleteAccount(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
