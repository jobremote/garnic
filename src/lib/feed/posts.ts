import { and, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { follows, games, postGames, posts, shelfEntries, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { saveGame } from '@/lib/shelf/shelf';
import { isShelfStatus, type ShelfStatus } from '@/lib/shelf/status';
import { withoutMentions } from './mentions';

/** Regras do post (`01_produto/regras-de-negocio/feed.md`). */
export const POST_MAX = 1500;
/** Quantos jogos um post pode marcar (decidido em 13/11/2026; antes era 1). */
export const POST_GAMES_MAX = 10;
/** Quantos posts vêm por página (o resto carrega em "Ver mais"). */
export const PAGE_SIZE = 20;
/** Meus jogos: posts que marcam jogos do Game Shelf em Quero jogar, Jogando ou Zerado. Parado não entra. */
export const MY_GAMES_STATUSES: readonly ShelfStatus[] = ['quero-jogar', 'jogando', 'zerado'];

export type PostErrorCode = 'empty' | 'too-long' | 'too-many-games';

/** Texto do post: quebras de linha preservadas (\r\n vira \n), pontas aparadas. */
export const normalizePostBody = (value: unknown): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '');

/**
 * Texto ou imagem é obrigatório (só marcar o jogo não basta); o texto vai até 1.500 caracteres. O "@Nome" dos jogos
 * marcados (`marked`) não conta como texto: um post só com menções é só marcar o jogo.
 */
export function validatePost(body: string, hasImage: boolean, marked: readonly { name: string }[] = []): PostErrorCode | null {
  if (body.length > POST_MAX) return 'too-long';
  if (withoutMentions(body, marked) === '' && !hasImage) return 'empty';
  return null;
}

/** Como os jogos marcados mudam numa edição: `keep` mantém a lista; `set` troca pela lista nova (vazia tira todos). */
export type GamesChange = { kind: 'keep' } | { kind: 'set'; games: IgdbGame[] };

export interface NewPost {
  body: unknown;
  imageRef?: string | null;
  spoiler?: unknown;
  /** Jogos marcados, na ordem em que foram escolhidos (até 10; repetidos contam uma vez). */
  games?: IgdbGame[];
}

/** Tira jogos repetidos (pelo id do IGDB), mantendo a ordem da primeira aparição. */
function uniqueGames(list: IgdbGame[] | undefined): IgdbGame[] {
  const seen = new Set<number>();
  return (list ?? []).filter((game) => (seen.has(game.igdbId) ? false : (seen.add(game.igdbId), true)));
}

/** Guarda os jogos (se ainda não existirem) e devolve os ids internos, na mesma ordem. */
async function saveGames(db: Db, list: IgdbGame[]): Promise<string[]> {
  const ids: string[] = [];
  for (const game of list) ids.push((await saveGame(db, game)).id);
  return ids;
}

export type CreatePostResult = { ok: true; postId: string } | { ok: false; error: PostErrorCode };

export async function createPost(db: Db, userId: string, input: NewPost, now = new Date()): Promise<CreatePostResult> {
  const body = normalizePostBody(input.body);
  const imageRef = input.imageRef ? input.imageRef : null;
  const list = uniqueGames(input.games);
  const error = validatePost(body, imageRef !== null, list);
  if (error) return { ok: false, error };
  if (list.length > POST_GAMES_MAX) return { ok: false, error: 'too-many-games' };
  const gameIds = await saveGames(db, list);
  const [row] = await db
    .insert(posts)
    .values({ userId, body, imageRef, spoiler: input.spoiler === true, createdAt: now })
    .returning({ id: posts.id });
  if (gameIds.length > 0) await db.insert(postGames).values(gameIds.map((gameId, position) => ({ postId: row.id, gameId, position })));
  return { ok: true, postId: row.id };
}

export interface PostEdit {
  body: unknown;
  /** `undefined` mantém a imagem; `null` tira; texto troca (a referência já vem conferida). */
  imageRef?: string | null;
  spoiler?: unknown;
  games: GamesChange;
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
  const spoiler = input.spoiler === true;

  const currentGames = await db
    .select({ gameId: postGames.gameId, name: games.name })
    .from(postGames)
    .innerJoin(games, eq(games.id, postGames.gameId))
    .where(eq(postGames.postId, current.id))
    .orderBy(postGames.position);
  const currentGameIds = currentGames.map((row) => row.gameId);
  const nextList = input.games.kind === 'set' ? uniqueGames(input.games.games) : null;
  const error = validatePost(body, imageRef !== null, nextList ?? currentGames);
  if (error) return { ok: false, error };
  let nextGameIds = currentGameIds;
  if (nextList) {
    if (nextList.length > POST_GAMES_MAX) return { ok: false, error: 'too-many-games' };
    nextGameIds = await saveGames(db, nextList);
  }
  const gamesChanged = nextGameIds.length !== currentGameIds.length || nextGameIds.some((id, index) => id !== currentGameIds[index]);

  const changed = body !== current.body || imageRef !== current.imageRef || spoiler !== current.spoiler || gamesChanged;
  if (!changed) return { ok: true, edited: false, replacedImageRef: null };
  await db.update(posts).set({ body, imageRef, spoiler, editedAt: now }).where(eq(posts.id, current.id));
  if (gamesChanged) {
    await db.delete(postGames).where(eq(postGames.postId, current.id));
    if (nextGameIds.length > 0) await db.insert(postGames).values(nextGameIds.map((gameId, position) => ({ postId: current.id, gameId, position })));
  }
  return { ok: true, edited: true, replacedImageRef: current.imageRef && current.imageRef !== imageRef ? current.imageRef : null };
}

export type DeletePostResult = { ok: true; imageRef: string | null } | { ok: false; error: 'not-found' };

/** Exclui o próprio post. Devolve a imagem dele para quem chamou apagar do armazenamento. */
export async function deletePost(db: Db, userId: string, postId: string): Promise<DeletePostResult> {
  const [row] = await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).returning({ imageRef: posts.imageRef });
  return row ? { ok: true, imageRef: row.imageRef } : { ok: false, error: 'not-found' };
}

