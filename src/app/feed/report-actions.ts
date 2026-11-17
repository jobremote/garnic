'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { reportContent } from '@/lib/feed/reports';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ReportActionResult =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; error: 'not-found' | 'own-content' | 'invalid'; errors?: Partial<Record<'reason' | 'details', 'invalid-reason' | 'details-too-long'>> };

/** Denuncia um post, comentário ou usuário. Só registra para revisão (sem esconder nada). */
export async function reportAction(kind: unknown, id: unknown, reason: unknown, details: unknown): Promise<ReportActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  if ((kind !== 'post' && kind !== 'comment' && kind !== 'user') || typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'not-found' };
  if (typeof details === 'string' && details.length > 10_000) return { ok: false, error: 'invalid', errors: { details: 'details-too-long' } };
  return reportContent(await getDb(), user.id, { kind, id }, { reason, details });
}
