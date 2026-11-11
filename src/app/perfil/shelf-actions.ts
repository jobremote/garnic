'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { coverUrl, getIgdbClient, IgdbError, type IgdbGame, type TimeToBeat } from '@/lib/igdb/igdb';
import { getEntry, REVIEW_MAX, removeEntry, updateEntry, type EntryErrorCode, type EntryField, type MonthYear } from '@/lib/shelf/entry';
import { entryErrorMessages } from '@/lib/shelf/messages';
import { parseEntryInput } from '@/lib/shelf/parse';
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
  /** Id da entrada, quando o jogo já está na Game Shelf (a tela abre a entrada existente). */
  entryId?: string;
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
        status: mine.get(game.igdbId)?.status,
        entryId: mine.get(game.igdbId)?.entryId,
      })),
    };
  } catch (error) {
    return failure(error);
  }
}

export type AddGameResult =
  | { ok: true; entryId: string; gameName: string; status: ShelfStatus; alreadyOnShelf: boolean }
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
  return { ok: true, entryId: result.entryId, gameName: result.gameName, status: result.status, alreadyOnShelf: result.alreadyOnShelf };
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

/** A entrada como a tela de edição precisa dela (nada de ids internos do jogo ou de outras pessoas). */
export interface EntryView {
  entryId: string;
  status: ShelfStatus;
  platform: string | null;
  rating: number | null;
  review: string | null;
  reviewSpoiler: boolean;
  started: MonthYear;
  ended: MonthYear;
  playMinutes: number | null;
  gameName: string;
  year: string;
  coverUrl?: string;
  platforms: string[];
}

export type OpenEntryResult = { ok: true; entry: EntryView; timeToBeat: TimeToBeat | null } | { ok: false };

/** Abre a entrada para editar (ou para o pop-up do Zerado), com as estimativas de tempo do IGDB quando houver. */
export async function openEntryAction(entryId: string): Promise<OpenEntryResult> {
  const user = await requireUser();
  if (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entryId)) return { ok: false };
  const entry = await getEntry(await getDb(), user.id, entryId);
  if (!entry) return { ok: false };

  // As estimativas são só uma referência: se o IGDB falhar ou não tiver dado, a tela segue sem elas.
  let timeToBeat: TimeToBeat | null = null;
  try {
    timeToBeat = await getIgdbClient().getTimeToBeat(entry.game.igdbId);
  } catch (error) {
    if (!(error instanceof IgdbError)) throw error;
  }

  return {
    ok: true,
    timeToBeat,
    entry: {
      entryId: entry.entryId,
      status: entry.status,
      platform: entry.platform,
      rating: entry.rating,
      review: entry.review,
      reviewSpoiler: entry.reviewSpoiler,
      started: entry.started,
      ended: entry.ended,
      playMinutes: entry.playMinutes,
      gameName: entry.game.name,
      year: entry.game.releasedAt ? String(entry.game.releasedAt.getUTCFullYear()) : '',
      coverUrl: coverUrl(entry.game.coverImageId, 'cover_small'),
      platforms: entry.game.platforms,
    },
  };
}

export type SaveEntryResult =
  | { ok: true; gameName: string; status: ShelfStatus; statusChanged: boolean }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'invalid'; errors: Partial<Record<EntryField, string>> };

const errorText = (code: EntryErrorCode) => {
  const message = entryErrorMessages[code];
  return typeof message === 'function' ? message(REVIEW_MAX) : message;
};

/** Salva os campos enviados (os que faltam ficam como estão). Os erros voltam já em texto, por campo. */
export async function saveEntryAction(entryId: string, input: unknown): Promise<SaveEntryResult> {
  const user = await requireUser();
  if (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entryId)) return { ok: false, error: 'not-found' };
  const result = await updateEntry(await getDb(), user.id, entryId, parseEntryInput(input));
  if (!result.ok) {
    if (result.error === 'not-found') return { ok: false, error: 'not-found' };
    const errors: Partial<Record<EntryField, string>> = {};
    for (const [field, code] of Object.entries(result.errors) as [EntryField, EntryErrorCode][]) errors[field] = errorText(code);
    return { ok: false, error: 'invalid', errors };
  }
  revalidatePath('/perfil/[username]', 'page');
  return { ok: true, gameName: result.gameName, status: result.status, statusChanged: result.statusChanged };
}

export type RemoveGameResult = { ok: true; gameName: string } | { ok: false };

/** Tira o jogo da Game Shelf de quem está logado. */
export async function removeEntryAction(entryId: string): Promise<RemoveGameResult> {
  const user = await requireUser();
  if (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entryId)) return { ok: false };
  const result = await removeEntry(await getDb(), user.id, entryId);
  if (!result.ok) return { ok: false };
  revalidatePath('/perfil/[username]', 'page');
  return { ok: true, gameName: result.gameName };
}
