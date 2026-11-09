import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/connect';
import { emailVerificationCodes, users } from '@/lib/db/schema';
import { createTestDb, validSignup } from '@/test/db';
import { messages } from './messages';
import { createSession, deleteSession, getSessionUser, SESSION_TTL_MS } from './sessions';
import { authenticate, isUsernameTaken, purgeUnverifiedUsers, registerUser, UNVERIFIED_TTL_MS } from './users';
import { getVerificationState, issueCode, verifyCode } from './verification';

const T0 = new Date('2026-11-09T12:00:00.000Z');
const after = (base: Date, ms: number) => new Date(base.getTime() + ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

/** Cria uma conta nova com e-mail e @usuário únicos; devolve o usuário e o código em texto. */
let counter = 0;
async function newAccount(now = T0, overrides: Partial<typeof validSignup> = {}) {
  counter += 1;
  const result = await registerUser(
    db,
    { ...validSignup, username: `usuario${counter}`, email: `usuario${counter}@email.com`, ...overrides },
    now,
  );
  if (!result.ok) throw new Error(`cadastro falhou: ${JSON.stringify(result.errors)}`);
  return result;
}

describe('cadastro por e-mail', () => {
  it('cria a conta sem validar, guarda só o hash da senha e gera o primeiro código', async () => {
    const result = await newAccount();
    const [user] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(validSignup.password);
    expect(user.termsAcceptedAt).toEqual(T0);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.resendAvailableAt).toEqual(after(T0, MIN));

    const [row] = await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id));
    expect(row.codeHash).not.toContain(result.code);
    expect(row.expiresAt).toEqual(after(T0, 10 * MIN));
  });

  it('guarda o nome sem espaços sobrando e recusa nome sem sobrenome', async () => {
    const result = await newAccount(T0, { name: '  Maria   da  Silva ' });
    const [row] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(row.name).toBe('Maria da Silva');

    const only = await registerUser(db, { ...validSignup, username: 'so.um.nome', email: 'so.um.nome@email.com', name: 'Maria' }, T0);
    expect(only).toEqual({ ok: false, errors: { name: messages.signup.nameNames } });
  });

  it('isUsernameTaken diz se o @usuário está em uso e libera o de conta vencida', async () => {
    await newAccount(T0, { username: 'checagem.viva', email: 'checagem.viva@email.com' });
    expect(await isUsernameTaken(db, 'checagem.viva', after(T0, MIN))).toBe(true);
    expect(await isUsernameTaken(db, 'livre.agora', after(T0, MIN))).toBe(false);
    expect(await isUsernameTaken(db, 'checagem.viva', after(T0, UNVERIFIED_TTL_MS + MIN))).toBe(false);
  });

  it('normaliza o e-mail para minúsculas', async () => {
    const result = await newAccount(T0, { email: 'Pessoa.Maiuscula@Email.COM', username: 'pessoa.maiuscula' });
    expect(result.user.email).toBe('pessoa.maiuscula@email.com');
  });

  it('recusa dados inválidos sem criar nada', async () => {
    const result = await registerUser(db, { ...validSignup, username: 'Ana!', email: 'ana@email', acceptedTerms: false }, T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['email', 'terms', 'username']);
    expect(await db.select().from(users).where(eq(users.username, 'Ana!'))).toHaveLength(0);
  });

  it('avisa quando @usuário e e-mail já estão em uso (mensagens do protótipo)', async () => {
    const first = await newAccount(T0, { username: 'em.uso', email: 'em.uso@email.com' });
    expect(first.ok).toBe(true);
    const clash = await registerUser(db, { ...validSignup, username: 'em.uso', email: 'EM.USO@email.com' }, T0);
    expect(clash).toEqual({
      ok: false,
      errors: { username: messages.signup.usernameTaken, email: messages.signup.emailTaken },
    });
  });

  it('exclui contas não validadas após 24 h e libera o e-mail e o @usuário', async () => {
    await newAccount(T0, { username: 'vencida', email: 'vencida@email.com' });
    const again = { ...validSignup, username: 'vencida', email: 'vencida@email.com' };

    const early = await registerUser(db, again, after(T0, UNVERIFIED_TTL_MS - MIN));
    expect(early.ok).toBe(false);

    const late = await registerUser(db, again, after(T0, UNVERIFIED_TTL_MS + MIN));
    expect(late.ok).toBe(true);
  });

  it('purgeUnverifiedUsers apaga só contas não validadas e vencidas', async () => {
    const stale = await newAccount(T0);
    const verified = await newAccount(T0);
    await verifyCode(db, verified.user.id, verified.code, after(T0, MIN));
    const fresh = await newAccount(after(T0, 23 * HOUR));

    const deleted = await purgeUnverifiedUsers(db, after(T0, 25 * HOUR));
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(users).where(eq(users.id, stale.user.id))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, verified.user.id))).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, fresh.user.id))).toHaveLength(1);
    // os códigos da conta apagada saem junto (cascata)
    expect(await db.select().from(emailVerificationCodes).where(eq(emailVerificationCodes.userId, stale.user.id))).toHaveLength(0);
  });
});

