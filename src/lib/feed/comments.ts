import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { commentLikes, comments, postLikes, posts, users } from '@/lib/db/schema';
import { encodeCursor, type Cursor } from './posts';

/** Regras de comentários e curtidas (`01_produto/regras-de-negocio/feed.md`, entrega 2, 17/11/2026). */
export const COMMENT_MAX = 500;
/** Quantos comentários de 1º nível vêm por vez (o resto carrega em "Ver mais"; provisório). */
export const COMMENTS_PAGE_SIZE = 20;

export type CommentErrorCode = 'empty' | 'too-long';

/** Texto do comentário: quebras de linha preservadas (\r\n vira \n), pontas aparadas. */
export const normalizeCommentBody = (value: unknown): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '');

export function validateComment(body: string): CommentErrorCode | null {
  if (body === '') return 'empty';
  if (body.length > COMMENT_MAX) return 'too-long';
  return null;
}

export type AddCommentResult = { ok: true; commentId: string } | { ok: false; error: CommentErrorCode | 'not-found' };

/**
 * Comenta em um post. `parentId` responde a um comentário de 1º nível (1 nível só: não dá para responder a uma
 * resposta, nem a um comentário excluído ou oculto).
 */
export async function addComment(db: Db, userId: string, postId: string, input: { body: unknown; parentId?: string | null }, now = new Date()): Promise<AddCommentResult> {
  const body = normalizeCommentBody(input.body);
  const error = validateComment(body);
  if (error) return { ok: false, error };
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return { ok: false, error: 'not-found' };
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const [parent] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.id, parentId), eq(comments.postId, postId), isNull(comments.parentId), isNull(comments.deletedAt), isNull(comments.hiddenAt)))
      .limit(1);
    if (!parent) return { ok: false, error: 'not-found' };
  }
  const [row] = await db.insert(comments).values({ postId, userId, parentId, body, createdAt: now }).returning({ id: comments.id });
  return { ok: true, commentId: row.id };
}

export type EditCommentResult = { ok: true; edited: boolean } | { ok: false; error: CommentErrorCode | 'not-found' };

/** Edita o próprio comentário. "Editado" só aparece se o texto mudou de fato. */
export async function editComment(db: Db, userId: string, commentId: string, bodyInput: unknown, now = new Date()): Promise<EditCommentResult> {
  const [current] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId), isNull(comments.deletedAt)))
    .limit(1);
  if (!current) return { ok: false, error: 'not-found' };
  const body = normalizeCommentBody(bodyInput);
  const error = validateComment(body);
  if (error) return { ok: false, error };
  if (body === current.body) return { ok: true, edited: false };
  await db.update(comments).set({ body, editedAt: now }).where(eq(comments.id, current.id));
  return { ok: true, edited: true };
}

/**
 * Exclui o próprio comentário. Com respostas, fica o registro "Comentário excluído" (sem texto) e as respostas
 * continuam; sem respostas, some de vez. Se era a última resposta de um comentário já excluído, ele some também.
 */
export async function deleteComment(db: Db, userId: string, commentId: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: 'not-found' }> {
  const [current] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.userId, userId), isNull(comments.deletedAt)))
    .limit(1);
  if (!current) return { ok: false, error: 'not-found' };
  const [replies] = await db.select({ total: sql<number>`count(*)::int` }).from(comments).where(eq(comments.parentId, current.id));
  if ((replies?.total ?? 0) > 0) {
    await db.update(comments).set({ body: '', deletedAt: now, hiddenAt: null }).where(eq(comments.id, current.id));
    return { ok: true };
  }
  await db.delete(comments).where(eq(comments.id, current.id));
  if (current.parentId) {
    const [siblings] = await db.select({ total: sql<number>`count(*)::int` }).from(comments).where(eq(comments.parentId, current.parentId));
    if ((siblings?.total ?? 0) === 0) await db.delete(comments).where(and(eq(comments.id, current.parentId), isNotNull(comments.deletedAt)));
  }
  return { ok: true };
}

/** O dono do post oculta (ou mostra de novo) um comentário do post dele. Excluído não se oculta. */
export async function setCommentHidden(db: Db, ownerId: string, commentId: string, hidden: boolean, now = new Date()): Promise<{ ok: true } | { ok: false; error: 'not-found' }> {
  const [row] = await db
    .select({ id: comments.id })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(and(eq(comments.id, commentId), eq(posts.userId, ownerId), isNull(comments.deletedAt)))
    .limit(1);
  if (!row) return { ok: false, error: 'not-found' };
  await db.update(comments).set({ hiddenAt: hidden ? now : null }).where(eq(comments.id, row.id));
  return { ok: true };
}

export interface CommentAuthor {
  id: string;
  name: string;
  username: string;
  avatarKey: string | null;
}

/**
 * Como a tela precisa do comentário. `status`: `default`; `hidden` (oculto, sem texto, para quem não pode ler);
 * `hidden-owner` (oculto, mas com texto, para o autor e o dono do post); `deleted` (sem texto). O texto de um
 * comentário que a pessoa não pode ler **nunca** sai do servidor.
 */
