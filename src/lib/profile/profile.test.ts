import { and, asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { profileNameChanges, users } from '@/lib/db/schema';
import { createTestDb, validSignup } from '@/test/db';
import { BIO_MAX, getEditLocks, getPublicProfile, normalizeBio, updateProfile } from './profile';

const T0 = new Date('2026-11-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const after = (base: Date, ms: number) => new Date(base.getTime() + ms);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
/** Conta nova com e-mail validado. */
async function verifiedAccount(now = T0) {
  counter += 1;
  const result = await registerUser(
    db,
    { ...validSignup, name: 'Ana Souza', username: `ana${counter}`, email: `ana${counter}@email.com` },
    now,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, result.user.id));
  return { id: result.user.id, username: `ana${counter}` };
}

const history = (userId: string, field: 'name' | 'username') =>
  db
    .select()
    .from(profileNameChanges)
    .where(and(eq(profileNameChanges.userId, userId), eq(profileNameChanges.field, field)))
    .orderBy(asc(profileNameChanges.changedAt));

describe('histórico inicial', () => {
  it('o cadastro grava nome e @usuário iniciais, sem valor anterior', async () => {
    const { id, username } = await verifiedAccount();
    expect(await history(id, 'name')).toMatchObject([{ oldValue: null, newValue: 'Ana Souza' }]);
    expect(await history(id, 'username')).toMatchObject([{ oldValue: null, newValue: username }]);
  });
});

describe('ver perfil', () => {
  it('devolve só o que é público', async () => {
    const { username } = await verifiedAccount();
    const profile = await getPublicProfile(db, username);
    expect(profile).toMatchObject({ name: 'Ana Souza', username, bio: null, avatarKey: null, coverKey: null });
    expect(Object.keys(profile!).sort()).toEqual(['avatarKey', 'bio', 'coverKey', 'id', 'name', 'username']);
  });

  it('conta que não validou o e-mail e @usuário inexistente não têm perfil', async () => {
    counter += 1;
    const pending = await registerUser(db, { ...validSignup, username: `pendente${counter}`, email: `p${counter}@email.com` }, T0);
    expect(pending.ok).toBe(true);
    expect(await getPublicProfile(db, `pendente${counter}`)).toBeNull();
    expect(await getPublicProfile(db, 'ninguem.assim')).toBeNull();
  });
});

describe('editar perfil', () => {
  it('salva a bio sem mexer no histórico', async () => {
    const { id, username } = await verifiedAccount();
    const result = await updateProfile(db, id, { name: 'Ana Souza', username, bio: '  Zerando\num clássico por mês.  ' }, T0);
    expect(result.ok).toBe(true);
    expect((await getPublicProfile(db, username))?.bio).toBe('Zerando um clássico por mês.');
    expect(await history(id, 'name')).toHaveLength(1);
  });

  it('bio vazia limpa o campo', async () => {
    const { id, username } = await verifiedAccount();
    await updateProfile(db, id, { name: 'Ana Souza', username, bio: 'Oi' }, T0);
    await updateProfile(db, id, { name: 'Ana Souza', username, bio: '   ' }, T0);
    expect((await getPublicProfile(db, username))?.bio).toBeNull();
  });

  it('bio acima de 160 caracteres é recusada, com a contagem', async () => {
    const { id, username } = await verifiedAccount();
    const ok = await updateProfile(db, id, { name: 'Ana Souza', username, bio: 'a'.repeat(BIO_MAX) }, T0);
    expect(ok.ok).toBe(true);
    const tooLong = await updateProfile(db, id, { name: 'Ana Souza', username, bio: 'a'.repeat(BIO_MAX + 1) }, T0);
    expect(tooLong).toEqual({ ok: false, errors: { bio: '161/160 caracteres. Reduza o texto para salvar.' } });
  });

  it('trocar o nome grava no histórico (anterior, novo e data)', async () => {
    const { id, username } = await verifiedAccount();
    const result = await updateProfile(db, id, { name: 'Ana Clara Souza', username, bio: '' }, T0);
    expect(result.ok).toBe(true);
    expect(await history(id, 'name')).toMatchObject([
      { oldValue: null, newValue: 'Ana Souza' },
      { oldValue: 'Ana Souza', newValue: 'Ana Clara Souza', changedAt: T0 },
    ]);
    expect((await getPublicProfile(db, username))?.name).toBe('Ana Clara Souza');
  });

  it('o nome só pode ser trocado de novo depois de 60 dias, e a mensagem traz a data', async () => {
    const { id, username } = await verifiedAccount();
    await updateProfile(db, id, { name: 'Ana Clara Souza', username, bio: '' }, T0);

    const early = await updateProfile(db, id, { name: 'Ana Maria Souza', username, bio: '' }, after(T0, 59 * DAY));
    expect(early).toEqual({ ok: false, errors: { name: 'Você poderá trocar o nome de novo em 09/01/2027.' } });
    expect((await getEditLocks(db, id, after(T0, 59 * DAY))).nameUnlocksAt).toEqual(after(T0, 60 * DAY));

    const late = await updateProfile(db, id, { name: 'Ana Maria Souza', username, bio: '' }, after(T0, 60 * DAY));
    expect(late.ok).toBe(true);
    expect(await history(id, 'name')).toHaveLength(3);
  });

  it('o cadastro não conta como troca: o primeiro nome novo é liberado na hora', async () => {
    const { id, username } = await verifiedAccount();
    expect((await getEditLocks(db, id, T0)).nameUnlocksAt).toBeNull();
    const result = await updateProfile(db, id, { name: 'Ana Paula Souza', username, bio: '' }, T0);
    expect(result.ok).toBe(true);
  });

  it('nome novo segue as regras de nome e sobrenome', async () => {
    const { id, username } = await verifiedAccount();
    const result = await updateProfile(db, id, { name: 'Ana', username, bio: '' }, T0);
    expect(result).toEqual({ ok: false, errors: { name: 'Informe nome e sobrenome.' } });
  });

  it('nome igual ao atual não é revalidado (conta do Google com nome de uma palavra)', async () => {
    const { id, username } = await verifiedAccount();
    await db.update(users).set({ name: 'Madonna' }).where(eq(users.id, id));
    const result = await updateProfile(db, id, { name: 'Madonna', username, bio: 'Cantora' }, T0);
    expect(result.ok).toBe(true);
    expect(await history(id, 'name')).toHaveLength(1);
  });

  it('trocar o @usuário grava no histórico e trava por 30 dias', async () => {
    const { id, username } = await verifiedAccount();
    counter += 1;
    const novo = `novo${counter}`;
    const result = await updateProfile(db, id, { name: 'Ana Souza', username: novo, bio: '' }, T0);
    expect(result).toMatchObject({ ok: true, username: novo });
    expect(await history(id, 'username')).toMatchObject([
      { oldValue: null, newValue: username },
      { oldValue: username, newValue: novo },
    ]);

    const early = await updateProfile(db, id, { name: 'Ana Souza', username: `${novo}x`, bio: '' }, after(T0, 29 * DAY));
    expect(early).toEqual({ ok: false, errors: { username: 'Você poderá trocar o @usuário de novo em 10/12/2026.' } });

    const late = await updateProfile(db, id, { name: 'Ana Souza', username: `${novo}x`, bio: '' }, after(T0, 30 * DAY));
    expect(late.ok).toBe(true);
  });

  it('@usuário em uso, fora do formato ou reservado é recusado', async () => {
    const a = await verifiedAccount();
    const b = await verifiedAccount();
    const taken = await updateProfile(db, b.id, { name: 'Ana Souza', username: a.username, bio: '' }, T0);
    expect(taken).toEqual({ ok: false, errors: { username: 'Esse @usuário já está em uso. Tente outro.' } });
    const format = await updateProfile(db, b.id, { name: 'Ana Souza', username: 'Com Espaço', bio: '' }, T0);
    expect(format.ok).toBe(false);
    const reserved = await updateProfile(db, b.id, { name: 'Ana Souza', username: 'admin', bio: '' }, T0);
    expect(reserved).toEqual({ ok: false, errors: { username: 'Esse @usuário não está disponível.' } });
  });

  it('um erro em um campo não grava nada (nem os campos válidos)', async () => {
    const { id, username } = await verifiedAccount();
    const result = await updateProfile(db, id, { name: 'Ana Souza', username, bio: 'b'.repeat(200) }, T0);
    expect(result.ok).toBe(false);
    expect((await getPublicProfile(db, username))?.bio).toBeNull();
  });

  it('troca e remove imagens, devolvendo as chaves antigas para limpeza', async () => {
    const { id, username } = await verifiedAccount();
    const first = await updateProfile(
      db,
      id,
      { name: 'Ana Souza', username, bio: '', avatarKey: 'avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', coverKey: 'covers/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png' },
      T0,
    );
    expect(first).toMatchObject({ ok: true, replacedKeys: [] });

    const keep = await updateProfile(db, id, { name: 'Ana Souza', username, bio: 'Oi' }, T0);
    expect(keep).toMatchObject({ ok: true, replacedKeys: [] });
    expect(await getPublicProfile(db, username)).toMatchObject({
      avatarKey: 'avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg',
      coverKey: 'covers/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png',
    });

    const removed = await updateProfile(db, id, { name: 'Ana Souza', username, bio: 'Oi', avatarKey: null }, T0);
    expect(removed).toMatchObject({ ok: true, replacedKeys: ['avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'] });
    expect((await getPublicProfile(db, username))?.avatarKey).toBeNull();
  });
});

describe('normalizeBio', () => {
  it('troca quebras de linha por espaço e apara as pontas', () => {
    expect(normalizeBio('  a \r\n\n b  ')).toBe('a b');
  });
});
