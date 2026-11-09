import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/connect';
import { passwordResetTokens, sessions, users } from '@/lib/db/schema';
import { createTestDb, validSignup } from '@/test/db';
import { messages } from './messages';
import {
  findValidResetToken,
  MAX_RESET_REQUESTS_PER_HOUR,
  requestPasswordReset,
  resetPassword,
  RESET_COOLDOWN_MS,
  RESET_TTL_MS,
} from './password-reset';
import { createSession, getSessionUser } from './sessions';
import { authenticate, registerUser } from './users';
import { verifyCode } from './verification';

const T0 = new Date('2026-11-09T12:00:00.000Z');
const after = (ms: number, base = T0) => new Date(base.getTime() + ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const NEW_PASSWORD = 'Nova#Senha7x';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
/** Conta com e-mail validado e senha `validSignup.password`. */
async function verifiedAccount(overrides: Partial<typeof validSignup> = {}) {
  counter += 1;
  const input = { ...validSignup, username: `recupera${counter}`, email: `recupera${counter}@email.com`, ...overrides };
  const result = await registerUser(db, input, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await verifyCode(db, result.user.id, result.code, T0);
  return { ...result.user, username: input.username };
}

describe('pedido de recuperação', () => {
  it('conta validada recebe um token de 30 minutos e só o hash é guardado', async () => {
    const account = await verifiedAccount();
    const request = await requestPasswordReset(db, account.email, T0);
    expect(request?.user.id).toBe(account.id);
    expect(request?.token.length).toBeGreaterThanOrEqual(40);

    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, account.id));
    expect(row.tokenHash).not.toBe(request?.token);
    expect(row.expiresAt).toEqual(after(RESET_TTL_MS));
    expect(RESET_TTL_MS).toBe(30 * MIN);
  });

  it('não gera token (e portanto não envia e-mail) para e-mail sem conta, conta não validada e conta sem senha', async () => {
    expect(await requestPasswordReset(db, 'ninguem@email.com', T0)).toBeNull();

    counter += 1;
    const pending = await registerUser(db, { ...validSignup, username: `pendente${counter}`, email: `pendente${counter}@email.com` }, T0);
    if (!pending.ok) throw new Error('cadastro falhou');
    expect(await requestPasswordReset(db, pending.user.email, T0)).toBeNull();

    const google = await verifiedAccount();
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, google.id));
    expect(await requestPasswordReset(db, google.email, T0)).toBeNull();
  });

  it('ignora maiúsculas e espaços no e-mail', async () => {
    const account = await verifiedAccount();
    const request = await requestPasswordReset(db, `  ${account.email.toUpperCase()} `, T0);
    expect(request?.user.id).toBe(account.id);
  });

  it('espera 60 segundos entre pedidos', async () => {
    const account = await verifiedAccount();
    expect(await requestPasswordReset(db, account.email, T0)).not.toBeNull();
    expect(await requestPasswordReset(db, account.email, after(RESET_COOLDOWN_MS - SEC))).toBeNull();
    expect(await requestPasswordReset(db, account.email, after(RESET_COOLDOWN_MS))).not.toBeNull();
  });

  it('aceita no máximo 5 pedidos por hora e libera depois', async () => {
    const account = await verifiedAccount();
    for (let i = 0; i < MAX_RESET_REQUESTS_PER_HOUR; i += 1) {
      expect(await requestPasswordReset(db, account.email, after(i * MIN)), `pedido ${i + 1}`).not.toBeNull();
    }
    expect(await requestPasswordReset(db, account.email, after(5 * MIN))).toBeNull();
    expect(await requestPasswordReset(db, account.email, after(HOUR + SEC))).not.toBeNull();
  });

  it('um link novo invalida o anterior', async () => {
    const account = await verifiedAccount();
    const first = await requestPasswordReset(db, account.email, T0);
    const second = await requestPasswordReset(db, account.email, after(MIN));
    expect(await findValidResetToken(db, first!.token, after(MIN))).toBeNull();
    expect(await findValidResetToken(db, second!.token, after(MIN))).not.toBeNull();
  });
});

describe('validade do link', () => {
  it('vale por 30 minutos', async () => {
    const account = await verifiedAccount();
    const { token } = (await requestPasswordReset(db, account.email, T0))!;
    expect(await findValidResetToken(db, token, after(30 * MIN - SEC))).not.toBeNull();
    expect(await findValidResetToken(db, token, after(30 * MIN))).toBeNull();
  });

  it('token desconhecido ou vazio não vale', async () => {
    expect(await findValidResetToken(db, 'token-que-nao-existe', T0)).toBeNull();
    expect(await findValidResetToken(db, '', T0)).toBeNull();
  });
});

