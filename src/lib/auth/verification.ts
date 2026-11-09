import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { emailVerificationCodes, users } from '@/lib/db/schema';
import { generateCode, hashCode, safeEqualHex } from './crypto';

/** Regras do token de validação (`01_produto/regras-de-negocio/cadastro.md`). */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_WRONG_ATTEMPTS = 5;
const HOUR_MS = 60 * 60 * 1000;

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date; resendAvailableAt: Date }
  /** `wait`: reenvio só após 60 s. `limit`: já houve 5 códigos na última hora. */
  | { ok: false; reason: 'wait' | 'limit'; retryAt: Date };

/**
 * Gera um código novo para o usuário. Respeita o reenvio após 60 s e o limite de 5 códigos por hora
 * (o primeiro código do cadastro também conta). O código anterior ainda ativo deixa de valer.
 */
export async function issueCode(db: Db, userId: string, now = new Date()): Promise<IssueResult> {
  const recent = await db
    .select({ createdAt: emailVerificationCodes.createdAt })
    .from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.userId, userId), gt(emailVerificationCodes.createdAt, new Date(now.getTime() - HOUR_MS))))
    .orderBy(desc(emailVerificationCodes.createdAt));

  if (recent.length >= MAX_CODES_PER_HOUR) {
    const oldest = recent[recent.length - 1].createdAt;
    return { ok: false, reason: 'limit', retryAt: new Date(oldest.getTime() + HOUR_MS) };
  }
  const last = recent[0]?.createdAt;
  if (last && now.getTime() - last.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'wait', retryAt: new Date(last.getTime() + RESEND_COOLDOWN_MS) };
  }

  await db
    .update(emailVerificationCodes)
    .set({ invalidatedAt: now, invalidatedReason: 'replaced' })
    .where(
      and(
        eq(emailVerificationCodes.userId, userId),
        isNull(emailVerificationCodes.usedAt),
        isNull(emailVerificationCodes.invalidatedAt),
      ),
    );

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await db
    .insert(emailVerificationCodes)
    .values({ userId, codeHash: hashCode(userId, code), expiresAt, createdAt: now });
  return { ok: true, code, expiresAt, resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS) };
}

export type VerifyResult =
  | { status: 'ok' }
  | { status: 'wrong'; remaining: number }
  | { status: 'expired' }
  | { status: 'invalidated' }
  /** Menos de 6 dígitos: não conta como tentativa. */
  | { status: 'incomplete' };

/** Confere o código. Acerto: marca o código como usado e valida o e-mail. Erro: conta a tentativa; no 5º erro, invalida o código. */
export async function verifyCode(db: Db, userId: string, code: string, now = new Date()): Promise<VerifyResult> {
  if (!/^\d{6}$/.test(code)) return { status: 'incomplete' };

  const [latest] = await db
    .select()
    .from(emailVerificationCodes)
    .where(eq(emailVerificationCodes.userId, userId))
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);

  if (!latest || latest.usedAt) return { status: 'expired' };
  if (latest.invalidatedReason === 'attempts') return { status: 'invalidated' };
  if (latest.invalidatedAt || latest.expiresAt.getTime() <= now.getTime()) return { status: 'expired' };

  const stillActive = and(
    eq(emailVerificationCodes.id, latest.id),
    isNull(emailVerificationCodes.usedAt),
    isNull(emailVerificationCodes.invalidatedAt),
  );

  if (safeEqualHex(latest.codeHash, hashCode(userId, code))) {
    // Uso único: só um pedido consegue marcar o código como usado.
    const used = await db
      .update(emailVerificationCodes)
      .set({ usedAt: now })
      .where(stillActive)
      .returning({ id: emailVerificationCodes.id });
    if (used.length === 0) return { status: 'expired' };
    await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, userId));
    return { status: 'ok' };
  }

  const [updated] = await db
    .update(emailVerificationCodes)
    .set({ attempts: sql`${emailVerificationCodes.attempts} + 1` })
    .where(stillActive)
    .returning({ attempts: emailVerificationCodes.attempts });
  if (!updated) return { status: 'expired' };

  if (updated.attempts >= MAX_WRONG_ATTEMPTS) {
    await db
      .update(emailVerificationCodes)
      .set({ invalidatedAt: now, invalidatedReason: 'attempts' })
      .where(eq(emailVerificationCodes.id, latest.id));
    return { status: 'invalidated' };
  }
  return { status: 'wrong', remaining: MAX_WRONG_ATTEMPTS - updated.attempts };
}

export interface VerificationState {
  /** `normal`: há um código válido. `expired`: venceu ou não existe. `invalidated`: 5 erros. */
  mode: 'normal' | 'expired' | 'invalidated';
  /** Já houve 5 códigos na última hora: não dá para pedir outro agora. */
  limitReached: boolean;
  /** Quando o reenvio é liberado (60 s depois do último código); nulo se já está liberado. */
  resendAvailableAt: Date | null;
}

export async function getVerificationState(db: Db, userId: string, now = new Date()): Promise<VerificationState> {
  const rows = await db
    .select()
    .from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.userId, userId), gt(emailVerificationCodes.createdAt, new Date(now.getTime() - HOUR_MS))))
    .orderBy(desc(emailVerificationCodes.createdAt));
  const [latest] = rows.length
    ? rows
    : await db
        .select()
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.userId, userId))
        .orderBy(desc(emailVerificationCodes.createdAt))
        .limit(1);

  let mode: VerificationState['mode'] = 'normal';
  if (latest?.invalidatedReason === 'attempts') mode = 'invalidated';
  else if (!latest || latest.usedAt || latest.invalidatedAt || latest.expiresAt.getTime() <= now.getTime()) mode = 'expired';

  const cooldownEnd = latest ? new Date(latest.createdAt.getTime() + RESEND_COOLDOWN_MS) : null;
  return {
    mode,
    limitReached: rows.length >= MAX_CODES_PER_HOUR,
    resendAvailableAt: cooldownEnd && cooldownEnd.getTime() > now.getTime() ? cooldownEnd : null,
  };
}
