import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { passwordResetTokens, users, type User } from '@/lib/db/schema';
import { hashPassword, hashSessionToken, newSessionToken } from './crypto';
import { deleteUserSessions } from './sessions';
import { normalizeEmail, validateNewPassword } from './validation';

/** Regras de recuperar senha (`01_produto/regras-de-negocio/cadastro.md`). */
export const RESET_TTL_MS = 30 * 60 * 1000;
export const RESET_COOLDOWN_MS = 60 * 1000;
export const MAX_RESET_REQUESTS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export interface ResetRequest {
  /** Token em texto: vai só no link do e-mail. No banco fica o hash. */
  token: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
}

/**
 * Pedido de recuperação. Devolve o token para montar o link, ou `null` quando **não deve sair e-mail**:
 * e-mail sem conta, conta não validada, conta sem senha, pedido dentro dos 60 s ou mais de 5 na última hora.
 * Quem chama responde sempre a mesma coisa, haja ou não e-mail, para ninguém descobrir quais e-mails têm conta.
 * Um link novo invalida o anterior.
 */
export async function requestPasswordReset(db: Db, emailInput: string, now = new Date()): Promise<ResetRequest | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(emailInput)))
    .limit(1);
  if (!user || !user.emailVerifiedAt || !user.passwordHash) return null;

  const recent = await db
    .select({ createdAt: passwordResetTokens.createdAt })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, new Date(now.getTime() - HOUR_MS))))
    .orderBy(desc(passwordResetTokens.createdAt));
  if (recent.length >= MAX_RESET_REQUESTS_PER_HOUR) return null;
  if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < RESET_COOLDOWN_MS) return null;

  await invalidateActiveTokens(db, user.id, now);
  const token = newSessionToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    createdAt: now,
  });
  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

function invalidateActiveTokens(db: Db, userId: string, now: Date) {
  return db
    .update(passwordResetTokens)
    .set({ invalidatedAt: now, invalidatedReason: 'replaced' })
    .where(
      and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt), isNull(passwordResetTokens.invalidatedAt)),
    );
}

/** O link ainda vale? Existe, não foi usado, não foi substituído e não passou de 30 minutos. */
export async function findValidResetToken(db: Db, token: string, now = new Date()): Promise<{ id: string; userId: string } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashSessionToken(token)),
        isNull(passwordResetTokens.usedAt),
        isNull(passwordResetTokens.invalidatedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type ResetResult =
  | { ok: true }
  /** Link inválido, usado, substituído ou vencido. */
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'password'; errors: { password?: string; confirmPassword?: string } };

/**
 * Salva a nova senha. Confere o link e as regras da senha **antes** de gastar o link (senha fraca não queima o link).
 * Ao salvar: o link vira usado e todos os logins abertos são encerrados.
 */
export async function resetPassword(
  db: Db,
  token: string,
  password: string,
  confirmPassword: string,
  now = new Date(),
): Promise<ResetResult> {
  const valid = await findValidResetToken(db, token, now);
  if (!valid) return { ok: false, reason: 'invalid' };

  const [user] = await db.select().from(users).where(eq(users.id, valid.userId)).limit(1);
  if (!user) return { ok: false, reason: 'invalid' };

  const errors = validateNewPassword(password, confirmPassword, { username: user.username, email: user.email });
  if (errors.password || errors.confirmPassword) return { ok: false, reason: 'password', errors };

  // Uso único: só um pedido consegue gastar o link.
  const used = await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokens.id, valid.id),
        isNull(passwordResetTokens.usedAt),
        isNull(passwordResetTokens.invalidatedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .returning({ id: passwordResetTokens.id });
  if (used.length === 0) return { ok: false, reason: 'invalid' };

  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  await deleteUserSessions(db, user.id);
  await invalidateActiveTokens(db, user.id, now);
  return { ok: true };
}
