import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { shelfEntryTags, tags as tagsTable, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { createTestDb, validSignup } from '@/test/db';
import { getEntry, removeEntry, updateEntry } from './entry';
import { addToShelf, getShelf } from './shelf';
import { createTag, deleteTag, listTags, MAX_TAGS_PER_ENTRY, MAX_TAGS_PER_USER, normalizeTagName, TAG_NAME_MAX, updateTag } from './tags';

const T0 = new Date('2026-11-11T12:00:00.000Z');
const game = (igdbId: number): IgdbGame => ({ igdbId, name: `Jogo ${igdbId}`, slug: null, coverImageId: null, releasedAt: null, platforms: [] });

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `tagger${counter}`, email: `tagger${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}
async function entryOf(userId: string, igdbId: number) {
  const added = await addToShelf(db, userId, game(igdbId), 'jogando', T0);
  if (!added.ok) throw new Error('falhou');
  return added.entryId;
}
async function tag(userId: string, name: string, color = 'neutral') {
  const result = await createTag(db, userId, { name, color });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.tag;
}

describe('criar tag', () => {
  it('guarda nome e cor; o nome tem os espaços ajustados', async () => {
    const userId = await account();
    const result = await createTag(db, userId, { name: '  Top   da  vida ', color: 'wine' });
    expect(result).toMatchObject({ ok: true, tag: { name: 'Top da vida', color: 'wine' } });
    expect(normalizeTagName('  a   b ')).toBe('a b');
  });

  it('aceita as 6 cores e recusa outra', async () => {
    const userId = await account();
    for (const color of ['neutral', 'wine', 'petrol', 'olive', 'rose', 'sky']) expect((await createTag(db, userId, { name: `cor ${color}`, color })).ok).toBe(true);
    expect(await createTag(db, userId, { name: 'x', color: 'vermelho' })).toEqual({ ok: false, error: 'invalid', errors: { color: 'invalid-color' } });
  });

  it('nome vazio ou acima de 24 caracteres é recusado', async () => {
    const userId = await account();
    expect(await createTag(db, userId, { name: '   ', color: 'neutral' })).toMatchObject({ errors: { name: 'name-required' } });
    expect((await createTag(db, userId, { name: 'a'.repeat(TAG_NAME_MAX), color: 'neutral' })).ok).toBe(true);
    expect(await createTag(db, userId, { name: 'a'.repeat(TAG_NAME_MAX + 1), color: 'neutral' })).toMatchObject({ errors: { name: 'name-too-long' } });
  });

  it('nome repetido na mesma pessoa é recusado, sem diferenciar maiúsculas; outra pessoa pode usar', async () => {
    const a = await account();
    const b = await account();
    await tag(a, 'Abandonei');
    expect(await createTag(db, a, { name: 'ABANDONEI', color: 'rose' })).toEqual({ ok: false, error: 'invalid', errors: { name: 'name-taken' } });
    expect((await createTag(db, b, { name: 'Abandonei', color: 'rose' })).ok).toBe(true);
  });

  it('no máximo 30 tags por pessoa', async () => {
    const userId = await account();
    for (let i = 0; i < MAX_TAGS_PER_USER; i += 1) await tag(userId, `tag ${i}`);
    expect(await createTag(db, userId, { name: 'uma a mais', color: 'neutral' })).toEqual({ ok: false, error: 'invalid', errors: { form: 'too-many-tags' } });
  });
});

describe('listar, editar e excluir', () => {
  it('lista em ordem alfabética, com a quantidade de jogos de cada tag', async () => {
    const userId = await account();
    const b = await tag(userId, 'banana');
    await tag(userId, 'Abacate');
    const e1 = await entryOf(userId, 2001);
    const e2 = await entryOf(userId, 2002);
    await updateEntry(db, userId, e1, { tagIds: [b.id] }, T0);
    await updateEntry(db, userId, e2, { tagIds: [b.id] }, T0);
    const list = await listTags(db, userId);
    expect(list.map((t) => `${t.name}:${t.gameCount}`)).toEqual(['Abacate:0', 'banana:2']);
  });

  it('muda nome e cor; nome repetido e inválido são recusados; só o dono edita', async () => {
    const a = await account();
    const b = await account();
    const one = await tag(a, 'Um');
    await tag(a, 'Dois');
    expect(await updateTag(db, a, one.id, { name: 'Um novo', color: 'sky' })).toMatchObject({ ok: true, tag: { name: 'Um novo', color: 'sky' } });
    expect(await updateTag(db, a, one.id, { color: 'olive' })).toMatchObject({ ok: true, tag: { name: 'Um novo', color: 'olive' } });
    expect(await updateTag(db, a, one.id, { name: 'dois' })).toMatchObject({ errors: { name: 'name-taken' } });
    expect(await updateTag(db, a, one.id, { name: '' })).toMatchObject({ errors: { name: 'name-required' } });
    expect(await updateTag(db, a, one.id, { color: 'x' })).toMatchObject({ errors: { color: 'invalid-color' } });
    expect(await updateTag(db, b, one.id, { name: 'Roubada' })).toEqual({ ok: false, error: 'not-found' });
  });

  it('manter o próprio nome ao salvar não conta como repetido', async () => {
    const userId = await account();
    const t = await tag(userId, 'Igual');
    expect(await updateTag(db, userId, t.id, { name: 'igual', color: 'rose' })).toMatchObject({ ok: true });
  });

  it('excluir remove só a associação: os jogos continuam na Game Shelf', async () => {
    const userId = await account();
    const t = await tag(userId, 'Temporária');
    const entryId = await entryOf(userId, 2010);
    await updateEntry(db, userId, entryId, { tagIds: [t.id] }, T0);
    expect(await deleteTag(db, userId, t.id)).toEqual({ ok: true, name: 'Temporária', gameCount: 1 });
    expect((await getEntry(db, userId, entryId))?.tagIds).toEqual([]);
    expect(Object.values(await getShelf(db, userId)).flat()).toHaveLength(1);
    expect(await db.select().from(tagsTable).where(eq(tagsTable.id, t.id))).toHaveLength(0);
  });

  it('só o dono exclui', async () => {
    const a = await account();
    const b = await account();
    const t = await tag(a, 'Minha');
    expect(await deleteTag(db, b, t.id)).toEqual({ ok: false, error: 'not-found' });
    expect(await listTags(db, a)).toHaveLength(1);
  });
});

describe('tags na entrada', () => {
  it('salva a lista, aparece nos cards da estante e na entrada', async () => {
    const userId = await account();
    const zelda = await tag(userId, 'Zelda', 'olive');
    const abandonei = await tag(userId, 'Abandonei', 'wine');
    const entryId = await entryOf(userId, 2020);
    expect(await updateEntry(db, userId, entryId, { tagIds: [zelda.id, abandonei.id] }, T0)).toMatchObject({ ok: true });
    expect((await getEntry(db, userId, entryId))?.tagIds.sort()).toEqual([zelda.id, abandonei.id].sort());
    const [card] = (await getShelf(db, userId)).jogando;
    expect(card.tags.map((t) => t.name)).toEqual(['Abandonei', 'Zelda']); // alfabética
    expect(card.tags[0]).toMatchObject({ color: 'wine' });
  });

  it('trocar a lista tira as que saíram e mantém as que ficaram', async () => {
    const userId = await account();
    const a = await tag(userId, 'A');
    const b = await tag(userId, 'B');
    const c = await tag(userId, 'C');
    const entryId = await entryOf(userId, 2021);
    await updateEntry(db, userId, entryId, { tagIds: [a.id, b.id] }, T0);
    await updateEntry(db, userId, entryId, { tagIds: [b.id, c.id] }, T0);
    expect((await getEntry(db, userId, entryId))?.tagIds.sort()).toEqual([b.id, c.id].sort());
    await updateEntry(db, userId, entryId, { tagIds: [] }, T0);
    expect((await getEntry(db, userId, entryId))?.tagIds).toEqual([]);
  });

  it('sem tagIds, as tags ficam como estão (editar outro campo não mexe nelas)', async () => {
    const userId = await account();
    const a = await tag(userId, 'A');
    const entryId = await entryOf(userId, 2022);
    await updateEntry(db, userId, entryId, { tagIds: [a.id] }, T0);
    await updateEntry(db, userId, entryId, { rating: 4 }, T0);
    expect((await getEntry(db, userId, entryId))?.tagIds).toEqual([a.id]);
  });

  it('no máximo 5 por jogo; repetidas contam uma vez', async () => {
    const userId = await account();
    const created = [];
    for (let i = 0; i < MAX_TAGS_PER_ENTRY + 1; i += 1) created.push(await tag(userId, `t${i}`));
    const entryId = await entryOf(userId, 2023);
    expect(await updateEntry(db, userId, entryId, { tagIds: created.map((t) => t.id) }, T0)).toMatchObject({ ok: false, errors: { tags: 'too-many-tags' } });
    expect((await updateEntry(db, userId, entryId, { tagIds: created.slice(0, 5).map((t) => t.id) }, T0)).ok).toBe(true);
    expect((await updateEntry(db, userId, entryId, { tagIds: [created[0].id, created[0].id] }, T0)).ok).toBe(true);
    expect((await getEntry(db, userId, entryId))?.tagIds).toEqual([created[0].id]);
  });

  it('tag de outra pessoa, id inventado e lista que não é lista são recusados, sem gravar nada', async () => {
    const a = await account();
    const b = await account();
    const alheia = await tag(b, 'Alheia');
    const entryId = await entryOf(a, 2024);
    for (const tagIds of [[alheia.id], ['00000000-0000-4000-8000-000000000000'], ['nao-e-uuid'], 'texto', [1, 2]]) {
      expect(await updateEntry(db, a, entryId, { tagIds, rating: 5 }, T0)).toMatchObject({ ok: false, errors: { tags: 'invalid-tags' } });
    }
    expect((await getEntry(db, a, entryId))?.rating).toBeNull(); // nada foi gravado junto
    expect(await db.select().from(shelfEntryTags)).not.toContainEqual(expect.objectContaining({ tagId: alheia.id }));
  });

  it('remover a entrada apaga as associações e mantém a tag', async () => {
    const userId = await account();
    const t = await tag(userId, 'Fica');
    const entryId = await entryOf(userId, 2025);
    await updateEntry(db, userId, entryId, { tagIds: [t.id] }, T0);
    await removeEntry(db, userId, entryId);
    expect(await db.select().from(shelfEntryTags).where(eq(shelfEntryTags.tagId, t.id))).toHaveLength(0);
    expect((await listTags(db, userId)).map((x) => x.name)).toEqual(['Fica']);
  });
});
