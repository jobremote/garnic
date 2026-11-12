import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { shelfEntries, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { createTestDb, validSignup } from '@/test/db';
import { updateEntry } from './entry';
import { addManyToShelf, addToShelf, getShelf, moveEntry, placeEntry } from './shelf';

const T0 = new Date('2026-11-12T12:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);
const game = (igdbId: number, name = `Jogo ${igdbId}`): IgdbGame => ({ igdbId, name, slug: null, coverImageId: null, releasedAt: null, platforms: [] });

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `ordem${counter}`, email: `ordem${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}
const names = async (userId: string, column: 'quero-jogar' | 'parado' | 'jogando' | 'zerado') =>
  (await getShelf(db, userId))[column].map((card) => card.game.name);
const ids = async (userId: string, column: 'quero-jogar' | 'parado' | 'jogando' | 'zerado') =>
  (await getShelf(db, userId))[column].map((card) => card.entryId);

/** Três jogos em Jogando; o último adicionado fica no topo. */
async function shelfWithThree(userId: string) {
  for (const [i, name] of ['A', 'B', 'C'].entries()) await addToShelf(db, userId, game(7000 + counter * 10 + i, name), 'jogando', after(i));
  return ids(userId, 'jogando'); // [C, B, A]
}

describe('ordem dos cards: topo', () => {
  it('jogo novo entra no topo da coluna', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(1, 'Velho'), 'jogando', T0);
    await addToShelf(db, userId, game(2, 'Novo'), 'jogando', after(1000));
    expect(await names(userId, 'jogando')).toEqual(['Novo', 'Velho']);
  });

  it('jogo que muda de coluna (menu) entra no topo da coluna nova', async () => {
    const userId = await account();
    const a = await addToShelf(db, userId, game(10, 'Já está lá'), 'zerado', T0);
    const b = await addToShelf(db, userId, game(11, 'Chegando'), 'jogando', after(100));
    if (!a.ok || !b.ok) throw new Error('falhou');
    await moveEntry(db, userId, b.entryId, 'zerado', after(500));
    expect(await names(userId, 'zerado')).toEqual(['Chegando', 'Já está lá']);
  });

  it('mudar o status pela edição também leva ao topo', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(20, 'Parado antigo'), 'parado', T0);
    const b = await addToShelf(db, userId, game(21, 'Vai parar'), 'jogando', after(100));
    if (!b.ok) throw new Error('falhou');
    await updateEntry(db, userId, b.entryId, { status: 'parado' }, after(200));
    expect(await names(userId, 'parado')).toEqual(['Vai parar', 'Parado antigo']);
  });

  it('cadastro rápido: o primeiro escolhido fica no topo, acima do que já existia', async () => {
    const userId = await account();
    await addToShelf(db, userId, game(30, 'Que já existia'), 'quero-jogar', T0);
    await addManyToShelf(db, userId, [game(31, 'Primeiro'), game(32, 'Segundo'), game(33, 'Terceiro')], 'quero-jogar', after(1000));
    expect(await names(userId, 'quero-jogar')).toEqual(['Primeiro', 'Segundo', 'Terceiro', 'Que já existia']);
  });

  it('a ordem é de cada coluna e de cada pessoa', async () => {
    const a = await account();
    const b = await account();
    await addToShelf(db, a, game(40, 'X'), 'jogando', T0);
    await addToShelf(db, b, game(41, 'Y'), 'jogando', T0);
    await addToShelf(db, a, game(42, 'Z'), 'zerado', T0);
    expect(await names(a, 'jogando')).toEqual(['X']);
    expect(await names(b, 'jogando')).toEqual(['Y']);
  });
});

describe('placeEntry: reordenar e soltar numa posição', () => {
  it('reordena dentro da coluna e a ordem fica guardada', async () => {
    const userId = await account();
    const [c, b, a] = await shelfWithThree(userId); // C, B, A
    const result = await placeEntry(db, userId, a, 'jogando', [a, c, b], after(5000));
    expect(result).toMatchObject({ ok: true, status: 'jogando', changed: false });
    expect(await names(userId, 'jogando')).toEqual(['A', 'C', 'B']);
    // Reabrir a estante mostra a mesma ordem (está gravada, não é só de tela).
    expect(await ids(userId, 'jogando')).toEqual([a, c, b]);
  });

  it('reordenar dentro da coluna não mexe na data de mudança de coluna', async () => {
    const userId = await account();
    const [c, b, a] = await shelfWithThree(userId);
    await placeEntry(db, userId, c, 'jogando', [b, c, a], after(9000));
    const [row] = await db.select().from(shelfEntries).where(eq(shelfEntries.id, c));
    expect(row.statusChangedAt).not.toEqual(after(9000));
  });

  it('soltar numa posição de outra coluna muda a coluna, atualiza a data e põe o card no lugar certo', async () => {
    const userId = await account();
    const [c, , a] = await shelfWithThree(userId);
    await addToShelf(db, userId, game(8000 + counter, 'Z1'), 'zerado', after(10));
    await addToShelf(db, userId, game(8100 + counter, 'Z2'), 'zerado', after(20));
    const zerado = await ids(userId, 'zerado'); // [Z2, Z1]
    const result = await placeEntry(db, userId, a, 'zerado', [zerado[0], a, zerado[1]], after(7000));
    expect(result).toMatchObject({ ok: true, status: 'zerado', changed: true, gameName: 'A' });
    expect(await names(userId, 'zerado')).toEqual(['Z2', 'A', 'Z1']);
    expect(await names(userId, 'jogando')).toEqual(['C', 'B']);
    const [row] = await db.select().from(shelfEntries).where(eq(shelfEntries.id, a));
    expect(row.statusChangedAt).toEqual(after(7000));
    expect(c).toBeTruthy();
  });

  it('recusa lista com id de outra pessoa, de outra coluna, repetido, inexistente, sem o card ou malformado', async () => {
    const userId = await account();
    const other = await account();
    const [c, b] = await shelfWithThree(userId);
    const foreign = await addToShelf(db, other, game(9000 + counter, 'Alheio'), 'jogando', T0);
    if (!foreign.ok) throw new Error('falhou');
    const zerado = await addToShelf(db, userId, game(9100 + counter, 'Outra coluna'), 'zerado', T0);
    if (!zerado.ok) throw new Error('falhou');

    const bad: unknown[] = [
      [c, foreign.entryId], // id de outra pessoa
      [c, zerado.entryId], // id que está em outra coluna (e não é o card que muda)
      [c, c, b], // repetido
      [c, '00000000-0000-4000-8000-000000000000'], // não existe
      [b], // sem o card
      [], // vazia
      'texto', // não é lista
      [c, 'não-é-uuid'],
    ];
    for (const list of bad) {
      expect(await placeEntry(db, userId, c, 'jogando', list, T0)).toMatchObject({ ok: false });
    }
    expect(await placeEntry(db, userId, c, 'quase', [c], T0)).toEqual({ ok: false, error: 'invalid-status' });
    // Nada foi gravado: a ordem original segue valendo.
    expect(await names(userId, 'jogando')).toEqual(['C', 'B', 'A']);
    expect(await names(other, 'jogando')).toEqual(['Alheio']);
  });

  it('só o dono mexe na própria ordem: o card de outra pessoa não é encontrado', async () => {
    const owner = await account();
    const other = await account();
    const [c, b, a] = await shelfWithThree(owner);
    expect(await placeEntry(db, other, c, 'jogando', [c, b, a], T0)).toEqual({ ok: false, error: 'not-found' });
    expect(await names(owner, 'jogando')).toEqual(['C', 'B', 'A']);
  });

  it('depois de reordenar, um jogo novo ainda entra no topo', async () => {
    const userId = await account();
    const [c, b, a] = await shelfWithThree(userId);
    await placeEntry(db, userId, a, 'jogando', [a, b, c], after(100));
    await addToShelf(db, userId, game(9500 + counter, 'Recém-chegado'), 'jogando', after(200));
    expect(await names(userId, 'jogando')).toEqual(['Recém-chegado', 'A', 'B', 'C']);
  });
});

describe('migração 0009: ordem inicial dos jogos que já existiam', () => {
  it('o SQL da migração dá a mesma ordem de antes (mudou por último, vem primeiro), coluna por coluna', async () => {
    const userId = await account();
    for (const [i, name] of ['Mais antigo', 'Do meio', 'Mais novo'].entries()) {
      await addToShelf(db, userId, game(9800 + counter * 10 + i, name), 'jogando', after(i * 1000));
    }
    await addToShelf(db, userId, game(9890 + counter, 'Sozinho'), 'zerado', T0);
    // Simula a estante de antes da migração: todos com sort_order = 0 (a ordem cai no desempate por data).
    await db.update(shelfEntries).set({ sortOrder: 0 }).where(eq(shelfEntries.userId, userId));
    const file = readFileSync(path.join(process.cwd(), 'drizzle', '0009_kanban_ordem.sql'), 'utf8');
    const backfill = file
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .find((part) => part.includes('UPDATE "shelf_entries"'));
    expect(backfill).toBeTruthy();
    await db.execute(sql.raw(backfill as string));
    expect(await names(userId, 'jogando')).toEqual(['Mais novo', 'Do meio', 'Mais antigo']);
    expect(await names(userId, 'zerado')).toEqual(['Sozinho']);
    const rows = await db.select({ order: shelfEntries.sortOrder }).from(shelfEntries).where(eq(shelfEntries.userId, userId));
    expect(rows.map((row) => row.order).sort((a, b) => a - b)).toEqual([0, 0, 1024, 2048]); // 0, 1024 e 2048 em Jogando; 0 em Zerado
  });
});