/** Jogo marcado em um post. `status` é o do jogo no Game Shelf de quem postou (nulo se o jogo não está lá). */
export interface PostGame {
  igdbId: number;
  name: string;
  coverImageId: string | null;
  status: ShelfStatus | null;
}

/** Post como a tela precisa. Os jogos e os status vêm prontos, na ordem em que foram escolhidos; só o necessário do autor. */
export interface FeedPost {
  id: string;
  body: string;
  imageRef: string | null;
  spoiler: boolean;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; username: string; avatarKey: string | null };
  games: PostGame[];
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
      // Entra o post que marca QUALQUER jogo do Game Shelf de quem vê em Quero jogar, Jogando ou Zerado.
      return sql`exists (select 1 from ${postGames} inner join ${shelfEntries} on ${shelfEntries.gameId} = ${postGames.gameId} where ${postGames.postId} = ${posts.id} and ${shelfEntries.userId} = ${filter.viewerId} and ${shelfEntries.status} in (${sql.join(
        MY_GAMES_STATUSES.map((status) => sql`${status}`),
        sql`, `,
      )}))`;
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
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .where(where)
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  // Jogos marcados da página, de uma vez só, com o status de cada um no Game Shelf de quem postou.
  const gamesByPost = new Map<string, PostGame[]>();
  if (page.length > 0) {
    const marked = await db
      .select({
        postId: postGames.postId,
        igdbId: games.igdbId,
        name: games.name,
        cover: games.coverImageId,
        status: shelfEntries.status,
      })
      .from(postGames)
      .innerJoin(posts, eq(posts.id, postGames.postId))
      .innerJoin(games, eq(games.id, postGames.gameId))
      .leftJoin(shelfEntries, and(eq(shelfEntries.userId, posts.userId), eq(shelfEntries.gameId, postGames.gameId)))
      .where(inArray(postGames.postId, page.map((row) => row.id)))
      .orderBy(postGames.postId, postGames.position);
    for (const row of marked) {
      const list = gamesByPost.get(row.postId) ?? [];
      list.push({ igdbId: row.igdbId, name: row.name, coverImageId: row.cover, status: isShelfStatus(row.status) ? row.status : null });
      gamesByPost.set(row.postId, list);
    }
  }
  const list: FeedPost[] = page.map((row) => ({
    id: row.id,
    body: row.body,
    imageRef: row.imageRef,
    spoiler: row.spoiler,
    createdAt: new Date(row.createdAt),
    editedAt: row.editedAt ? new Date(row.editedAt) : null,
    author: { id: row.authorId, name: row.authorName, username: row.authorUsername, avatarKey: row.authorAvatarKey },
    games: gamesByPost.get(row.id) ?? [],
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
