import type { ReportReason } from '@/lib/shelf/screenshot';

/**
 * Motivos de denúncia de post, comentário e usuário. Só na denúncia de usuário entra "parece ter menos de 16 anos"
 * (idade mínima, ECA Digital art. 24, §4; decisão de 27/11/2026): com indícios fortes, a conta é suspensa e o
 * responsável pode pedir revisão.
 */
export const UNDERAGE_REASON = 'underage';
export type ContentReportReason = ReportReason | typeof UNDERAGE_REASON;
export type ReportKind = 'post' | 'comment' | 'user';

const BASE: readonly ContentReportReason[] = ['inappropriate', 'spam', 'spoiler', 'other'];
const USER: readonly ContentReportReason[] = ['inappropriate', 'spam', 'spoiler', UNDERAGE_REASON, 'other'];

export const reportReasonsFor = (kind: ReportKind): readonly ContentReportReason[] => (kind === 'user' ? USER : BASE);
export const isReasonFor = (kind: ReportKind, value: unknown): value is ContentReportReason =>
  typeof value === 'string' && (reportReasonsFor(kind) as readonly string[]).includes(value);