describe('nova senha', () => {
  it('troca a senha: a nova entra, a antiga não, e o link não vale mais', async () => {
    const account = await verifiedAccount();
    const { token } = (await requestPasswordReset(db, account.email, T0))!;

    expect(await resetPassword(db, token, NEW_PASSWORD, NEW_PASSWORD, after(MIN))).toEqual({ ok: true });
    expect((await authenticate(db, account.email, NEW_PASSWORD))?.id).toBe(account.id);
    expect(await authenticate(db, account.email, validSignup.password)).toBeNull();
    // uso único
    expect(await resetPassword(db, token, 'Outra#Senha8y', 'Outra#Senha8y', after(2 * MIN))).toEqual({ ok: false, reason: 'invalid' });
    expect((await authenticate(db, account.email, NEW_PASSWORD))?.id).toBe(account.id);
  });

  it('encerra todos os logins abertos', async () => {
    const account = await verifiedAccount();
    const a = await createSession(db, account.id, T0);
    const b = await createSession(db, account.id, T0);
    expect(await getSessionUser(db, a.token, T0)).not.toBeNull();

    const { token } = (await requestPasswordReset(db, account.email, T0))!;
    await resetPassword(db, token, NEW_PASSWORD, NEW_PASSWORD, after(MIN));

    expect(await getSessionUser(db, a.token, after(MIN))).toBeNull();
    expect(await getSessionUser(db, b.token, after(MIN))).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, account.id))).toHaveLength(0);
  });

  it('senha fora das regras mostra o erro e NÃO gasta o link', async () => {
    const account = await verifiedAccount();
    const { token } = (await requestPasswordReset(db, account.email, T0))!;

    expect(await resetPassword(db, token, 'fraca', 'fraca', after(MIN))).toEqual({
      ok: false,
      reason: 'password',
      errors: { password: messages.signup.passwordWeak },
    });
    expect(await resetPassword(db, token, 'Senha@123', 'Senha@123', after(MIN))).toMatchObject({
      errors: { password: messages.signup.passwordCommon },
    });
    expect(await resetPassword(db, token, NEW_PASSWORD, 'Diferente#9z', after(MIN))).toMatchObject({
      errors: { confirmPassword: messages.signup.confirmMismatch },
    });
    expect(await resetPassword(db, token, '', '', after(MIN))).toMatchObject({ errors: { password: messages.signup.passwordRequired } });

    // o link continua valendo e a senha antiga continua a mesma
    expect(await findValidResetToken(db, token, after(MIN))).not.toBeNull();
    expect((await authenticate(db, account.email, validSignup.password))?.id).toBe(account.id);
  });

  it('a nova senha não pode ser igual ao @usuário nem ao e-mail da conta', async () => {
    // "." e "_" valem como caractere especial; sem diferenciar maiúsculas, a senha vira igual ao @usuário.
    const account = await verifiedAccount({ username: `zeca.silva_${counter}` });
    const { token } = (await requestPasswordReset(db, account.email, T0))!;
    const sameAsUsername = account.username.replace(/^z/, 'Z').replace('.s', '.S'); // "Zeca.Silva_N"
    expect(sameAsUsername.toLowerCase()).toBe(account.username);
    expect(await resetPassword(db, token, sameAsUsername, sameAsUsername, after(MIN))).toMatchObject({
      reason: 'password',
      errors: { password: messages.signup.passwordSameAsIdentity },
    });
    expect(await findValidResetToken(db, token, after(MIN))).not.toBeNull();
  });

  it('link vencido ou desconhecido: "invalid", sem trocar nada', async () => {
    const account = await verifiedAccount();
    const { token } = (await requestPasswordReset(db, account.email, T0))!;
    expect(await resetPassword(db, token, NEW_PASSWORD, NEW_PASSWORD, after(30 * MIN))).toEqual({ ok: false, reason: 'invalid' });
    expect(await resetPassword(db, 'qualquer', NEW_PASSWORD, NEW_PASSWORD, T0)).toEqual({ ok: false, reason: 'invalid' });
    expect((await authenticate(db, account.email, validSignup.password))?.id).toBe(account.id);
  });
});