describe('validação do e-mail por código', () => {
  it('o código certo valida o e-mail e só vale uma vez', async () => {
    const { user, code } = await newAccount();
    expect(await verifyCode(db, user.id, code, after(T0, 2 * MIN))).toEqual({ status: 'ok' });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.emailVerifiedAt).toEqual(after(T0, 2 * MIN));
    expect(await verifyCode(db, user.id, code, after(T0, 3 * MIN))).toEqual({ status: 'expired' });
  });

  it('vale por 10 minutos', async () => {
    const a = await newAccount();
    expect(await verifyCode(db, a.user.id, a.code, after(T0, 10 * MIN - SEC))).toEqual({ status: 'ok' });
    const b = await newAccount();
    expect(await verifyCode(db, b.user.id, b.code, after(T0, 10 * MIN))).toEqual({ status: 'expired' });
  });

  it('código errado conta tentativa e mostra quantas restam', async () => {
    const { user, code } = await newAccount();
    const wrong = code === '000000' ? '000001' : '000000';
    expect(await verifyCode(db, user.id, wrong, T0)).toEqual({ status: 'wrong', remaining: 4 });
    expect(await verifyCode(db, user.id, wrong, T0)).toEqual({ status: 'wrong', remaining: 3 });
    expect(await verifyCode(db, user.id, code, T0)).toEqual({ status: 'ok' });
  });

  it('5 erros invalidam o código, mesmo que o certo venha depois', async () => {
    const { user, code } = await newAccount();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let remaining = 4; remaining >= 1; remaining -= 1) {
      expect(await verifyCode(db, user.id, wrong, T0)).toEqual({ status: 'wrong', remaining });
    }
    expect(await verifyCode(db, user.id, wrong, T0)).toEqual({ status: 'invalidated' });
    expect(await verifyCode(db, user.id, code, T0)).toEqual({ status: 'invalidated' });
    expect((await getVerificationState(db, user.id, T0)).mode).toBe('invalidated');
  });

  it('menos de 6 dígitos não conta como tentativa', async () => {
    const { user, code } = await newAccount();
    expect(await verifyCode(db, user.id, '12345', T0)).toEqual({ status: 'incomplete' });
    expect(await verifyCode(db, user.id, 'abcdef', T0)).toEqual({ status: 'incomplete' });
    expect(await verifyCode(db, user.id, code, T0)).toEqual({ status: 'ok' });
  });

  it('um código novo invalida o anterior e zera as tentativas', async () => {
    const { user, code: first } = await newAccount();
    const wrong = first === '000000' ? '000001' : '000000';
    await verifyCode(db, user.id, wrong, T0);

    const second = await issueCode(db, user.id, after(T0, MIN));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(await verifyCode(db, user.id, first, after(T0, MIN))).toMatchObject({ status: 'wrong', remaining: 4 });
    expect(await verifyCode(db, user.id, second.code, after(T0, MIN))).toEqual({ status: 'ok' });
  });

  it('descreve o estado para a tela (código válido, vencido, reenvio em espera)', async () => {
    const { user } = await newAccount();
    expect(await getVerificationState(db, user.id, after(T0, 42 * SEC))).toEqual({
      mode: 'normal',
      limitReached: false,
      resendAvailableAt: after(T0, MIN),
    });
    expect(await getVerificationState(db, user.id, after(T0, 11 * MIN))).toEqual({
      mode: 'expired',
      limitReached: false,
      resendAvailableAt: null,
    });
  });
});

