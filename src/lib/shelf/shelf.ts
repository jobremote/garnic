import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { games, shelfEntries, type Game } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { isShelfStatus, SHELF_STATUSES, type ShelfStatus } from './status';
import { tagsByEntry, type TagView } from './tags';

/** Regras da Game Shelf (`01_produto/regras-de-negocio/gameshelf.md`). */

export interface ShelfCard {
  entryId: string;
  status: ShelfStatus;
  statusChangedAt: Date;
  game: Pick<Game, 'id' | 'igdbId' | 'name' | 'slug' | 'coverImageId' | 'releasedAt' | 'platforms'>;
  /** Tags do jogo nesta estante, em ordem alfabética. */
  tags: TagView[];
}

export type ShelfColumns = Record<ShelfStatus, ShelfCard[]>;

const emptyColumns = (): ShelfColumns => ({ 'quero-jogar': [], parado: [], jogando: [], zerado: [] });

/**
 * Guarda (ou atualiza) a cópia local do jogo do IGDB e devolve o jogo. Idempotente: adicionar o mesmo jogo de novo
 * só atualiza nome, capa e plataformas.
 */
async function saveGame(db: Db, game: IgdbGame): Promise<Game> {
  const values = {
    igdbId: game.igdbId,
    name: game.name,
    slug: game.slug,
    coverImageId: game.coverImageId,
    releasedAt: game.releasedAt,
    platforms: game.platforms,
  };
  const [row] = await db
    .insert(games)
    .values(values)
    .onConflictDoUpdate({ target: games.igdbId, set: { name: values.name, slug: values.slug, coverImageId: values.coverImageId, releasedAt: values.releasedAt, platforms: values.platforms } })
    .returning();
  return row;
}

export type AddToShelfResult =
  | { ok: true; entryId: string; status: ShelfStatus; alreadyOnShelf: boolean; gameName: string }
  | { ok: false; error: 'invalid-status' };

/**
 * Põe um jogo na Game Shelf com o status escolhido: é a única coisa exigida (jogo e status).
 * Uma entrada por jogo por usuário: se o jogo já está na estante, **não duplica nem muda a coluna**; devolve a
 * entrada existente (`alreadyOnShelf`) para a tela abri-la. O Neon HTTP não tem transações, então a regra fica no
 * índice único (`shelf_entries_user_game_key`) e no `ON CONFLICT DO NOTHING`.
 */
export async function addToShelf(db: Db, userId: string, game: IgdbGame, status: unknown, now = new Date()): Promise<AddToShelfResult> {
  if (!isShelfStatus(status)) return { ok: false, error: 'invalid-status' };
  const saved = await saveGame(db, game);
  const [created] = await db
    .insert(shelfEntries)
    .values({ userId, gameId: saved.id, status, statusChangedAt: now, createdAt: now })
    .onConflictDoNothing({ target: [shelfEntries.userId, shelfEntries.gameId] })
    .returning({ id: shelfEntries.id });
  if (created) return { ok: true, entryId: created.id, status, alreadyOnShelf: false, gameName: saved.name };

  const [existing] = await db
    .select({ id: shelfEntries.id, status: shelfEntries.status })
    .from(shelfEntries)
    .where(and(eq(shelfEntries.userId, userId), eq(shelfEntries.gameId, saved.id)))
    .limit(1);
  return { ok: true, entryId: existing.id, status: existing.status as ShelfStatus, alreadyOnShelf: true, gameName: saved.name };
}

/** Quantos jogos entram de uma vez no cadastro rápido. */
export const QUICK_ADD_MAX = 20;

export type AddManyResult =
  | { ok: true; added: string[]; alreadyOnShelf: string[] }
  | { ok: false; error: 'invalid-status' | 'too-many' | 'empty' };

/**
 * Cadastro rápido: põe vários jogos de uma vez na mesma coluna. Cada jogo segue a regra de sempre (uma entrada por
 * jogo por pessoa): quem já está na Game Shelf **não muda de coluna** e vai para `alreadyOnShelf`. Os jogos entram na
 * ordem em que foram escolhidos (o primeiro escolhido fica no topo da coluna).
 */
export async function addManyToShelf(db: Db, userId: string, gamesToAdd: IgdbGame[], status: unknown, now = new Date()): Promise<AddManyResult> {
  if (!isShelfStatus(status)) return { ok: false, error: 'invalid-status' };
  if (gamesToAdd.length === 0) return { ok: false, error: 'empty' };
  if (gamesToAdd.length > QUICK_ADD_MAX) return { ok: false, error: 'too-many' };
  const added: string[] = [];
  const alreadyOnShelf: string[] = [];
  for (const [index, game] of gamesToAdd.entries()) {
    // Um milissegundo a menos para cada jogo seguinte: a ordem escolhida vira a ordem na coluna.
    const result = await addToShelf(db, userId, game, status, new Date(now.getTime() - index));
    if (!result.ok) return { ok: false, error: 'invalid-status' };
    (result.alreadyOnShelf ? alreadyOnShelf : added).push(result.gameName);
  }
  return { ok: true, added, alreadyOnShelf };
}

