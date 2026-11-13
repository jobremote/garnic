import { and, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { follows, games, posts, shelfEntries, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { saveGame } from '@/lib/shelf/shelf';
import { isShelfStatus, type ShelfStatus } from '@/lib/shelf/status';

/** Regras do post (`01_produto/regras-de-negocio/feed.md`). */
export const POST_MAX = 1500;
/** Quantos posts vêm por página (o resto carrega em "Ver mais"). */
export const PAGE_SIZE = 20;
/** Meus jogos: posts que marcam jogos do Game Shelf em Quero jogar, Jogando ou Zerado. Parado não entra. */
export const MY_GAMES_STATUSES: readonly ShelfStatus[] = ['quero-jogar', 'jogando', 'zerado'];

export type PostErrorCode = 'empty' | 'too-long';

/** Texto do post: quebras de linha preservadas (\r\n vira \n), pontas aparadas. */
export const normalizePostBody = (value: unknown): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '');

/** Texto ou imagem é obrigatório (só marcar o jogo não basta); o texto vai até 1.500 caracteres. */
export function validatePost(body: string, hasImage: boolean): PostErrorCode | null {
  if (body.length > POST_MAX) return 'too-long';
  if (body === '' && !hasImage) return 'empty';
  return null;
}

/** Como o jogo marcado muda numa edição. */
export type GameChange = { kind: 'keep' } | { kind: 'none' } | { kind: 'set'; game: IgdbGame };

export interface NewPost {
  body: unknown;
  imageRef?: string | null;
  spoiler?: unknown;
  game?: IgdbGame | null;
}

export type CreatePostResult = { ok: true; postId: string } | { ok: false; error: PostErrorCode };

export async function createPost(db: Db, userId: string, input: NewPost, now = new Date()): Promise<CreatePostResult> {
  const body = normalizePostBody(input.body);
  const imageRef = input.imageRef ? input.imageRef : null;
  const error = validatePost(body, imageRef !== null);
  if (error) return { ok: false, error };
  const gameId = input.game ? (await saveGame(db, input.game)).id : null;
  const [row] = await db
    .insert(posts)
    .values({ userId, body, imageRef, spoiler: input.spoiler === true, gameId, createdAt: now })
    .returning({ id: posts.id });
  return { ok: true, postId: row.id };
}

export interface PostEdit {
  body: unknown;
  /** `undefined` mantém a imagem; `null` tira; texto troca (a referência já vem conferida). */
  imageRef?: string | null;
  spoiler?: unknown;
  game: GameChange;
}

export type UpdatePostResult =
  | { ok: true; edited: boolean; /** Imagem que saiu do post (trocada ou removida): quem chamou apaga do armazenamento. */ replacedImageRef: string | null }
  | { ok: false; error: PostErrorCode | 'not-found' };

/**
 * Edita o próprio post. Só quem postou edita. `editedAt` (o indicador "editado") só é preenchido se algo mudou de
 * fato: texto, imagem, spoiler ou jogo marcado.
 */
export async function updatePost(db: Db, userId: string, postId: string, input: PostEdit, now = new Date()): Promise<UpdatePostResult> {
  const [current] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  if (!current) return { ok: false, error: 'not-found' };

  const body = normalizePostBody(input.body);
  const imageRef = input.imageRef === undefined ? current.imageRef : input.imageRef;
  const error = validatePost(body, imageRef !== null);
  if (error) return { ok: false, error };
  const spoiler = input.spoiler === true;
  let gameId = current.gameId;
  if (input.game.kind === 'none') gameId = null;
  else if (input.game.kind === 'set') gameId = (await saveGame(db, input.game.game)).id;

  const changed = body !== current.body || imageRef !== current.imageRef || spoiler !== current.spoiler || gameId !== current.gameId;
  if (!changed) return { ok: true, edited: false, replacedImageRef: null };
  await db.update(posts).set({ body, imageRef, spoiler, gameId, editedAt: now }).where(eq(posts.id, current.id));
  return { ok: true, edited: true, replacedImageRef: current.imageRef && current.imageRef !== imageRef ? current.imageRef : null };
}

export type DeletePostResult = { ok: true; imageRef: string | null } | { ok: false; error: 'not-found' };

/** Exclui o próprio post. Devolve a imagem dele para quem chamou apagar do armazenamento. */
export async function deletePost(db: Db, userId: string, postId: string): Promise<DeletePostResult> {
  const [row] = await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).returning({ imageRef: posts.imageRef });
  return row ? { ok: true, imageRef: row.imageRef } : { ok: false, error: 'not-found' };
}

/** Post como a tela precisa. O jogo e o status vêm prontos; só o necessário do autor. */
export interface FeedPost {
  id: string;
  body: string;
  imageRef: string | null;
  spoiler: boolean;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; username: string; avatarKey: string | null };
  game: { igdbId: number; name: string; coverImageId: string | null } | null;
  /** Status do jogo marcado no Game Shelf de quem postou (nulo se o jogo não está lá). */
  authorStatus: ShelfStatus | null;
}