describe('reenvio do código', () => {
  it('só libera o reenvio 60 segundos depois do último código', async () => {
    const { user } = await newAccount();
    expect(await issueCode(db, user.id, after(T0, 59 * SEC))).toEqual({ ok: false, reason: 'wait', retryAt: after(T0, MIN) });
    expect((await issueCode(db, user.id, after(T0, MIN))).ok).toBe(true);
  });

  it('permite no máximo 5 códigos por hora (o primeiro do cadastro conta)', async () => {
    const { user } = await newAccount();
    for (let i = 1; i <= 4; i += 1) expect((await issueCode(db, user.id, after(T0, i * MIN))).ok).toBe(true);

    const blocked = await issueCode(db, user.id, after(T0, 5 * MIN));
    expect(blocked).toEqual({ ok: false, reason: 'limit', retryAt: after(T0, HOUR) });
    expect((await getVerificationState(db, user.id, after(T0, 5 * MIN))).limitReached).toBe(true);

    expect((await issueCode(db, user.id, after(T0, HOUR + SEC))).ok).toBe(true);
  });
});

describe('login', () => {
  it('entra com e-mail e senha de conta validada, sem diferenciar maiúsculas no e-mail', async () => {
    const { user, code } = await newAccount(T0, { email: 'login.ok@email.com', username: 'login.ok' });
    await verifyCode(db, user.id, code, T0);
    const found = await authenticate(db, '  LOGIN.OK@email.com ', validSignup.password);
    expect(found?.id).toBe(user.id);
  });

  it('devolve null para senha errada, e-mail desconhecido e conta não validada', async () => {
    const verified = await newAccount(T0, { email: 'v@email.com', username: 'verificada' });
    await verifyCode(db, verified.user.id, verified.code, T0);
    await newAccount(T0, { email: 'nv@email.com', username: 'naovalidada' });

    expect(await authenticate(db, 'v@email.com', 'Senha#errada1')).toBeNull();
    expect(await authenticate(db, 'ninguem@email.com', validSignup.password)).toBeNull();
    expect(await authenticate(db, 'nv@email.com', validSignup.password)).toBeNull();
  });
});

describe('sessões', () => {
  it('cria, lê e apaga a sessão; no banco fica só o hash do token', async () => {
    const { user, code } = await newAccount();
    await verifyCode(db, user.id, code, T0);
    const { token, expiresAt } = await createSession(db, user.id, T0);
    expect(expiresAt).toEqual(after(T0, SESSION_TTL_MS));

    expect((await getSessionUser(db, token, after(T0, HOUR)))?.id).toBe(user.id);
    expect(await getSessionUser(db, 'token-inexistente', T0)).toBeNull();

    await deleteSession(db, token);
    expect(await getSessionUser(db, token, T0)).toBeNull();
  });

  it('a sessão vence depois de 30 dias', async () => {
    const { user, code } = await newAccount();
    await verifyCode(db, user.id, code, T0);
    const { token } = await createSession(db, user.id, T0);
    expect(await getSessionUser(db, token, after(T0, SESSION_TTL_MS - SEC))).not.toBeNull();
    expect(await getSessionUser(db, token, after(T0, SESSION_TTL_MS))).toBeNull();
  });

  it('conta não validada não tem sessão utilizável', async () => {
    const { user } = await newAccount();
    const { token } = await createSession(db, user.id, T0);
    expect(await getSessionUser(db, token, T0)).toBeNull();
  });
});
