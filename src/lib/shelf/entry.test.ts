import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { games, shelfEntries, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { createTestDb, validSignup } from '@/test/db';
import { getEntry, REVIEW_MAX, removeEntry, updateEntry } from './entry';
import { addToShelf, getShelf, shelfCounters } from './shelf';

const T0 = new Date('2026-11-11T12:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

const game = (igdbId: number): IgdbGame => ({
  igdbId,
  name: `Jogo ${igdbId}`,
  slug: null,
  coverImageId: null,
  releasedAt: null,
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
});

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function setup(status = 'jogando') {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `entrada${counter}`, email: `entrada${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  const added = await addToShelf(db, result.user.id, game(1000 + counter), status, T0);
  if (!added.ok) throw new Error('falhou');
  return { userId: result.user.id, entryId: added.entryId };
}

describe('ver a entrada', () => {
  it('traz os detalhes vazios de uma entrada nova, com os dados do jogo', async () => {
    const { userId, entryId } = await setup();
    expect(await getEntry(db, userId, entryId)).toMatchObject({
      status: 'jogando',
      platform: null,
      rating: null,
      review: null,
      reviewSpoiler: false,
      started: { month: null, year: null },
      ended: { month: null, year: null },
      playMinutes: null,
      game: { platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'] },
    });
  });

  it('outra pessoa não vê a entrada', async () => {
    const a = await setup();
    const b = await setup();
    expect(await getEntry(db, b.userId, a.entryId)).toBeNull();
  });
});

describe('editar a entrada', () => {
  it('salva nota, plataforma e review com spoiler', async () => {
    const { userId, entryId } = await setup();
    const result = await updateEntry(
      db,
      userId,
      entryId,
      { rating: 4, platform: 'Nintendo Switch', review: '  Muito bom.\r\nZerei duas vezes.  ', reviewSpoiler: true },
      T0,
    );
    expect(result).toMatchObject({ ok: true, statusChanged: false });
    expect(await getEntry(db, userId, entryId)).toMatchObject({ rating: 4, platform: 'Nintendo Switch', review: 'Muito bom.\nZerei duas vezes.', reviewSpoiler: true });
  });

  it('campo ausente mantém o valor; null e texto vazio limpam', async () => {
    const { userId, entryId } = await setup();
    await updateEntry(db, userId, entryId, { rating: 5, review: 'Ótimo', platform: 'Nintendo Switch' }, T0);
    await updateEntry(db, userId, entryId, { reviewSpoiler: false }, T0);
    expect(await getEntry(db, userId, entryId)).toMatchObject({ rating: 5, review: 'Ótimo', platform: 'Nintendo Switch' });
    await updateEntry(db, userId, entryId, { rating: null, review: '   ', platform: '' }, T0);
    expect(await getEntry(db, userId, entryId)).toMatchObject({ rating: null, review: null, platform: null });
  });

  it('nota só de 1 a 5, inteira', async () => {
    const { userId, entryId } = await setup();
    for (const rating of [0, 6, 3.5, -1]) {
      expect(await updateEntry(db, userId, entryId, { rating }, T0)).toEqual({ ok: false, error: 'invalid', errors: { rating: 'invalid-rating' } });
    }
    expect((await updateEntry(db, userId, entryId, { rating: 1 }, T0)).ok).toBe(true);
  });

  it('a plataforma tem que ser uma das plataformas do jogo', async () => {
    const { userId, entryId } = await setup();
    expect(await updateEntry(db, userId, entryId, { platform: 'Atari 2600' }, T0)).toEqual({ ok: false, error: 'invalid', errors: { platform: 'invalid-platform' } });
  });

  it('review acima do limite é recusada', async () => {
    const { userId, entryId } = await setup();
    expect((await updateEntry(db, userId, entryId, { review: 'a'.repeat(REVIEW_MAX) }, T0)).ok).toBe(true);
    expect(await updateEntry(db, userId, entryId, { review: 'a'.repeat(REVIEW_MAX + 1) }, T0)).toEqual({ ok: false, error: 'invalid', errors: { review: 'review-too-long' } });
  });

  it('só o dono edita; entrada inexistente não é encontrada', async () => {
    const a = await setup();
    const b = await setup();
    expect(await updateEntry(db, b.userId, a.entryId, { rating: 3 }, T0)).toEqual({ ok: false, error: 'not-found' });
    expect((await getEntry(db, a.userId, a.entryId))?.rating).toBeNull();
    expect(await updateEntry(db, a.userId, '00000000-0000-4000-8000-000000000000', { rating: 3 }, T0)).toEqual({ ok: false, error: 'not-found' });
  });

  it('um erro em um campo não grava nenhum dos outros', async () => {
    const { userId, entryId } = await setup();
    const result = await updateEntry(db, userId, entryId, { rating: 4, platform: 'Atari 2600' }, T0);
    expect(result.ok).toBe(false);
    expect((await getEntry(db, userId, entryId))?.rating).toBeNull();
  });
});

describe('início e fim (mês/ano)', () => {
  it('salva as duas datas; fim igual ao início vale', async () => {
    const { userId, entryId } = await setup();
    const result = await updateEntry(db, userId, entryId, { started: { month: 3, year: 2025 }, ended: { month: 3, year: 2025 } }, T0);
    expect(result.ok).toBe(true);
    expect(await getEntry(db, userId, entryId)).toMatchObject({ started: { month: 3, year: 2025 }, ended: { month: 3, year: 2025 } });
  });

  it('fim antes do início é recusado, também contra o início já salvo', async () => {
    const { userId, entryId } = await setup();
    expect(await updateEntry(db, userId, entryId, { started: { month: 6, year: 2025 }, ended: { month: 5, year: 2025 } }, T0)).toEqual({
      ok: false,
      error: 'invalid',
      errors: { ended: 'end-before-start' },
    });
    await updateEntry(db, userId, entryId, { started: { month: 6, year: 2025 } }, T0);
    expect(await updateEntry(db, userId, entryId, { ended: { month: 1, year: 2025 } }, T0)).toMatchObject({ ok: false, errors: { ended: 'end-before-start' } });
  });

  it('só uma das datas informada: tudo bem; só mês ou só ano: recusado', async () => {
    const { userId, entryId } = await setup();
    expect((await updateEntry(db, userId, entryId, { ended: { month: 2, year: 2024 } }, T0)).ok).toBe(true);
    expect(await updateEntry(db, userId, entryId, { started: { month: 2, year: null } }, T0)).toMatchObject({ ok: false, errors: { started: 'date-incomplete' } });
    expect(await updateEntry(db, userId, entryId, { started: { month: null, year: 2024 } }, T0)).toMatchObject({ ok: false, errors: { started: 'date-incomplete' } });
  });

  it('mês ou ano inválido e data no futuro são recusados', async () => {
    const { userId, entryId } = await setup();
    expect(await updateEntry(db, userId, entryId, { started: { month: 13, year: 2024 } }, T0)).toMatchObject({ errors: { started: 'date-invalid' } });
    expect(await updateEntry(db, userId, entryId, { started: { month: 1, year: 1900 } }, T0)).toMatchObject({ errors: { started: 'date-invalid' } });
    expect(await updateEntry(db, userId, entryId, { started: { month: 12, year: 2026 } }, T0)).toMatchObject({ errors: { started: 'date-future' } });
    expect((await updateEntry(db, userId, entryId, { started: { month: 11, year: 2026 } }, T0)).ok).toBe(true); // o mês atual vale
  });

  it('esvaziar o par limpa a data', async () => {
    const { userId, entryId } = await setup();
    await updateEntry(db, userId, entryId, { started: { month: 1, year: 2024 } }, T0);
    await updateEntry(db, userId, entryId, { started: { month: null, year: null } }, T0);
    expect((await getEntry(db, userId, entryId))?.started).toEqual({ month: null, year: null });
  });
});

describe('tempo de jogo e status', () => {
  it('salva o tempo em minutos; zero, negativo e fração são recusados', async () => {
    const { userId, entryId } = await setup('zerado');
    expect((await updateEntry(db, userId, entryId, { playMinutes: 750 }, T0)).ok).toBe(true);
    expect((await getEntry(db, userId, entryId))?.playMinutes).toBe(750);
    for (const playMinutes of [0, -5, 10.5]) {
      expect(await updateEntry(db, userId, entryId, { playMinutes }, T0)).toMatchObject({ ok: false, errors: { playMinutes: 'invalid-time' } });
    }
  });

  it('mudar o status pela edição atualiza a data da mudança; manter não mexe', async () => {
    const { userId, entryId } = await setup('jogando');
    expect(await updateEntry(db, userId, entryId, { status: 'jogando', rating: 3 }, after(1000))).toMatchObject({ ok: true, statusChanged: false });
    expect(await updateEntry(db, userId, entryId, { status: 'zerado' }, after(5000))).toMatchObject({ ok: true, status: 'zerado', statusChanged: true });
    const [row] = await db.select().from(shelfEntries).where(eq(shelfEntries.id, entryId));
    expect(row.statusChangedAt).toEqual(after(5000));
  });

  it('status inválido é recusado', async () => {
    const { userId, entryId } = await setup();
    expect(await updateEntry(db, userId, entryId, { status: 'nada' }, T0)).toMatchObject({ ok: false, errors: { status: 'invalid-status' } });
  });

  it('ao sair de Zerado, nota, tempo e data de fim são mantidos', async () => {
    const { userId, entryId } = await setup('zerado');
    await updateEntry(db, userId, entryId, { rating: 5, playMinutes: 600, ended: { month: 10, year: 2026 } }, T0);
    await updateEntry(db, userId, entryId, { status: 'jogando' }, after(1000));
    expect(await getEntry(db, userId, entryId)).toMatchObject({ status: 'jogando', rating: 5, playMinutes: 600, ended: { month: 10, year: 2026 } });
  });
});

describe('contador "Zerados no ano" com data de fim', () => {
  it('usa o ano da data de fim quando existe', async () => {
    const { userId, entryId } = await setup('zerado'); // entrou em Zerado em 2026
    expect((await shelfCounters(db, userId, T0)).zeroedThisYear).toBe(1);
    await updateEntry(db, userId, entryId, { ended: { month: 5, year: 2024 } }, T0); // mas terminou em 2024
    expect((await shelfCounters(db, userId, T0)).zeroedThisYear).toBe(0);
    await updateEntry(db, userId, entryId, { ended: { month: 2, year: 2026 } }, T0);
    expect((await shelfCounters(db, userId, T0)).zeroedThisYear).toBe(1);
  });
});

describe('remover da Game Shelf', () => {
  it('apaga a entrada (com nota e review), some da estante e mantém o jogo', async () => {
    const { userId, entryId } = await setup('zerado');
    await updateEntry(db, userId, entryId, { rating: 5, review: 'Ótimo' }, T0);
    expect(await removeEntry(db, userId, entryId)).toMatchObject({ ok: true });
    expect(await getEntry(db, userId, entryId)).toBeNull();
    expect(Object.values(await getShelf(db, userId)).flat()).toHaveLength(0);
    expect((await db.select().from(games)).length).toBeGreaterThan(0);
  });

  it('só o dono remove; depois de remover dá para adicionar de novo', async () => {
    const a = await setup();
    const b = await setup();
    expect(await removeEntry(db, b.userId, a.entryId)).toEqual({ ok: false, error: 'not-found' });
    expect(await getEntry(db, a.userId, a.entryId)).not.toBeNull();
    await removeEntry(db, a.userId, a.entryId);
    const [removedGame] = await db.select().from(games).where(eq(games.igdbId, 1000 + counter - 1));
    const again = await addToShelf(db, a.userId, game(removedGame.igdbId), 'quero-jogar', T0);
    expect(again).toMatchObject({ ok: true, alreadyOnShelf: false });
  });
});
