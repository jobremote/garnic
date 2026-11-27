import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { games, shelfEntries, users } from '@/lib/db/schema';
import { createPost, listPosts } from '@/lib/feed/posts';
import { shareActivity } from '@/lib/shelf/activity';
import { updateEntry } from '@/lib/shelf/entry';
import { addToShelf } from '@/lib/shelf/shelf';
import type { IgdbClient, IgdbGame } from '@/lib/igdb/igdb';
import { createTranslator } from '@/lib/translate/deepl';
import { createTestDb, validSignup } from '@/test/db';
import { creditsLine, formatRating } from './messages';
import { communityStats, COMMUNITY_TIME_MIN, ensureGameDetails, findGame, gamePath, listGameScreenshots, viewerEntry } from './page';

const T0 = new Date('2026-11-27T12:00:00.000Z');
const game = (igdbId: number, slug: string | null = `jogo-${igdbId}`): IgdbGame => ({ igdbId, name: `Jogo ${igdbId}`, slug, coverImageId: null, releasedAt: null, platforms: ['PC'] });

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account(verified = true) {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `jogo${counter}`, email: `jogo${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result));
  if (verified) await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

async function add(userId: string, igdbId: number, status = 'quero-jogar') {
  const added = await addToShelf(db, userId, game(igdbId), status, T0);
  if (!added.ok) throw new Error('add');
  return added.entryId;
}

const gameRow = async (igdbId: number) => (await db.select().from(games).where(eq(games.igdbId, igdbId)))[0];

describe('endereço da página', () => {
  it('usa o slug e, sem ele, o id do IGDB', () => {
    expect(gamePath({ slug: 'celeste', igdbId: 26226 })).toBe('/jogo/celeste');
    expect(gamePath({ slug: null, igdbId: 26226 })).toBe('/jogo/26226');
  });

  it('acha o jogo pelo slug ou pelo id; jogo fora do Garnic não tem página', async () => {
    const user = await account();
    await add(user, 9001);
    expect((await findGame(db, 'jogo-9001'))?.igdbId).toBe(9001);
    expect((await findGame(db, 'JOGO-9001'))?.igdbId).toBe(9001);
    expect((await findGame(db, '9001'))?.igdbId).toBe(9001);
    expect(await findGame(db, 'nao-existe')).toBeNull();
    expect(await findGame(db, '../x')).toBeNull();
  });
});

describe('detalhes do IGDB e tradução', () => {
  const details = { summary: 'A tight platformer.', genres: ['Platform', 'Indie'], developers: ['Studio A'], publishers: ['Studio B'], backdropImageId: 'ar1' };
  const igdb = (overrides: Partial<IgdbClient> = {}) =>
    ({
      getGameDetails: vi.fn().mockResolvedValue(details),
      getTimeToBeat: vi.fn().mockResolvedValue({ hastily: 600, normally: 1260, completely: null }),
      ...overrides,
    }) as unknown as IgdbClient;
  const translator = (text: string | null) => ({ configured: true, toPortuguese: vi.fn().mockResolvedValue(text) });

  it('busca na primeira visita, guarda e traduz o resumo', async () => {
    const user = await account();
    await add(user, 9101);
    const client = igdb();
    const tr = translator('Um jogo de plataforma preciso.');
    const updated = await ensureGameDetails(db, await gameRow(9101), client, tr, T0);
    expect(updated).toMatchObject({ summary: 'A tight platformer.', summaryPt: 'Um jogo de plataforma preciso.', genres: ['Platform', 'Indie'], developers: ['Studio A'], publishers: ['Studio B'], backdropImageId: 'ar1', timeHastily: 600, timeNormally: 1260, timeCompletely: null });
    expect(tr.toPortuguese).toHaveBeenCalledWith('A tight platformer.');

    // Segunda visita: nada é buscado nem traduzido de novo.
    const again = igdb();
    const tr2 = translator('outra');
    await ensureGameDetails(db, updated, again, tr2, new Date(T0.getTime() + 60_000));
    expect(again.getGameDetails).not.toHaveBeenCalled();
    expect(tr2.toPortuguese).not.toHaveBeenCalled();
  });

  it('sem tradução, mostra o original e tenta traduzir na próxima visita', async () => {
    const user = await account();
    await add(user, 9102);
    const first = await ensureGameDetails(db, await gameRow(9102), igdb(), translator(null), T0);
    expect(first.summary).toBe('A tight platformer.');
    expect(first.summaryPt).toBeNull();
    const second = await ensureGameDetails(db, first, igdb(), translator('Traduzido.'), T0);
    expect(second.summaryPt).toBe('Traduzido.');
  });

  it('sem chave da DeepL, não tenta traduzir', async () => {
    const user = await account();
    await add(user, 9103);
    const fetch = vi.fn();
    const updated = await ensureGameDetails(db, await gameRow(9103), igdb(), createTranslator({ apiKey: '', fetch }), T0);
    expect(updated.summaryPt).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('IGDB fora do ar não quebra a página', async () => {
    const user = await account();
    await add(user, 9104);
    const row = await gameRow(9104);
    const updated = await ensureGameDetails(db, row, igdb({ getGameDetails: vi.fn().mockRejectedValue(new Error('caiu')) } as Partial<IgdbClient>), translator(null), T0);
    expect(updated.detailsFetchedAt).toBeNull();
  });
});

describe('comunidade', () => {
  it('nota média com uma casa, todas as notas de qualquer status; quem tem o jogo', async () => {
    const [a, b, c] = [await account(), await account(), await account()];
    const ea = await add(a, 9201, 'zerado');
    const eb = await add(b, 9201, 'jogando');
    await add(c, 9201);
    await updateEntry(db, a, ea, { rating: 4 }, T0);
    await updateEntry(db, b, eb, { rating: 3 }, T0);
    const stats = await communityStats(db, (await gameRow(9201)).id);
    expect(stats).toMatchObject({ owners: 3, ratingCount: 2, ratingAverage: 3.5, timeAverage: null });
    expect(formatRating(stats.ratingAverage ?? 0)).toBe('3,5');
  });

  it('sem notas, não há média', async () => {
    const user = await account();
    await add(user, 9202);
    expect((await communityStats(db, (await gameRow(9202)).id)).ratingAverage).toBeNull();
  });

  it(`tempo da comunidade só a partir de ${COMMUNITY_TIME_MIN} registros em Zerado`, async () => {
    const minutes = [600, 700, 800, 900];
    for (const value of minutes) {
      const user = await account();
      const entry = await add(user, 9203, 'zerado');
      await updateEntry(db, user, entry, { playMinutes: value }, T0);
    }
    // Tempo de quem saiu de Zerado não conta.
    const other = await account();
    const parked = await add(other, 9203, 'zerado');
    await updateEntry(db, other, parked, { playMinutes: 5000, status: 'parado' }, T0);
    const id = (await gameRow(9203)).id;
    expect((await communityStats(db, id)).timeAverage).toBeNull();

    const fifth = await account();
    const entry = await add(fifth, 9203, 'zerado');
    await updateEntry(db, fifth, entry, { playMinutes: 1000 }, T0);
    expect(await communityStats(db, id)).toMatchObject({ timeCount: 5, timeAverage: 800 });
  });

  it('contas não validadas não contam', async () => {
    const user = await account(false);
    await add(user, 9204);
    expect((await communityStats(db, (await gameRow(9204)).id)).owners).toBe(0);
  });
});

describe('screenshots', () => {
  it('todas as screenshots, com spoiler marcado, em páginas', async () => {
    const owners: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const user = await account();
      owners.push(user);
      const entry = await add(user, 9301);
      await db.update(shelfEntries).set({ screenshotRef: `screenshots/${user}.png`, screenshotSpoiler: i === 0 }).where(eq(shelfEntries.id, entry));
    }
    const withoutShot = await account();
    await add(withoutShot, 9301);
    const id = (await gameRow(9301)).id;
    const first = await listGameScreenshots(db, id, owners[0]);
    expect(first.total).toBe(8);
    expect(first.screenshots).toHaveLength(6);
    expect(first.next).toBe(6);
    const second = await listGameScreenshots(db, id, owners[0], 6);
    expect(second.screenshots).toHaveLength(2);
    expect(second.next).toBeNull();
    const all = [...first.screenshots, ...second.screenshots];
    expect(all.filter((shot) => shot.spoiler)).toHaveLength(1);
    expect(all.filter((shot) => shot.own)).toHaveLength(1);
  });
});

describe('posts sobre o jogo', () => {
  it('só conteúdo: posts que marcam o jogo e reviews compartilhadas', async () => {
    const user = await account();
    const entry = await add(user, 9401, 'jogando');
    const gameId = (await gameRow(9401)).id;
    const marked = await createPost(db, user, { body: 'Que jogo!', games: [game(9401)] }, T0);
    await createPost(db, user, { body: 'Outro assunto', games: [game(9402)] }, T0);
    const saved = await updateEntry(db, user, entry, { review: 'Uma review longa.' }, T0);
    if (!saved.ok) throw new Error('save');
    const review = saved.activities.find((activity) => activity.kind === 'review');
    const started = (await addToShelf(db, user, game(9403), 'jogando', T0)).ok;
    expect(started).toBe(true);
    if (!review || !marked.ok) throw new Error('setup');
    await shareActivity(db, user, review.id, '', T0);
    // A atividade de coluna (Começou a jogar) compartilhada não entra.
    const startedActivity = saved.activities.find((activity) => activity.kind !== 'review');
    if (startedActivity) await shareActivity(db, user, startedActivity.id, '', T0);

    const page = await listPosts(db, { kind: 'game', gameId }, { viewerId: user });
    expect(page.posts.map((post) => post.activity?.kind ?? 'post').sort()).toEqual(['post', 'review']);
    expect(page.posts.every((post) => post.games.some((item) => item.igdbId === 9401 && item.slug === 'jogo-9401'))).toBe(true);
  });
});

describe('minha relação com o jogo', () => {
  it('devolve a entrada de quem vê, ou nada', async () => {
    const user = await account();
    const entry = await add(user, 9501, 'zerado');
    const id = (await gameRow(9501)).id;
    expect(await viewerEntry(db, user, id)).toEqual({ entryId: entry, status: 'zerado' });
    expect(await viewerEntry(db, await account(), id)).toBeNull();
  });
});

describe('créditos', () => {
  it('junta desenvolvedora e publicadora quando são as mesmas', () => {
    expect(creditsLine(['Team Cherry'], ['Team Cherry'])).toBe('Desenvolvedora e publicadora: Team Cherry');
    expect(creditsLine(['A'], ['B', 'C'])).toBe('Desenvolvedora: A · Publicadora: B, C');
    expect(creditsLine([], ['B'])).toBe('Publicadora: B');
    expect(creditsLine([], [])).toBeNull();
  });
});
