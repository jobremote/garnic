'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { toCommentView, type CommentView } from '@/lib/feed/comment-view';
import { addComment, COMMENTS_PAGE_SIZE, deleteComment, editComment, listComments, setCommentHidden, setCommentLike, setPostLike, type CommentErrorCode } from '@/lib/feed/comments';
import { decodeCursor } from '@/lib/feed/posts';

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return user;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
/** Teto de comentários de 1º nível que uma recarga devolve (a tela recarrega o que já estava aberta). */
const RELOAD_MAX = 200;

/** Atualiza as telas que mostram posts, contadores e comentários. */
function refresh() {
  revalidatePath('/');
  revalidatePath('/post/[id]', 'page');
  revalidatePath('/perfil/[username]', 'page');
}

export type LikeActionResult = { ok: true; liked: boolean; count: number } | { ok: false };

/** Curte ou descurta um post ou um comentário. Idempotente; devolve o estado e o contador atuais. */
export async function setLikeAction(target: unknown, id: unknown, like: unknown): Promise<LikeActionResult> {
  const user = await requireUser();
  if ((target !== 'post' && target !== 'comment') || !isId(id) || typeof like !== 'boolean') return { ok: false };
  const db = await getDb();
  const result = target === 'post' ? await setPostLike(db, user.id, id, like) : await setCommentLike(db, user.id, id, like);
  if (!result.ok) return { ok: false };
  refresh();
  return { ok: true, liked: result.liked, count: result.count };
}

export type CommentActionError = CommentErrorCode | 'not-found' | 'invalid';
export type CommentActionResult = { ok: true } | { ok: false; error: CommentActionError };

/** Comenta em um post, ou responde a um comentário de 1º nível (`parentId`). */
export async function createCommentAction(postId: unknown, body: unknown, parentId?: unknown): Promise<CommentActionResult> {
  const user = await requireUser();
  if (!isId(postId) || typeof body !== 'string' || body.length > 10_000) return { ok: false, error: 'invalid' };
  if (parentId !== undefined && parentId !== null && !isId(parentId)) return { ok: false, error: 'invalid' };
  const result = await addComment(await getDb(), user.id, postId, { body, parentId: parentId ?? null });
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

/** Edita o próprio comentário. */
export async function editCommentAction(commentId: unknown, body: unknown): Promise<CommentActionResult> {
  const user = await requireUser();
  if (!isId(commentId) || typeof body !== 'string' || body.length > 10_000) return { ok: false, error: 'invalid' };
  const result = await editComment(await getDb(), user.id, commentId, body);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

/** Exclui o próprio comentário (com respostas, fica "Comentário excluído"). */
export async function deleteCommentAction(commentId: unknown): Promise<CommentActionResult> {
  const user = await requireUser();
  if (!isId(commentId)) return { ok: false, error: 'invalid' };
  const result = await deleteComment(await getDb(), user.id, commentId);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

/** O dono do post oculta ou mostra de novo um comentário do post dele. */
export async function hideCommentAction(commentId: unknown, hidden: unknown): Promise<CommentActionResult> {
  const user = await requireUser();
  if (!isId(commentId) || typeof hidden !== 'boolean') return { ok: false, error: 'invalid' };
  const result = await setCommentHidden(await getDb(), user.id, commentId, hidden);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

export type LoadCommentsResult = { ok: true; comments: CommentView[]; next: string | null } | { ok: false };

/**
 * Comentários de um post. Sem `cursor`, começa do início (e `limit` recarrega tudo o que já estava na tela depois de
 * uma mudança); com `cursor`, é a página seguinte.
 */
export async function loadCommentsAction(postId: unknown, cursor?: unknown, limit?: unknown): Promise<LoadCommentsResult> {
  const viewer = await requireUser();
  if (!isId(postId)) return { ok: false };
  const after = cursor === undefined || cursor === null ? null : decodeCursor(cursor);
  if (cursor !== undefined && cursor !== null && !after) return { ok: false };
  const size = typeof limit === 'number' && Number.isInteger(limit) ? Math.min(Math.max(limit, COMMENTS_PAGE_SIZE), RELOAD_MAX) : COMMENTS_PAGE_SIZE;
  const page = await listComments(await getDb(), postId, viewer.id, { after, limit: size });
  if (!page.postOwnerId) return { ok: false };
  const now = new Date();
  const ownerId = page.postOwnerId;
  return { ok: true, comments: page.comments.map((node) => toCommentView(node, viewer.id, ownerId, now)), next: page.next };
}
