import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { games, screenshotReports, shelfEntries } from '@/lib/db/schema';
import { isShelfStatus, type ShelfStatus } from './status';
import { tagsByEntry, type TagView } from './tags';

/** Ver a entrada de qualquer pessoa e denunciar a screenshot (`01_produto/regras-de-negocio/gameshelf.md`). */

export const REPORT_REASONS = ['inappropriate', 'spam', 'spoiler', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const isReportReason = (value: unknown): value is ReportReason => typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
export const REPORT_DETAILS_MAX = 500;

/** O que qualquer pessoa logada vê de uma entrada. A screenshot é pública; a review fica atrás do aviso de spoiler. */
export interface PublicEntry {
  entryId: string;
  ownerId: string;
  status: ShelfStatus;
  platform: string | null;
  rating: number | null;
  review: string | null;
  reviewSpoiler: boolean;
  started: { month: number | null; year: number | null };
  ended: { month: number | null; year: number | null };
  playMinutes: number | null;
  screenshotRef: string | null;
  screenshotSpoiler: boolean;
  tags: TagView[];
  game: { name: string; releasedAt: Date | null; coverImageId: string | null };
  /** Se quem está vendo já denunciou a screenshot atual. */
  reportedByViewer: boolean;
}

export async function getPublicEntry(db: Db, viewerId: string, entryId: string): Promise<PublicEntry | null> {
  const [row] = await db
    .select({ entry: shelfEntries, game: games })
    .from(shelfEntries)
    .innerJoin(games, eq(games.id, shelfEntries.gameId))
    .where(eq(shelfEntries.id, entryId))
    .limit(1);
  if (!row || !isShelfStatus(row.entry.status)) return null;
  const { entry, game } = row;

  let reportedByViewer = false;
  if (entry.screenshotRef) {
    const [report] = await db
      .select({ id: screenshotReports.id })
      .from(screenshotReports)
      .where(and(eq(screenshotReports.reporterId, viewerId), eq(screenshotReports.screenshotRef, entry.screenshotRef)))
      .limit(1);
    reportedByViewer = Boolean(report);
  }
  return {
    entryId: entry.id,
    ownerId: entry.userId,
    status: entry.status as ShelfStatus,
    platform: entry.platform,
    rating: entry.rating,
    review: entry.review,
    reviewSpoiler: entry.reviewSpoiler,
    started: { month: entry.startedMonth, year: entry.startedYear },
    ended: { month: entry.endedMonth, year: entry.endedYear },
    playMinutes: entry.playMinutes,
    screenshotRef: entry.screenshotRef,
    screenshotSpoiler: entry.screenshotSpoiler,
    tags: (await tagsByEntry(db, [entry.id])).get(entry.id) ?? [],
    game: { name: game.name, releasedAt: game.releasedAt, coverImageId: game.coverImageId },
    reportedByViewer,
  };
}

export type ReportResult =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; error: 'not-found' | 'own-entry' | 'invalid'; errors?: Partial<Record<'reason' | 'details', 'invalid-reason' | 'details-too-long'>> };

/**
 * Registra a denúncia da screenshot atual de uma entrada. Só registra: não esconde a imagem. Não dá para denunciar a
 * própria screenshot, nem uma entrada sem screenshot. Denunciar de novo a mesma imagem não duplica (devolve
 * `alreadyReported`).
 */
export async function reportScreenshot(
  db: Db,
  reporterId: string,
  entryId: string,
  input: { reason: unknown; details?: unknown },
): Promise<ReportResult> {
  const [entry] = await db
    .select({ id: shelfEntries.id, userId: shelfEntries.userId, screenshotRef: shelfEntries.screenshotRef })
    .from(shelfEntries)
    .where(eq(shelfEntries.id, entryId))
    .limit(1);
  if (!entry || !entry.screenshotRef) return { ok: false, error: 'not-found' };
  if (entry.userId === reporterId) return { ok: false, error: 'own-entry' };

  const errors: Partial<Record<'reason' | 'details', 'invalid-reason' | 'details-too-long'>> = {};
  if (!isReportReason(input.reason)) errors.reason = 'invalid-reason';
  const details = typeof input.details === 'string' ? input.details.replace(/\s+/g, ' ').trim() : '';
  if (details.length > REPORT_DETAILS_MAX) errors.details = 'details-too-long';
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };

  const created = await db
    .insert(screenshotReports)
    .values({ entryId: entry.id, screenshotRef: entry.screenshotRef, reporterId, reason: input.reason as ReportReason, details: details === '' ? null : details })
    .onConflictDoNothing({ target: [screenshotReports.reporterId, screenshotReports.screenshotRef] })
    .returning({ id: screenshotReports.id });
  return { ok: true, alreadyReported: created.length === 0 };
}
