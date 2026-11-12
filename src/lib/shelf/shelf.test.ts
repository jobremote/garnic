import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { games, shelfEntries, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { createTestDb, validSignup } from '@/test/db';
import { addManyToShelf, addToShelf, getShelf, moveEntry, QUICK_ADD_MAX, shelfCounters, statusByIgdbId } from './shelf';

const T0 = new Date('2026-11-11T12:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

const game = (igdbId: number, name = `Jogo ${igdbId}`): IgdbGame => ({
  igdbId,
  name,
  slug: `jogo-${igdbId}`,
  coverImageId: `co${igdbId}`,
  releasedAt: new Date('2020-01-01T00:00:00.000Z'),
  platforms: ['PC'],
});

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `gamer${counter}`, email: `gamer${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

describe('adicionar à Game Shelf', () => {
  it('exige só o jogo e o status', async () => {
    const userId = await account();
    const result = await addToShelf(db, userId, game(1, 'Celeste'), 'jogando', T0);
    expect(result).toMatchObject({ ok: true, status: 'jogando', alreadyOnShelf: false, gameName: 'Celeste' });
    const shelf = await getShelf(db, userId);
    expect(shelf.jogando).toHaveLength(1);
    expect(shelf.jogando[0].game).toMatchObject({ igdbId: 1, name: 'Celeste', coverImageId: 'co1', platforms: ['PC'] });
  });

  it('status inválido é recusado e nada é gravado', async () => {
    const userId = await account();
    expect(await addToShelf(db, userId, game(50), 'quase', T0)).toEqual({ ok: false, error: 'invalid-status' });
    expect(await addToShelf(db, userId, game(50), undefined, T0)).toEqual({ ok: false, error: 'invalid-status' });
    expect(Object.values(await getShelf(db, userId)).flat()).toHaveLength(0);
  });

  it('uma entrada por jogo: adicionar de novo devolve a existente, sem duplicar nem mudar a coluna', async () => {
    const userId = await account();
    const first = await addToShelf(db, userId, game(2), 'quero-jogar', T0);
    const again = await addToShelf(db, userId, game(2), 'zerado', after(1000));
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again).toMatchObject({ alreadyOnShelf: true, status: 'quero-jogar', entryId: first.entryId });
    const shelf = await getShelf(db, userId);
    expect(shelf['quero-jogar']).toHaveLength(1);
    expect(shelf.zerado).toHaveLength(0);
  });

  it('o mesmo jogo pode estar na estante de pessoas diferentes e a cópia local do jogo é uma só', async () => {
    const a = await account();
    const b = await account();
    await addToShelf(db, a, game(3, 'Hades'), 'jogando', T0);
    await addToShelf(db, b, game(3, 'Hades'), 'zerado', T0);
    expect(await db.select().from(games).where(eq(games.igdbId, 3))).toHaveLength(1);
    expect((await getShelf(db, a)).jogando).toHaveLength(1);
    expect((await getShelf(db, b)).zerado).toHaveLength(1);
  });

  it('atualiza nome e capa do jogo quando o IGDB muda', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(4, 'Nome velho'), 'parado', T0);
    await addToShelf(db, userId, { ...game(4, 'Nome novo'), coverImageId: 'novacapa' }, 'parado', T0);
    const [row] = await db.select().from(games).where(eq(games.igdbId, 4));
    expect(row).toMatchObject({ name: 'Nome novo', coverImageId: 'novacapa' });
  });
});

describe('cadastro rápido de vários jogos', () => {
  it('põe todos na mesma coluna, na ordem escolhida (o primeiro fica no topo)', async () => {
    const userId = await account();
    const result = await addManyToShelf(db, userId, [game(80, 'Primeiro'), game(81, 'Segundo'), game(82, 'Terceiro')], 'quero-jogar', T0);
    expect(result).toEqual({ ok: true, added: ['Primeiro', 'Segundo', 'Terceiro'], alreadyOnShelf: [] });
    expect((await getShelf(db, userId))['quero-jogar'].map((c) => c.game.name)).toEqual(['Primeiro', 'Segundo', 'Terceiro']);
  });

  it('quem já está na Game Shelf não muda de coluna nem duplica; os outros entram', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(90, 'Já tenho'), 'zerado', T0);
    const result = await addManyToShelf(db, userId, [game(90, 'Já tenho'), game(91, 'Novo')], 'quero-jogar', after(1000));
    expect(result).toEqual({ ok: true, added: ['Novo'], alreadyOnShelf: ['Já tenho'] });
    const shelf = await getShelf(db, userId);
    expect(shelf.zerado.map((c) => c.game.name)).toEqual(['Já tenho']);
    expect(shelf['quero-jogar'].map((c) => c.game.name)).toEqual(['Novo']);
  });

  it('status inválido, lista vazia e mais de 20 jogos são recusados, sem gravar nada', async () => {
    const userId = await account();
    expect(await addManyToShelf(db, userId, [game(100)], 'quase', T0)).toEqual({ ok: false, error: 'invalid-status' });
    expect(await addManyToShelf(db, userId, [], 'jogando', T0)).toEqual({ ok: false, error: 'empty' });
    const many = Array.from({ length: QUICK_ADD_MAX + 1 }, (_, i) => game(200 + i));
    expect(await addManyToShelf(db, userId, many, 'jogando', T0)).toEqual({ ok: false, error: 'too-many' });
    expect(Object.values(await getShelf(db, userId)).flat()).toHaveLength(0);
    expect((await addManyToShelf(db, userId, many.slice(0, QUICK_ADD_MAX), 'jogando', T0)).ok).toBe(true);
  });
});

describe('mover de coluna', () => {
  it('muda o status e a data da mudança; mover para Zerado não exige nenhum campo', async () => {
    const userId = await account();
    const added = await addToShelf(db, userId, game(10), 'jogando', T0);
    if (!added.ok) throw new Error('falhou');
    const result = await moveEntry(db, userId, added.entryId, 'zerado', after(5000));
    expect(result).toMatchObject({ ok: true, status: 'zerado', changed: true });
    const [row] = await db.select().from(shelfEntries).where(eq(shelfEntries.id, added.entryId));
    expect(row).toMatchObject({ status: 'zerado', statusChangedAt: after(5000) });
  });

  it('mover para a mesma coluna não mexe em nada', async () => {
    const userId = await account();
    const added = await addToShelf(db, userId, game(11), 'parado', T0);
    if (!added.ok) throw new Error('falhou');
    expect(await moveEntry(db, userId, added.entryId, 'parado', after(9000))).toMatchObject({ ok: true, changed: false });
    const [row] = await db.select().from(shelfEntries).where(eq(shelfEntries.id, added.entryId));
    expect(row.statusChangedAt).toEqual(T0);
  });

  it('só o dono mexe na própria entrada', async () => {
    const owner = await account();
    const other = await account();
    const added = await addToShelf(db, owner, game(12), 'jogando', T0);
    if (!added.ok) throw new Error('falhou');
    expect(await moveEntry(db, other, added.entryId, 'zerado', T0)).toEqual({ ok: false, error: 'not-found' });
    expect((await getShelf(db, owner)).jogando).toHaveLength(1);
  });

  it('status inválido e entrada inexistente são recusados', async () => {
    const userId = await account();
    const added = await addToShelf(db, userId, game(13), 'jogando', T0);
    if (!added.ok) throw new Error('falhou');
    expect(await moveEntry(db, userId, added.entryId, 'nada', T0)).toEqual({ ok: false, error: 'invalid-status' });
    expect(await moveEntry(db, userId, '00000000-0000-4000-8000-000000000000', 'zerado', T0)).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('ver a estante', () => {
  it('agrupa nas 4 colunas e põe a mudança mais recente primeiro', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(20, 'Velho'), 'jogando', T0);
    await addToShelf(db, userId, game(21, 'Novo'), 'jogando', after(1000));
    await addToShelf(db, userId, game(22), 'quero-jogar', T0);
    const shelf = await getShelf(db, userId);
    expect(shelf.jogando.map((c) => c.game.name)).toEqual(['Novo', 'Velho']);
    expect(shelf['quero-jogar']).toHaveLength(1);
    expect(shelf.parado).toEqual([]);
    expect(shelf.zerado).toEqual([]);
  });

  it('a estante de uma pessoa não mostra jogos de outra', async () => {
    const a = await account();
    const b = await account();
    await addToShelf(db, a, game(30), 'jogando', T0);
    expect(Object.values(await getShelf(db, b)).flat()).toHaveLength(0);
  });
});

describe('resultados da busca já na estante', () => {
  it('devolve a coluna de cada jogo que a pessoa já tem', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(40), 'zerado', T0);
    await addToShelf(db, userId, game(41), 'quero-jogar', T0);
    const map = await statusByIgdbId(db, userId, [40, 41, 42]);
    expect(map.get(40)).toMatchObject({ status: 'zerado', entryId: expect.any(String) });
    expect(map.get(41)?.status).toBe('quero-jogar');
    expect(map.has(42)).toBe(false);
    expect((await statusByIgdbId(db, userId, [])).size).toBe(0);
  });
});

describe('contadores', () => {
  it('Backlog conta Quero jogar; Zerados conta todos os de Zerado, de qualquer ano', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(60), 'quero-jogar', T0);
    await addToShelf(db, userId, game(61), 'quero-jogar', T0);
    await addToShelf(db, userId, game(62), 'zerado', T0);
    await addToShelf(db, userId, game(63), 'zerado', new Date('2025-06-01T12:00:00.000Z'));
    await addToShelf(db, userId, game(64), 'jogando', T0);
    expect(await shelfCounters(db, userId)).toEqual({ zeroed: 2, backlog: 2 });
  });

  it('a data de fim não muda o contador de Zerados', async () => {
    const userId = await account();
    const added = await addToShelf(db, userId, game(70), 'zerado', T0);
    if (!added.ok) throw new Error('falhou');
    expect((await shelfCounters(db, userId)).zeroed).toBe(1);
    await db.update(shelfEntries).set({ endedYear: 2019, endedMonth: 3 }).where(eq(shelfEntries.id, added.entryId));
    expect((await shelfCounters(db, userId)).zeroed).toBe(1);
  });

  it('sair de Zerado tira o jogo do contador', async () => {
    const userId = await account();
    const added = await addToShelf(db, userId, game(71), 'zerado', T0);
    if (!added.ok) throw new Error('falhou');
    await moveEntry(db, userId, added.entryId, 'jogando', after(1000));
    expect(await shelfCounters(db, userId)).toEqual({ zeroed: 0, backlog: 0 });
  });

  it('sem jogos, tudo zero', async () => {
    const userId = await account();
    expect(await shelfCounters(db, userId)).toEqual({ zeroed: 0, backlog: 0 });
  });
});
