import { and, eq, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { isAcceptableImageRef } from '@/lib/profile/images';
import { games, shelfEntries } from '@/lib/db/schema';
import { isShelfStatus, type ShelfStatus } from './status';
import { topSortOrder } from './order';
import { checkTagIds, replaceEntryTags, tagsByEntry } from './tags';

/** Edição da entrada da Game Shelf (`01_produto/regras-de-negocio/gameshelf.md`). */

export const REVIEW_MAX = 2000;
export const MIN_YEAR = 1970;
export const MAX_PLAY_MINUTES = 9999 * 60 + 59;

export interface MonthYear {
  month: number | null;
  year: number | null;
}

export interface EntryDetails {
  entryId: string;
  status: ShelfStatus;
  platform: string | null;
  rating: number | null;
  review: string | null;
  reviewSpoiler: boolean;
  started: MonthYear;
  ended: MonthYear;
  playMinutes: number | null;
  /** Ids das tags da entrada. */
  tagIds: string[];
  /** Referência da screenshot (uma por entrada, pública) e se ela tem spoiler. */
  screenshotRef: string | null;
  screenshotSpoiler: boolean;
  game: { id: string; igdbId: number; name: string; releasedAt: Date | null; coverImageId: string | null; platforms: string[] };
}

export async function getEntry(db: Db, userId: string, entryId: string): Promise<EntryDetails | null> {
  const [row] = await db
    .select({ entry: shelfEntries, game: games })
    .from(shelfEntries)
    .innerJoin(games, eq(games.id, shelfEntries.gameId))
    .where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)))
    .limit(1);
  if (!row || !isShelfStatus(row.entry.status)) return null;
  const { entry, game } = row;
  const entryTags = (await tagsByEntry(db, [entry.id])).get(entry.id) ?? [];
  return {
    tagIds: entryTags.map((tag) => tag.id),
    screenshotRef: entry.screenshotRef,
    screenshotSpoiler: entry.screenshotSpoiler,
    entryId: entry.id,
    status: entry.status as ShelfStatus,
    platform: entry.platform,
    rating: entry.rating,
    review: entry.review,
    reviewSpoiler: entry.reviewSpoiler,
    started: { month: entry.startedMonth, year: entry.startedYear },
    ended: { month: entry.endedMonth, year: entry.endedYear },
    playMinutes: entry.playMinutes,
    game: { id: game.id, igdbId: game.igdbId, name: game.name, releasedAt: game.releasedAt, coverImageId: game.coverImageId, platforms: game.platforms },
  };
}

/**
 * O que pode mudar numa entrada. Campo ausente (`undefined`) mantém o valor atual; `null` limpa. As abas e o pop-up do
 * Zerado mandam só os campos que mostram.
 */
export interface EntryInput {
  status?: unknown;
  rating?: number | null;
  platform?: string | null;
  review?: string | null;
  reviewSpoiler?: boolean;
  started?: MonthYear;
  ended?: MonthYear;
  playMinutes?: number | null;
  /** Lista completa de tags da entrada (substitui a atual). Ausente: mantém. */
  tagIds?: unknown;
  /** Referência da screenshot já enviada (a tela envia a imagem antes). `null` remove. Ausente: mantém. */
  screenshot?: string | null;
  screenshotSpoiler?: boolean;
}

export type EntryField = 'status' | 'rating' | 'platform' | 'review' | 'started' | 'ended' | 'playMinutes' | 'tags' | 'screenshot';
export type EntryErrorCode =
  | 'invalid-status'
  | 'invalid-rating'
  | 'invalid-platform'
  | 'review-too-long'
  | 'date-incomplete'
  | 'date-invalid'
  | 'date-future'
  | 'end-before-start'
  | 'invalid-time'
  | 'invalid-tags'
  | 'too-many-tags'
  | 'invalid-screenshot';

export type UpdateEntryResult =
  | { ok: true; gameName: string; status: ShelfStatus; statusChanged: boolean; replacedScreenshot: string | null }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'invalid'; errors: Partial<Record<EntryField, EntryErrorCode>> };

const monthIndex = (value: { month: number; year: number }) => value.year * 12 + (value.month - 1);

/** Confere um par mês/ano: os dois vazios (limpa) ou os dois válidos. Devolve o valor limpo ou o código do erro. */
function checkMonthYear(value: MonthYear, now: Date): { value: { month: number; year: number } | null } | { error: EntryErrorCode } {
  const { month, year } = value;
  if (month === null && year === null) return { value: null };
  if (month === null || year === null) return { error: 'date-incomplete' };
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12 || year < MIN_YEAR) return { error: 'date-invalid' };
  if (monthIndex({ month, year }) > monthIndex({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear() })) return { error: 'date-future' };
  return { value: { month, year } };
}

/** Texto da review: pontas aparadas, vazio vira nulo. Quebras de linha são mantidas (é um texto corrido). */
export const normalizeReview = (text: string) => text.replace(/\r\n/g, '\n').trim();

/**
 * Salva a entrada. Valida tudo antes de gravar e não grava nada se algo falhar. Só o dono mexe na própria entrada.
 * Mudar o status por aqui conta como mudar de coluna (atualiza `statusChangedAt`); o tempo de jogo, a nota e a data de
 * fim são mantidos ao sair de Zerado.
 */