/** De onde vêm os posts. */
export type FeedFilter =
  | { kind: 'following'; viewerId: string }
  | { kind: 'my-games'; viewerId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'all' };

/** Posição na lista: o post mais antigo da página anterior (data e id desempatam posts do mesmo instante). */
export interface Cursor {
  at: Date;
  id: string;
}

export const encodeCursor = (cursor: Cursor): string => `${cursor.at.toISOString()}_${cursor.id}`;

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export function decodeCursor(value: unknown): Cursor | null {
  if (typeof value !== 'string') return null;
  const match = CURSOR.exec(value);
  if (!match) return null;
  const at = new Date(match[1]);
  return Number.isNaN(at.getTime()) ? null : { at, id: match[2] };
}

/** De onde a tela pede posts: o servidor monta o filtro (quem vê é sempre quem está logado). */
export type FeedScope = { kind: 'following' } | { kind: 'my-games' } | { kind: 'all' } | { kind: 'user'; userId: string };

export function filterFor(scope: FeedScope, viewerId: string): FeedFilter {
  if (scope.kind === 'following') return { kind: 'following', viewerId };
  if (scope.kind === 'my-games') return { kind: 'my-games', viewerId };
  if (scope.kind === 'user') return { kind: 'user', userId: scope.userId };
  return { kind: 'all' };
}

export interface FeedPage {
  posts: FeedPost[];
  /** Cursor da próxima página, ou `null` se acabou. */
  next: string | null;
}

function condition(filter: FeedFilter): SQL | undefined {
  switch (filter.kind) {
    case 'following':
      // Seguindo: quem a pessoa segue e os próprios posts (para ela ver o que acabou de publicar).
      return or(
        eq(posts.userId, filter.viewerId),
        inArray(posts.userId, sql`(select ${follows.followeeId} from ${follows} where ${follows.followerId} = ${filter.viewerId})`),
      );
    case 'my-games':
      return inArray(
        posts.gameId,
        sql`(select ${shelfEntries.gameId} from ${shelfEntries} where ${shelfEntries.userId} = ${filter.viewerId} and ${shelfEntries.status} in (${sql.join(
          MY_GAMES_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )}))`,
      );
    case 'user':
      return eq(posts.userId, filter.userId);
    case 'all':
      return undefined;
  }
}

/** Lista posts do mais recente para o mais antigo (sem algoritmo), em páginas. */
export async function listPosts(db: Db, filter: FeedFilter, options: { before?: Cursor | null; limit?: number } = {}): Promise<FeedPage> {
  const limit = options.limit ?? PAGE_SIZE;
  const before = options.before;
  const where = and(
    isNotNull(users.emailVerifiedAt),
    condition(filter),
    before ? or(lt(posts.createdAt, before.at), and(eq(posts.createdAt, before.at), lt(posts.id, before.id))) : undefined,
  );
  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      imageRef: posts.imageRef,
      spoiler: posts.spoiler,
      createdAt: posts.createdAt,
      editedAt: posts.editedAt,
      authorId: users.id,
      authorName: users.name,
      authorUsername: users.username,
      authorAvatarKey: users.avatarKey,
      gameIgdbId: games.igdbId,
      gameName: games.name,
      gameCover: games.coverImageId,
      authorStatus: shelfEntries.status,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(games, eq(games.id, posts.gameId))
    .leftJoin(shelfEntries, and(eq(shelfEntries.userId, posts.userId), eq(shelfEntries.gameId, posts.gameId)))
    .where(where)
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const list: FeedPost[] = page.map((row) => ({
    id: row.id,
    body: row.body,
    imageRef: row.imageRef,
    spoiler: row.spoiler,
    createdAt: new Date(row.createdAt),
    editedAt: row.editedAt ? new Date(row.editedAt) : null,
    author: { id: row.authorId, name: row.authorName, username: row.authorUsername, avatarKey: row.authorAvatarKey },
    game: row.gameName !== null && row.gameIgdbId !== null ? { igdbId: row.gameIgdbId, name: row.gameName, coverImageId: row.gameCover } : null,
    authorStatus: isShelfStatus(row.authorStatus) ? row.authorStatus : null,
  }));
  const last = list[list.length - 1];
  return { posts: list, next: rows.length > limit && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null };
}

/** Quantos jogos elegíveis para "Meus jogos" a pessoa tem (para escolher a mensagem de lista vazia). */
export async function countMyGames(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(shelfEntries)
    .where(and(eq(shelfEntries.userId, userId), inArray(shelfEntries.status, [...MY_GAMES_STATUSES])));
  return row?.total ?? 0;
}