export type MoveResult =
  | { ok: true; status: ShelfStatus; changed: boolean; gameName: string }
  | { ok: false; error: 'invalid-status' | 'not-found' };

/**
 * Muda a entrada de coluna. Só o dono mexe na própria entrada. Mover para a coluna em que já está não faz nada
 * (não mexe na data). Mover para Zerado não exige nenhum campo: o pop-up opcional vem na entrega 2.
 */
export async function moveEntry(db: Db, userId: string, entryId: string, status: unknown, now = new Date()): Promise<MoveResult> {
  if (!isShelfStatus(status)) return { ok: false, error: 'invalid-status' };
  const [current] = await db
    .select({ status: shelfEntries.status, name: games.name })
    .from(shelfEntries)
    .innerJoin(games, eq(games.id, shelfEntries.gameId))
    .where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)))
    .limit(1);
  if (!current) return { ok: false, error: 'not-found' };
  if (current.status === status) return { ok: true, status, changed: false, gameName: current.name };
  await db
    .update(shelfEntries)
    .set({ status, statusChangedAt: now })
    .where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)));
  return { ok: true, status, changed: true, gameName: current.name };
}

/** A estante de uma pessoa em colunas. Dentro de cada coluna, o que mudou de status por último vem primeiro. */
export async function getShelf(db: Db, userId: string): Promise<ShelfColumns> {
  const rows = await db
    .select({
      entryId: shelfEntries.id,
      status: shelfEntries.status,
      statusChangedAt: shelfEntries.statusChangedAt,
      game: {
        id: games.id,
        igdbId: games.igdbId,
        name: games.name,
        slug: games.slug,
        coverImageId: games.coverImageId,
        releasedAt: games.releasedAt,
        platforms: games.platforms,
      },
    })
    .from(shelfEntries)
    .innerJoin(games, eq(games.id, shelfEntries.gameId))
    .where(eq(shelfEntries.userId, userId))
    .orderBy(desc(shelfEntries.statusChangedAt), desc(shelfEntries.createdAt));
  const entryTags = await tagsByEntry(db, rows.map((row) => row.entryId));
  const columns = emptyColumns();
  for (const row of rows) {
    if (isShelfStatus(row.status)) columns[row.status].push({ ...row, status: row.status, tags: entryTags.get(row.entryId) ?? [] });
  }
  return columns;
}

/** Entre estes jogos do IGDB, a entrada que a pessoa já tem de cada um (coluna e id), para marcar os resultados da busca. */
export async function statusByIgdbId(db: Db, userId: string, igdbIds: number[]): Promise<Map<number, { status: ShelfStatus; entryId: string }>> {
  const result = new Map<number, { status: ShelfStatus; entryId: string }>();
  if (igdbIds.length === 0) return result;
  const rows = await db
    .select({ igdbId: games.igdbId, status: shelfEntries.status, entryId: shelfEntries.id })
    .from(shelfEntries)
    .innerJoin(games, eq(games.id, shelfEntries.gameId))
    .where(and(eq(shelfEntries.userId, userId), inArray(games.igdbId, igdbIds)));
  for (const row of rows) if (isShelfStatus(row.status)) result.set(row.igdbId, { status: row.status, entryId: row.entryId });
  return result;
}

export interface ShelfCounters {
  /** Total de jogos em Zerado, de qualquer ano. */
  zeroed: number;
  /** Jogos em Quero jogar. */
  backlog: number;
}

/**
 * Contadores do perfil (decisão de 12/11/2026): **Zerados** = total de entradas em Zerado, sem recorte por ano (nem
 * todo zerado é do ano corrente e ainda não há filtro por data). Backlog = jogos em Quero jogar.
 */
export async function shelfCounters(db: Db, userId: string): Promise<ShelfCounters> {
  const [row] = await db
    .select({
      zeroed: sql<number>`count(*) filter (where ${shelfEntries.status} = 'zerado')::int`,
      backlog: sql<number>`count(*) filter (where ${shelfEntries.status} = 'quero-jogar')::int`,
    })
    .from(shelfEntries)
    .where(eq(shelfEntries.userId, userId));
  return { zeroed: row?.zeroed ?? 0, backlog: row?.backlog ?? 0 };
}

export { SHELF_STATUSES };
