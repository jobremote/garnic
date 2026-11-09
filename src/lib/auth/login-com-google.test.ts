import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/connect';
import { oauthAccounts, users } from '@/lib/db/schema';
import { createTestDb, validSignup } from '@/test/db';
import {
  cleanGoogleName,
  completeGoogleSignup,
  linkGoogleAccount,
  profileFromClaims,
  resolveGoogleSignIn,
  type GoogleProfile,
} from './google';
import { messages } from './messages';
import { authenticate, registerUser } from './users';
import { verifyCode } from './verification';

const T0 = new Date('2026-11-09T12:00:00.000Z');
const CLIENT_ID = 'cliente-123.apps.googleusercontent.com';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
const nextProfile = (overrides: Partial<GoogleProfile> = {}): GoogleProfile => {
  counter += 1;
  return { sub: `google-sub-${counter}`, email: `pessoa${counter}@gmail.com`, name: `Pessoa Número${counter}`, ...overrides };
};

/** Conta por e-mail e senha, com o e-mail validado (ou não). */
async function emailAccount(email: string, verified: boolean) {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `conta${counter}`, email }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  if (verified) await verifyCode(db, result.user.id, result.code, T0);
  return result.user;
}

const claims = (extra: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '110169484474386276334',
  email: 'Ana@Gmail.com',
  email_verified: true,
  name: '  Ana   Souza ',
  ...extra,
});

describe('dados vindos do Google', () => {
  it('aceita um id token válido e normaliza e-mail e nome', () => {
    expect(profileFromClaims(claims(), CLIENT_ID)).toEqual({ sub: '110169484474386276334', email: 'ana@gmail.com', name: 'Ana Souza' });
  });

  it('só entra com e-mail verificado pelo Google', () => {
    expect(profileFromClaims(claims({ email_verified: false }), CLIENT_ID)).toBeNull();
    expect(profileFromClaims(claims({ email_verified: 'true' }), CLIENT_ID)).toBeNull();
    expect(profileFromClaims(claims({ email_verified: undefined }), CLIENT_ID)).toBeNull();
  });

  it('recusa dado faltando, emissor errado e token feito para outro aplicativo', () => {
    expect(profileFromClaims(claims({ sub: undefined }), CLIENT_ID)).toBeNull();
    expect(profileFromClaims(claims({ email: '' }), CLIENT_ID)).toBeNull();
    expect(profileFromClaims(claims({ iss: 'https://evil.example.com' }), CLIENT_ID)).toBeNull();
    expect(profileFromClaims(claims({ aud: 'outro-cliente' }), CLIENT_ID)).toBeNull();
    expect(profileFromClaims(null, CLIENT_ID)).toBeNull();
    expect(profileFromClaims('texto', CLIENT_ID)).toBeNull();
    expect(profileFromClaims(claims({ iss: 'accounts.google.com' }), CLIENT_ID)).not.toBeNull();
    expect(profileFromClaims(claims({ aud: ['x', CLIENT_ID] }), CLIENT_ID)).not.toBeNull();
  });

  it('no Google simulado (sem cliente) não confere emissor nem público', () => {
    expect(profileFromClaims({ sub: 's', email: 'a@b.co', email_verified: true, name: 'A' }, null)).not.toBeNull();
  });

  it('o nome vem do Google como está: só aparado, com limite de 100 caracteres e sem exigir sobrenome', () => {
    expect(cleanGoogleName('  Madonna ', 'm@x.com')).toBe('Madonna');
    expect(cleanGoogleName('Ana   Maria  Souza', 'a@x.com')).toBe('Ana Maria Souza');
    expect(cleanGoogleName('x'.repeat(150), 'a@x.com')).toHaveLength(100);
    expect(cleanGoogleName('', 'ana.souza@x.com')).toBe('ana.souza');
    expect(cleanGoogleName(undefined, 'joao@x.com')).toBe('joao');
  });
});

describe('o que fazer com quem voltou do Google', () => {
  it('e-mail novo: cadastro (escolher @usuário)', async () => {
    expect(await resolveGoogleSignIn(db, nextProfile())).toEqual({ kind: 'signup' });
  });

  it('e-mail de conta existente e validada: vincular com senha', async () => {
    const account = await emailAccount('existente@email.com', true);
    expect(await resolveGoogleSignIn(db, nextProfile({ email: account.email }))).toEqual({ kind: 'link' });
  });

  it('e-mail de conta que nunca validou: descarta a pendente e segue como cadastro novo', async () => {
    const pending = await emailAccount('pendente@email.com', false);
    expect(await resolveGoogleSignIn(db, nextProfile({ email: pending.email }))).toEqual({ kind: 'signup' });
    expect(await db.select().from(users).where(eq(users.id, pending.id))).toHaveLength(0);
  });
});

