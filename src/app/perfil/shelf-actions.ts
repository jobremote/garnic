'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { coverUrl, getIgdbClient, IgdbError, type IgdbGame } from '@/lib/igdb/igdb';
import { addToShelf, moveEntry, statusByIgdbId } from '@/lib/shelf/shelf';
import { isShelfStatus, type ShelfStatus } from '@/lib/shelf/status';

/** Um resultado de busca, já pronto para a tela. Nada aqui vai para o banco: ao adicionar, o servidor busca o jogo de novo no IGDB. */
export interface GameResult {
  igdbId: number;
  name: string;
  detail: string;
  coverUrl?: string;
  /** Coluna em que o jogo já está na Game Shelf de quem busca, se estiver. */
  status?: ShelfStatus;
}

export type SearchGamesResult =
  | { ok: true; results: GameResult[] }
  | { ok: false; error: 'not-configured' | 'unavailable' };

const resultDetail = (game: IgdbGame) => {
  const year = game.releasedAt ? String(game.releasedAt.getUTCFullYear()) : null;
  const platforms = game.platforms.slice(0, 3).join(', ');
  const extra = game.platforms.length > 3 ? ` +${game.platforms.length - 3}` : '';
  return [year, platforms ? `${platforms}${extra}` : null].filter(Boolean).join(' · ');
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return user;
}

function failure(error: unknown): { ok: false; error: 'not-configured' | 'unavailable' } {
  if (error instanceof IgdbError && error.reason === 'not-configured') return { ok: false, error: 'not-configured' };
  console.error('IGDB:', error instanceof Error ? error.message : error);
  return { ok: false, error: 'unavailable' };
}

/** Busca jogos no IGDB e marca os que a pessoa já tem na Game Shelf. */
export async function searchGamesAction(query: string): Promise<SearchGamesResult> {
  const user = await requireUser();
  if (typeof query !== 'string') return { ok: true, results: [] };
  try {
    const games = await getIgdbClient().searchGames(query.slice(0, 100));
    const mine = await statusByIgdbId(await getDb(), user.id, games.map((game) => game.igdbId));
    return {
      ok: true,
      results: games.map((game) => ({
        igdbId: game.igdbId,
        name: game.name,
        detail: resultDetail(game),
        coverUrl: coverUrl(game.coverImageId, 'cover_small'),
        status: mine.get(game.igdbId),
      })),
    };
  } catch (error) {
    return failure(error);
  }
}

export type AddGameResult =
  | { ok: true; gameName: string; status: ShelfStatus; alreadyOnShelf: boolean }
  | { ok: false; error: 'not-configured' | 'unavailable' | 'not-found' | 'invalid' };

/** Põe o jogo na Game Shelf de quem está logado. Se já estiver lá, não duplica e avisa em que coluna está. */
export async function addGameAction(igdbId: number, status: string): Promise<AddGameResult> {
  const user = await requireUser();
  if (!Number.isSafeInteger(igdbId) || !isShelfStatus(status)) return { ok: false, error: 'invalid' };
  let game: IgdbGame | null;
  try {
    game = await getIgdbClient().getGame(igdbId);
  } catch (error) {
    return failure(error);
  }
  if (!game) return { ok: false, error: 'not-found' };

  const result = await addToShelf(await getDb(), user.id, game, status);
  if (!result.ok) return { ok: false, error: 'invalid' };
  revalidatePath('/perfil/[username]', 'page');
  return { ok: true, gameName: result.gameName, status: result.status, alreadyOnShelf: result.alreadyOnShelf };
}

export type MoveGameResult =
  | { ok: true; gameName: string; status: ShelfStatus; changed: boolean }
  | { ok: false; error: 'not-found' | 'invalid' };

/** Move um jogo de coluna (menu "Mover para" ou arrastar). Só mexe nas entradas de quem está logado. */
export async function moveGameAction(entryId: string, status: string): Promise<MoveGameResult> {
  const user = await requireUser();
  if (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entryId) || !isShelfStatus(status)) return { ok: false, error: 'invalid' };
  const result = await moveEntry(await getDb(), user.id, entryId, status);
  if (!result.ok) return { ok: false, error: result.error === 'not-found' ? 'not-found' : 'invalid' };
  revalidatePath('/perfil/[username]', 'page');
  return { ok: true, gameName: result.gameName, status: result.status, changed: result.changed };
}
