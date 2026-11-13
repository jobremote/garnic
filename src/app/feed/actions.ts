'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { followUser, unfollowUser } from '@/lib/feed/follows';
import { createPost, decodeCursor, deletePost, filterFor, listPosts, updatePost, type FeedScope, type GameChange, type PostErrorCode } from '@/lib/feed/posts';
import { toPostView, type PostView } from '@/lib/feed/view';
import { getIgdbClient, IgdbError, type IgdbGame } from '@/lib/igdb/igdb';
import { isAcceptableImageRef } from '@/lib/profile/images';
import { deleteImage, verifyStoredImage } from '@/lib/storage';

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return user;
}

/** Atualiza as telas que mostram posts e contadores. */
function refresh() {
  revalidatePath('/');
  revalidatePath('/perfil/[username]', 'page');
}

export type PostActionError = PostErrorCode | 'invalid-image' | 'game-not-found' | 'game-unavailable' | 'not-found' | 'invalid';
export type PostActionResult = { ok: true } | { ok: false; error: PostActionError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Draft {
  body: string;
  spoiler: boolean;
  imageRef: string | null | undefined;
  /** `undefined`: mantém (só na edição); `null`: sem jogo; número: id do IGDB. */
  igdbId: number | null | undefined;
}

/** Lê o que veio do navegador sem confiar em nada: tipos, tamanho e referência da imagem (só a pasta da própria pessoa). */
function parseDraft(input: unknown, allowKeep: boolean): Draft | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.body !== 'string' || raw.body.length > 10_000) return null;
  let imageRef: string | null | undefined;
  if (raw.imageRef === undefined && allowKeep) imageRef = undefined;
  else if (raw.imageRef === null || raw.imageRef === undefined) imageRef = null;
  else if (typeof raw.imageRef === 'string') imageRef = raw.imageRef;
  else return null;
  let igdbId: number | null | undefined;
  if (raw.igdbId === undefined && allowKeep) igdbId = undefined;
  else if (raw.igdbId === null || raw.igdbId === undefined) igdbId = null;
  else if (typeof raw.igdbId === 'number' && Number.isSafeInteger(raw.igdbId)) igdbId = raw.igdbId;
  else return null;
  return { body: raw.body, spoiler: raw.spoiler === true, imageRef, igdbId };
}

/** Imagem nova: tem que ser da pasta da própria pessoa e ser mesmo uma imagem (formato e peso conferidos no armazenamento). */
async function imageIsValid(userId: string, ref: string): Promise<boolean> {
  if (!isAcceptableImageRef('post', userId, ref)) return false;
  if (await verifyStoredImage('post', ref)) return true;
  await deleteImage(ref);
  return false;
}

async function findGame(igdbId: number): Promise<{ ok: true; game: IgdbGame } | { ok: false; error: 'game-not-found' | 'game-unavailable' }> {
  try {
    const game = await getIgdbClient().getGame(igdbId);
    return game ? { ok: true, game } : { ok: false, error: 'game-not-found' };
  } catch (error) {
    if (!(error instanceof IgdbError)) console.error('IGDB:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'game-unavailable' };
  }
}

/** Publica um post: texto ou imagem (obrigatório), 1 jogo marcado (opcional, qualquer jogo do IGDB) e spoiler. */
export async function createPostAction(input: unknown): Promise<PostActionResult> {
  const user = await requireUser();
  const draft = parseDraft(input, false);
  if (!draft) return { ok: false, error: 'invalid' };
  const imageRef = draft.imageRef ?? null;
  if (imageRef !== null && !(await imageIsValid(user.id, imageRef))) return { ok: false, error: 'invalid-image' };

  let game: IgdbGame | null = null;
  if (draft.igdbId !== null && draft.igdbId !== undefined) {
    const found = await findGame(draft.igdbId);
    if (!found.ok) {
      await deleteImage(imageRef);
      return found;
    }
    game = found.game;
  }
  const result = await createPost(await getDb(), user.id, { body: draft.body, imageRef, spoiler: draft.spoiler, game });
  if (!result.ok) {
    await deleteImage(imageRef);
    return result;
  }
  refresh();
  return { ok: true };
}

/** Edita o próprio post (com o indicador "editado" quando algo muda). Só quem postou edita. */
export async function updatePostAction(postId: unknown, input: unknown): Promise<PostActionResult> {
  const user = await requireUser();
  const draft = parseDraft(input, true);
  if (typeof postId !== 'string' || !UUID.test(postId) || !draft) return { ok: false, error: 'invalid' };
  if (typeof draft.imageRef === 'string' && !(await imageIsValid(user.id, draft.imageRef))) return { ok: false, error: 'invalid-image' };

  let game: GameChange = { kind: 'keep' };
  if (draft.igdbId === null) game = { kind: 'none' };
  else if (typeof draft.igdbId === 'number') {
    const found = await findGame(draft.igdbId);
    if (!found.ok) {
      if (typeof draft.imageRef === 'string') await deleteImage(draft.imageRef);
      return found;
    }
    game = { kind: 'set', game: found.game };
  }
  const result = await updatePost(await getDb(), user.id, postId, { body: draft.body, imageRef: draft.imageRef, spoiler: draft.spoiler, game });
  if (!result.ok) {
    if (typeof draft.imageRef === 'string') await deleteImage(draft.imageRef);
    return result;
  }
  await deleteImage(result.replacedImageRef);
  refresh();
  return { ok: true };
}

/** Exclui o próprio post e a imagem dele. */
export async function deletePostAction(postId: unknown): Promise<PostActionResult> {
  const user = await requireUser();
  if (typeof postId !== 'string' || !UUID.test(postId)) return { ok: false, error: 'invalid' };
  const result = await deletePost(await getDb(), user.id, postId);
  if (!result.ok) return result;
  await deleteImage(result.imageRef);
  refresh();
  return { ok: true };
}

/** Segue ou deixa de seguir. Idempotente: pedir duas vezes o mesmo não dá erro. */
export async function followAction(userId: unknown, follow: unknown): Promise<{ ok: boolean }> {
  const viewer = await requireUser();
  if (typeof userId !== 'string' || !UUID.test(userId) || typeof follow !== 'boolean') return { ok: false };
  const db = await getDb();
  const result = follow ? await followUser(db, viewer.id, userId) : await unfollowUser(db, viewer.id, userId);
  if (!result.ok) return { ok: false };
  refresh();
  return { ok: true };
}

export type LoadMoreResult = { ok: true; posts: PostView[]; next: string | null } | { ok: false };

/** Próxima página de posts, a partir do cursor da página anterior. */
export async function loadMorePostsAction(scope: unknown, cursor: unknown): Promise<LoadMoreResult> {
  const viewer = await requireUser();
  const before = decodeCursor(cursor);
  if (!before || typeof scope !== 'object' || scope === null) return { ok: false };
  const kind = (scope as { kind?: unknown }).kind;
  let parsed: FeedScope;
  if (kind === 'following' || kind === 'my-games' || kind === 'all') parsed = { kind };
  else if (kind === 'user' && typeof (scope as { userId?: unknown }).userId === 'string' && UUID.test((scope as { userId: string }).userId)) parsed = { kind: 'user', userId: (scope as { userId: string }).userId };
  else return { ok: false };
  const page = await listPosts(await getDb(), filterFor(parsed, viewer.id), { before });
  const now = new Date();
  return { ok: true, posts: page.posts.map((post) => toPostView(post, viewer.id, now)), next: page.next };
}