export interface CommentNode {
  id: string;
  parentId: string | null;
  author: CommentAuthor;
  body: string | null;
  createdAt: Date;
  editedAt: Date | null;
  status: 'default' | 'hidden' | 'hidden-owner' | 'deleted';
  likeCount: number;
  liked: boolean;
  /** Respostas, da mais antiga para a mais nova. Vazio em respostas e em comentários ocultos (as respostas saem junto). */
  replies: CommentNode[];
}

export interface CommentPage {
  comments: CommentNode[];
  /** Dono do post (quem pode ocultar comentários). Vazio se o post não existe. */
  postOwnerId: string | null;
  /** Cursor da próxima página, ou `null` se acabou. */
  next: string | null;
}

/**
 * Comentários de um post, do mais antigo para o mais novo, em páginas de 1º nível com as respostas de cada um.
 * `limit` acima do padrão serve para recarregar tudo o que já estava na tela depois de uma mudança.
 */
export async function listComments(db: Db, postId: string, viewerId: string, options: { after?: Cursor | null; limit?: number } = {}): Promise<CommentPage> {
  const limit = options.limit ?? COMMENTS_PAGE_SIZE;
  const after = options.after;
  const [post] = await db.select({ ownerId: posts.userId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return { comments: [], next: null, postOwnerId: null };

  const select = {
    id: comments.id,
    parentId: comments.parentId,
    body: comments.body,
    createdAt: comments.createdAt,
    editedAt: comments.editedAt,
    hiddenAt: comments.hiddenAt,
    deletedAt: comments.deletedAt,
    authorId: users.id,
    authorName: users.name,
    authorUsername: users.username,
    authorAvatarKey: users.avatarKey,
    likeCount: sql<number>`(select count(*)::int from ${commentLikes} where ${commentLikes.commentId} = ${comments.id})`,
    liked: sql<boolean>`exists (select 1 from ${commentLikes} where ${commentLikes.commentId} = ${comments.id} and ${commentLikes.userId} = ${viewerId})`,
  };
  // Conta não validada não aparece (igual aos posts); comentário excluído com respostas continua (sem texto).
  const top = await db
    .select(select)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(
      and(
        eq(comments.postId, postId),
        isNull(comments.parentId),
        or(isNotNull(users.emailVerifiedAt), isNotNull(comments.deletedAt)),
        after ? or(gt(comments.createdAt, after.at), and(eq(comments.createdAt, after.at), gt(comments.id, after.id))) : undefined,
      ),
    )
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(limit + 1);
  const page = top.slice(0, limit);

  // Respostas dos comentários da página que não estão ocultos (oculto leva as respostas junto).
  const parents = page.filter((row) => row.hiddenAt === null).map((row) => row.id);
  const replyRows =
    parents.length === 0
      ? []
      : await db
          .select(select)
          .from(comments)
          .innerJoin(users, eq(users.id, comments.userId))
          .where(and(inArray(comments.parentId, parents), or(isNotNull(users.emailVerifiedAt), isNotNull(comments.deletedAt))))
          .orderBy(asc(comments.createdAt), asc(comments.id));

  const toNode = (row: (typeof top)[number]): CommentNode => {
    const canRead = row.authorId === viewerId || post.ownerId === viewerId;
    let status: CommentNode['status'] = 'default';
    if (row.deletedAt) status = 'deleted';
    else if (row.hiddenAt) status = canRead ? 'hidden-owner' : 'hidden';
    return {
      id: row.id,
      parentId: row.parentId,
      author: { id: row.authorId, name: row.authorName, username: row.authorUsername, avatarKey: row.authorAvatarKey },
      body: status === 'default' || status === 'hidden-owner' ? row.body : null,
      createdAt: new Date(row.createdAt),
      editedAt: row.editedAt ? new Date(row.editedAt) : null,
      status,
      likeCount: row.likeCount,
      liked: row.liked,
      replies: [],
    };
  };
  const nodes = page.map(toNode);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const row of replyRows) byId.get(row.parentId ?? '')?.replies.push(toNode(row));
  const last = nodes[nodes.length - 1];
  return { comments: nodes, next: top.length > limit && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null, postOwnerId: post.ownerId };
}

export type LikeResult = { ok: true; liked: boolean; count: number } | { ok: false; error: 'not-found' };

/** Curtir ou descurtir um post. Idempotente: pedir duas vezes o mesmo não duplica nem dá erro. */
export async function setPostLike(db: Db, userId: string, postId: string, like: boolean): Promise<LikeResult> {
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return { ok: false, error: 'not-found' };
  if (like) await db.insert(postLikes).values({ postId, userId }).onConflictDoNothing();
  else await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(postLikes).where(eq(postLikes.postId, postId));
  return { ok: true, liked: like, count: row?.total ?? 0 };
}

/** Curtir ou descurtir um comentário (ou resposta). Não se curte comentário excluído. */
export async function setCommentLike(db: Db, userId: string, commentId: string, like: boolean): Promise<LikeResult> {
  const [comment] = await db.select({ id: comments.id }).from(comments).where(and(eq(comments.id, commentId), isNull(comments.deletedAt))).limit(1);
  if (!comment) return { ok: false, error: 'not-found' };
  if (like) await db.insert(commentLikes).values({ commentId, userId }).onConflictDoNothing();
  else await db.delete(commentLikes).where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)));
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(commentLikes).where(eq(commentLikes.commentId, commentId));
  return { ok: true, liked: like, count: row?.total ?? 0 };
}
