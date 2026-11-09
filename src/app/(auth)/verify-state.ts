import type { Db } from '@/lib/db/connect';
import { getVerificationState } from '@/lib/auth/verification';
import type { VerifyState } from './state';

/** Monta o estado da tela de validação a partir do banco (usado ao abrir a tela e depois de cada ação). */
export async function buildVerifyState(
  db: Db,
  userId: string,
  extra: { codeError?: string; sent?: boolean } = {},
  now = new Date(),
): Promise<VerifyState> {
  const state = await getVerificationState(db, userId, now);
  return {
    mode: state.mode,
    limitReached: state.limitReached,
    resendInSeconds: state.resendAvailableAt ? Math.ceil((state.resendAvailableAt.getTime() - now.getTime()) / 1000) : 0,
    codeError: extra.codeError,
    sent: extra.sent ?? false,
    nonce: now.getTime(),
  };
}
