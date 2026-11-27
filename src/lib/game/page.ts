import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { games, shelfEntries, users } from '@/lib/db/schema';
import type { IgdbClient } from '@/lib/igdb/igdb';
import type { Translator } from '@/lib/translate/deepl';
import { isShelfStatus, type ShelfStatus } from '@/lib/shelf/status';

/** Página do jogo (`01_produto/regras-de-negocio/gameshelf.md`, "Página do jogo", e `tempos-de-gameplay.md`). */

export type Game = typeof games.$inferSelect;

/** O tempo da comunidade só aparece a partir de 5 registros (decisão de 27/11/2026). */
export const COMMUNITY_TIME_MIN = 5;
/** Os detalhes do IGDB são buscados de novo depois deste prazo. */
export const DETAILS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SCREENSHOTS_PAGE = 6;

export { gamePath } from './path';

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

/** Acha o jogo pelo endereço. Só existem páginas de jogos que já estão no Garnic (alguém adicionou ou marcou). */
export async function findGame(db: Db, key: string): Promise<Game | null> {
  const value = key.trim().toLowerCase();
  if (/^\d{1,10}$/.test(value)) {
    const [row] = await db.select().from(games).where(eq(games.igdbId, Number(value))).limit(1);
    if (row) return row;
  }
  if (!SLUG.test(value)) return null;
  const [row] = await db.select().from(games).where(eq(games.slug, value)).orderBy(games.createdAt).limit(1);
  return row ?? null;
}

/**
 * Garante os detalhes do IGDB (resumo, gêneros, empresas, imagem de fundo e tempos) e o resumo em português. Busca na
 * primeira visita e depois de `DETAILS_MAX_AGE_MS`. Falhas não quebram a página: ela segue com o que já tem, e a
 * tradução que falhou é tentada de novo na próxima visita.
 */
export async function ensureGameDetails(db: Db, game: Game, igdb: IgdbClient, translator: Translator, now = new Date()): Promise<Game> {
  let current = game;
  const stale = !game.detailsFetchedAt || now.getTime() - new Date(game.detailsFetchedAt).getTime() > DETAILS_MAX_AGE_MS;
  if (stale) {
    try {
      const [details, time] = [await igdb.getGameDetails(game.igdbId), await igdb.getTimeToBeat(game.igdbId)];
      if (details) {
        const summaryChanged = details.summary !== game.summary;
        const [row] = await db
          .update(games)
          .set({
            summary: details.summary,
            summaryPt: summaryChanged ? null : game.summaryPt,
            genres: details.genres,
            developers: details.developers,
            publishers: details.publishers,
            backdropImageId: details.backdropImageId,
            timeHastily: time?.hastily ?? null,
            timeNormally: time?.normally ?? null,
            timeCompletely: time?.completely ?? null,
            detailsFetchedAt: now,
          })
          .where(eq(games.id, game.id))
          .returning();
        current = row;
      }
    } catch (error) {
      console.error('IGDB (página do jogo):', error instanceof Error ? error.message : error);
    }
  }
  if (current.summary && !current.summaryPt && translator.configured) {
    const translated = await translator.toPortuguese(current.summary);
    if (translated) {
      const [row] = await db.update(games).set({ summaryPt: translated }).where(eq(games.id, current.id)).returning();
      current = row;
    }
  }
  return current;
}

export interface CommunityStats {
  /** Média de todas as notas informadas (qualquer status), ou `null` sem nenhuma nota. */
  ratingAverage: number | null;
  ratingCount: number;
  /** Quantas pessoas têm o jogo no Game Shelf (qualquer coluna). */
  owners: number;
  /** Média dos tempos de quem está em Zerado, em minutos; `null` com menos de `COMMUNITY_TIME_MIN` registros. */
  timeAverage: number | null;
  timeCount: number;
}

export async function communityStats(db: Db, gameId: string): Promise<CommunityStats> {
  const verified = and(eq(shelfEntries.gameId, gameId), isNotNull(users.emailVerifiedAt));
  const [row] = await db
    .select({
      owners: count(),
      ratingCount: sql<number>`count(${shelfEntries.rating})::int`,
      ratingAverage: sql<string | null>`avg(${shelfEntries.rating})`,
      timeCount: sql<number>`(count(${shelfEntries.playMinutes}) filter (where ${shelfEntries.status} = 'zerado'))::int`,
      timeAverage: sql<string | null>`avg(${shelfEntries.playMinutes}) filter (where ${shelfEntries.status} = 'zerado')`,
    })
    .from(shelfEntries)
    .innerJoin(users, eq(users.id, shelfEntries.userId))
    .where(verified);
  const timeCount = Number(row?.timeCount ?? 0);
  return {
    owners: Number(row?.owners ?? 0),
    ratingCount: Number(row?.ratingCount ?? 0),
    ratingAverage: row?.ratingAverage === null || row?.ratingAverage === undefined ? null : Math.round(Number(row.ratingAverage) * 10) / 10,
    timeCount,
    timeAverage: timeCount >= COMMUNITY_TIME_MIN && row?.timeAverage ? Math.round(Number(row.timeAverage)) : null,
  };
}

export interface GameScreenshot {
  entryId: string;
  ref: string;
  spoiler: boolean;
  username: string;
  own: boolean;
}

export interface ScreenshotPage {
  screenshots: GameScreenshot[];
  total: number;
  /** Posição da próxima página, ou `null` se acabou. */
  next: number | null;
}

/** Screenshots dos usuários (uma por entrada), das entradas mais novas para as mais antigas. */
export async function listGameScreenshots(db: Db, gameId: string, viewerId: string, offset = 0, limit = SCREENSHOTS_PAGE): Promise<ScreenshotPage> {
  const where = and(eq(shelfEntries.gameId, gameId), isNotNull(shelfEntries.screenshotRef), isNotNull(users.emailVerifiedAt));
  const start = Math.max(0, Math.trunc(offset));
  const [totalRow] = await db.select({ total: count() }).from(shelfEntries).innerJoin(users, eq(users.id, shelfEntries.userId)).where(where);
  const rows = await db
    .select({ entryId: shelfEntries.id, ref: shelfEntries.screenshotRef, spoiler: shelfEntries.screenshotSpoiler, username: users.username, userId: users.id })
    .from(shelfEntries)
    .innerJoin(users, eq(users.id, shelfEntries.userId))
    .where(where)
    .orderBy(desc(shelfEntries.createdAt), desc(shelfEntries.id))
    .limit(limit)
    .offset(start);
  const total = Number(totalRow?.total ?? 0);
  return {
    screenshots: rows.flatMap((row) => (row.ref ? [{ entryId: row.entryId, ref: row.ref, spoiler: row.spoiler, username: row.username, own: row.userId === viewerId }] : [])),
    total,
    next: start + rows.length < total ? start + rows.length : null,
  };
}

/** A entrada de quem está vendo, se o jogo está no Game Shelf dela. */
export async function viewerEntry(db: Db, userId: string, gameId: string): Promise<{ entryId: string; status: ShelfStatus } | null> {
  const [row] = await db
    .select({ entryId: shelfEntries.id, status: shelfEntries.status })
    .from(shelfEntries)
    .where(and(eq(shelfEntries.userId, userId), eq(shelfEntries.gameId, gameId)))
    .limit(1);
  return row && isShelfStatus(row.status) ? { entryId: row.entryId, status: row.status } : null;
}