export async function updateEntry(db: Db, userId: string, entryId: string, input: EntryInput, now = new Date()): Promise<UpdateEntryResult> {
  const current = await getEntry(db, userId, entryId);
  if (!current) return { ok: false, error: 'not-found' };

  const errors: Partial<Record<EntryField, EntryErrorCode>> = {};
  // Cada coluna aceita também uma expressão SQL (o topo da coluna é calculado no próprio UPDATE).
  type Insert = typeof shelfEntries.$inferInsert;
  const set: Partial<{ [K in keyof Insert]: Insert[K] | SQL }> = {};

  let status = current.status;
  if (input.status !== undefined) {
    if (isShelfStatus(input.status)) status = input.status;
    else errors.status = 'invalid-status';
  }

  if (input.rating !== undefined) {
    if (input.rating === null || (Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5)) set.rating = input.rating;
    else errors.rating = 'invalid-rating';
  }

  if (input.platform !== undefined) {
    if (input.platform === null || input.platform === '') set.platform = null;
    else if (current.game.platforms.includes(input.platform)) set.platform = input.platform;
    else errors.platform = 'invalid-platform';
  }

  if (input.review !== undefined) {
    const review = input.review === null ? '' : normalizeReview(input.review);
    if (review.length > REVIEW_MAX) errors.review = 'review-too-long';
    else set.review = review === '' ? null : review;
  }
  if (input.reviewSpoiler !== undefined) set.reviewSpoiler = input.reviewSpoiler === true;

  let started: { month: number; year: number } | null =
    current.started.month !== null && current.started.year !== null ? { month: current.started.month, year: current.started.year } : null;
  let ended: { month: number; year: number } | null =
    current.ended.month !== null && current.ended.year !== null ? { month: current.ended.month, year: current.ended.year } : null;
  if (input.started !== undefined) {
    const checked = checkMonthYear(input.started, now);
    if ('error' in checked) errors.started = checked.error;
    else {
      started = checked.value;
      set.startedMonth = started?.month ?? null;
      set.startedYear = started?.year ?? null;
    }
  }
  if (input.ended !== undefined) {
    const checked = checkMonthYear(input.ended, now);
    if ('error' in checked) errors.ended = checked.error;
    else {
      ended = checked.value;
      set.endedMonth = ended?.month ?? null;
      set.endedYear = ended?.year ?? null;
    }
  }
  if (!errors.started && !errors.ended && started && ended && monthIndex(ended) < monthIndex(started)) errors.ended = 'end-before-start';

  if (input.playMinutes !== undefined) {
    if (input.playMinutes === null) set.playMinutes = null;
    else if (Number.isInteger(input.playMinutes) && input.playMinutes > 0 && input.playMinutes <= MAX_PLAY_MINUTES) set.playMinutes = input.playMinutes;
    else errors.playMinutes = 'invalid-time';
  }

  let replacedScreenshot: string | null = null;
  if (input.screenshot !== undefined) {
    if (input.screenshot === null) set.screenshotRef = null;
    else if (typeof input.screenshot === 'string' && isAcceptableImageRef('screenshot', userId, input.screenshot)) set.screenshotRef = input.screenshot;
    else errors.screenshot = 'invalid-screenshot';
    // Trocar ou remover: a imagem antiga sai do armazenamento (quem chama apaga).
    if (!errors.screenshot && current.screenshotRef && current.screenshotRef !== set.screenshotRef) replacedScreenshot = current.screenshotRef;
  }
  if (input.screenshotSpoiler !== undefined) set.screenshotSpoiler = input.screenshotSpoiler === true;

  let tagIds: string[] | null = null;
  if (input.tagIds !== undefined) {
    const checked = await checkTagIds(db, userId, input.tagIds);
    if (checked.ok) tagIds = checked.ids;
    else errors.tags = checked.error;
  }

  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };

  const statusChanged = status !== current.status;
  if (statusChanged) {
    set.status = status;
    set.statusChangedAt = now;
    set.sortOrder = topSortOrder(userId, status); // entra no topo da coluna nova
  }
  if (Object.keys(set).length > 0) {
    await db.update(shelfEntries).set(set).where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)));
  }
  if (tagIds !== null) await replaceEntryTags(db, entryId, tagIds);
  return { ok: true, gameName: current.game.name, status, statusChanged, replacedScreenshot };
}

export type RemoveEntryResult = { ok: true; gameName: string; screenshotRef: string | null } | { ok: false; error: 'not-found' };

/**
 * Tira o jogo da Game Shelf. Só o dono. Apaga a entrada (nota, review e datas saem junto; a nota sai da média da
 * comunidade). A cópia local do jogo fica: outras pessoas podem ter o mesmo jogo.
 */
export async function removeEntry(db: Db, userId: string, entryId: string): Promise<RemoveEntryResult> {
  const [row] = await db
    .select({ name: games.name, screenshotRef: shelfEntries.screenshotRef })
    .from(shelfEntries)
    .innerJoin(games, eq(games.id, shelfEntries.gameId))
    .where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, error: 'not-found' };
  await db.delete(shelfEntries).where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)));
  return { ok: true, gameName: row.name, screenshotRef: row.screenshotRef };
}