describe('cadastro com Google', () => {
  it('cria a conta: e-mail já validado, sem senha, termos aceitos e Google vinculado', async () => {
    const profile = nextProfile({ name: 'Madonna' });
    const result = await completeGoogleSignup(db, profile, { username: 'madonna.ciccone', acceptedTerms: true }, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({ name: 'Madonna', username: 'madonna.ciccone', email: profile.email, passwordHash: null });
    expect(result.user.emailVerifiedAt).toEqual(T0);
    expect(result.user.termsAcceptedAt).toEqual(T0);
    const [link] = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, result.user.id));
    expect(link).toMatchObject({ provider: 'google', providerAccountId: profile.sub });

    // na próxima vez, entra direto
    expect(await resolveGoogleSignIn(db, profile)).toMatchObject({ kind: 'login', user: { id: result.user.id } });
  });

  it('exige @usuário válido, livre e termos aceitos, com as mensagens do cadastro', async () => {
    const profile = nextProfile();
    expect(await completeGoogleSignup(db, profile, { username: 'Ana Souza!', acceptedTerms: true }, T0)).toEqual({
      ok: false,
      errors: { username: messages.signup.usernameFormat },
    });
    expect(await completeGoogleSignup(db, profile, { username: 'admin', acceptedTerms: true }, T0)).toMatchObject({
      errors: { username: messages.signup.usernameReserved },
    });
    expect(await completeGoogleSignup(db, profile, { username: 'livre.mas.sem.termos', acceptedTerms: false }, T0)).toMatchObject({
      errors: { terms: messages.signup.termsRequired },
    });
    // @usuário já em uso (de outra conta)
    const taken = await emailAccount('dono.do.nome@email.com', true);
    const [row] = await db.select().from(users).where(eq(users.id, taken.id));
    expect(await completeGoogleSignup(db, profile, { username: row.username, acceptedTerms: true }, T0)).toMatchObject({
      errors: { username: messages.signup.usernameTaken },
    });
    // nada foi criado
    expect(await db.select().from(users).where(eq(users.email, profile.email))).toHaveLength(0);
  });

  it('se a situação mudou no meio do caminho, não cria conta duplicada', async () => {
    const profile = nextProfile();
    const first = await completeGoogleSignup(db, profile, { username: 'primeira.vez', acceptedTerms: true }, T0);
    expect(first.ok).toBe(true);
    // a mesma conta do Google tentando criar de novo (por exemplo, duas abas)
    const second = await completeGoogleSignup(db, profile, { username: 'segunda.vez', acceptedTerms: true }, T0);
    expect(second).toMatchObject({ ok: false, reason: 'changed', resolution: { kind: 'login' } });

    // outro Google com o e-mail de uma conta validada nesse meio-tempo
    const other = await emailAccount('ganhou.conta@email.com', true);
    const third = await completeGoogleSignup(db, nextProfile({ email: other.email }), { username: 'terceira.vez', acceptedTerms: true }, T0);
    expect(third).toMatchObject({ ok: false, reason: 'changed', resolution: { kind: 'link' } });
  });
});

describe('vincular o Google a uma conta existente', () => {
  it('com a senha certa vincula; depois entra pelo Google e continua entrando por e-mail e senha', async () => {
    const account = await emailAccount('vincula@email.com', true);
    const profile = nextProfile({ email: account.email });

    const result = await linkGoogleAccount(db, profile, validSignup.password, T0);
    expect(result).toMatchObject({ ok: true, user: { id: account.id } });
    expect(await resolveGoogleSignIn(db, profile)).toMatchObject({ kind: 'login', user: { id: account.id } });
    expect((await authenticate(db, account.email, validSignup.password))?.id).toBe(account.id);
  });

  it('com a senha errada não vincula nada', async () => {
    const account = await emailAccount('naovincula@email.com', true);
    const profile = nextProfile({ email: account.email });
    expect(await linkGoogleAccount(db, profile, 'Senha#errada1', T0)).toEqual({ ok: false, reason: 'password' });
    expect(await linkGoogleAccount(db, profile, '', T0)).toEqual({ ok: false, reason: 'password' });
    expect(await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, account.id))).toHaveLength(0);
  });

  it('não vincula conta inexistente nem conta não validada', async () => {
    expect(await linkGoogleAccount(db, nextProfile({ email: 'ninguem@gmail.com' }), validSignup.password, T0)).toEqual({
      ok: false,
      reason: 'not_linkable',
    });
    const pending = await emailAccount('pendente.vincula@email.com', false);
    expect(await linkGoogleAccount(db, nextProfile({ email: pending.email }), validSignup.password, T0)).toEqual({
      ok: false,
      reason: 'not_linkable',
    });
  });

  it('uma conta do Google que já é de outro usuário não pode ser vinculada a esta', async () => {
    const owner = await completeGoogleSignup(db, nextProfile(), { username: 'dona.do.google', acceptedTerms: true }, T0);
    if (!owner.ok) throw new Error('cadastro falhou');
    const ownerLink = (await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, owner.user.id)))[0];

    const account = await emailAccount('outra.conta@email.com', true);
    const result = await linkGoogleAccount(db, { sub: ownerLink.providerAccountId, email: account.email, name: 'X' }, validSignup.password, T0);
    expect(result).toEqual({ ok: false, reason: 'not_linkable' });
  });

  it('conta só com Google (sem senha) não aceita vínculo por senha', async () => {
    const google = await completeGoogleSignup(db, nextProfile(), { username: 'so.google', acceptedTerms: true }, T0);
    if (!google.ok) throw new Error('cadastro falhou');
    expect(await linkGoogleAccount(db, nextProfile({ email: google.user.email }), 'Qualquer#Senha1', T0)).toEqual({
      ok: false,
      reason: 'password',
    });
  });
});
