import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { comments, posts, reports, users } from '@/lib/db/schema';
import { REPORT_DETAILS_MAX } from '@/lib/shelf/screenshot';
import { isReasonFor, type ContentReportReason } from './report-reasons';

/**
 * Denúncia de post, comentário e usuário (`01_produto/regras-de-negocio/feed.md`, entrega 3). Só registra para revisão:
 * não esconde nada. Motivo obrigatório e detalhes opcionais (até 500 caracteres), como na denúncia de screenshot.
 */
export type ReportTarget = { kind: 'post' | 'comment' | 'user'; id: string };

export type ReportFieldError = 'invalid-reason' | 'details-too-long';

export type ContentReportResult =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; error: 'not-found' | 'own-content' | 'invalid'; errors?: Partial<Record<'reason' | 'details', ReportFieldError>> };

/**
 * Registra a denúncia. Não dá para denunciar o que é seu (post, comentário ou perfil), nem um comentário excluído, nem
 * uma conta não validada. Denunciar o mesmo alvo de novo não duplica (devolve `alreadyReported`).
 */
export async function reportContent(db: Db, reporterId: string, target: ReportTarget, input: { reason: unknown; details?: unknown }): Promise<ContentReportResult> {
  let authorId: string | undefined;
  if (target.kind === 'post') {
    [{ authorId } = { authorId: undefined }] = await db.select({ authorId: posts.userId }).from(posts).where(eq(posts.id, target.id)).limit(1);
  } else if (target.kind === 'comment') {
    [{ authorId } = { authorId: undefined }] = await db
      .select({ authorId: comments.userId })
      .from(comments)
      .where(and(eq(comments.id, target.id), isNull(comments.deletedAt)))
      .limit(1);
  } else {
    [{ authorId } = { authorId: undefined }] = await db
      .select({ authorId: users.id })
      .from(users)
      .where(and(eq(users.id, target.id), isNotNull(users.emailVerifiedAt)))
      .limit(1);
  }
  if (!authorId) return { ok: false, error: 'not-found' };
  if (authorId === reporterId) return { ok: false, error: 'own-content' };

  const errors: Partial<Record<'reason' | 'details', ReportFieldError>> = {};
  if (!isReasonFor(target.kind, input.reason)) errors.reason = 'invalid-reason';
  const details = typeof input.details === 'string' ? input.details.replace(/\s+/g, ' ').trim() : '';
  if (details.length > REPORT_DETAILS_MAX) errors.details = 'details-too-long';
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };

  const base = { reporterId, reason: input.reason as ContentReportReason, details: details === '' ? null : details };
  const created =
    target.kind === 'post'
      ? await db.insert(reports).values({ ...base, postId: target.id }).onConflictDoNothing({ target: [reports.reporterId, reports.postId] }).returning({ id: reports.id })
      : target.kind === 'comment'
        ? await db.insert(reports).values({ ...base, commentId: target.id }).onConflictDoNothing({ target: [reports.reporterId, reports.commentId] }).returning({ id: reports.id })
        : await db.insert(reports).values({ ...base, reportedUserId: target.id }).onConflictDoNothing({ target: [reports.reporterId, reports.reportedUserId] }).returning({ id: reports.id });
  return { ok: true, alreadyReported: created.length === 0 };
}
