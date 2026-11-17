import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { postGames, posts, shelfActivities, shelfEntries, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { deletePost } from '@/lib/feed/posts';
import { createTestDb, validSignup } from '@/test/db';
import { ACTIVITY_NOTE_MAX, listEntryActivities, MERGE_WINDOW_MS, shareActivity } from './activity';
import { removeEntry, updateEntry } from './entry';
import { addToShelf, moveEntry, placeEntry } from './shelf';

const T0 = new Date('2026-11-17T12:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60 * 1000;

const game = (igdbId: number): IgdbGame => ({ igdbId, name: `Jogo ${igdbId}`, slug: `jogo-${igdbId}`, coverImageId: `co${igdbId}`, releasedAt: new Date('2020-01-01T00:00:00.000Z'), platforms: ['PC'] });

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `ativ${counter}`, email: `ativ${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

async function entryOf(userId: string, igdbId: number, status = 'quero-jogar') {
  const added = await addToShelf(db, userId, game(igdbId), status, T0);
  if (!added.ok) throw new Error('add');
  return added;
}

const kinds = async (userId: string, entryId: string) => (await listEntryActivities(db, userId, entryId)).map((activity) => activity.kind);

describe('registro das atividades', () => {
  it('adicionar ao Game Shelf gera a atividade da coluna (Quero jogar = adicionou)', async () => {
    const user = await account();
    const added = await entryOf(user, 1);
    expect(added.activity?.kind).toBe('added');
    expect(await kinds(user, added.entryId)).toEqual(['added']);
  });

  it('entrar direto em Jogando, Zerado ou Parado gera a atividade daquela coluna', async () => {
    const user = await account();
    expect((await entryOf(user, 2, 'jogando')).activity?.kind).toBe('started');
    expect((await entryOf(user, 3, 'zerado')).activity?.kind).toBe('finished');
    expect((await entryOf(user, 4, 'parado')).activity?.kind).toBe('stopped');
  });

  it('jogo que já estava na Game Shelf não gera atividade nova', async () => {
    const user = await account();
    await entryOf(user, 5);
    const again = await addToShelf(db, user, game(5), 'jogando', after(MIN));
    expect(again.ok && again.alreadyOnShelf && again.activity).toBeFalsy();
  });

  it('mudar de coluna gera a atividade; mover para a mesma coluna não gera', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 6);
    const moved = await moveEntry(db, user, entryId, 'jogando', after(MIN));
    expect(moved.ok && moved.activity?.kind).toBe('started');
    const same = await moveEntry(db, user, entryId, 'jogando', after(2 * MIN));
    expect(same.ok && same.activity).toBeFalsy();
  });

  it('arrastar para outra coluna também gera a atividade', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 7);
    const placed = await placeEntry(db, user, entryId, 'zerado', [entryId], after(MIN));
    expect(placed.ok && placed.activity?.kind).toBe('finished');
  });

  it('repetição real conta como atividade nova (Jogando, Parado, Jogando = dois "começou")', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 8, 'jogando');
    await moveEntry(db, user, entryId, 'parado', after(MIN));
    await moveEntry(db, user, entryId, 'jogando', after(2 * MIN));
    expect((await kinds(user, entryId)).filter((kind) => kind === 'started')).toHaveLength(2);
  });

  it('Zerou guarda tempo e nota só quando a pessoa informou', async () => {
    const user = await account();
    const without = await entryOf(user, 9, 'jogando');
    await updateEntry(db, user, without.entryId, { status: 'zerado' }, after(MIN));
    const [bare] = await listEntryActivities(db, user, without.entryId);
    expect(bare).toMatchObject({ kind: 'finished', rating: null, playMinutes: null });

    const withData = await entryOf(user, 10, 'jogando');
    await updateEntry(db, user, withData.entryId, { status: 'zerado', rating: 5, playMinutes: 38 * 60 }, after(MIN));
    const list = await listEntryActivities(db, user, withData.entryId);
    expect(list[0]).toMatchObject({ kind: 'finished', rating: 5, playMinutes: 38 * 60 });
    // A nota que veio junto com "Zerou" não vira uma atividade "Avaliou" à parte.
    expect(list.map((activity) => activity.kind)).toEqual(['finished', 'started']);
  });

  it('nota e tempo informados no pop-up do Zerado completam o "Zerou" recente, sem criar "Avaliou"', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 16, 'jogando');
    const moved = await moveEntry(db, user, entryId, 'zerado', after(MIN));
    if (!moved.ok || !moved.activity) throw new Error('move');
    const saved = await updateEntry(db, user, entryId, { rating: 5, playMinutes: 38 * 60 }, after(2 * MIN));
    expect(saved.ok && saved.activities).toEqual([{ id: moved.activity.id, kind: 'finished' }]);
    const list = await listEntryActivities(db, user, entryId);
    expect(list.map((activity) => activity.kind)).toEqual(['finished', 'started']);
    expect(list[0]).toMatchObject({ rating: 5, playMinutes: 38 * 60 });
  });

  it('nota informada bem depois de zerar vira "Avaliou"', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 17, 'jogando');
    await moveEntry(db, user, entryId, 'zerado', after(MIN));
    await updateEntry(db, user, entryId, { rating: 4 }, after(MIN + MERGE_WINDOW_MS + MIN));
    expect(await kinds(user, entryId)).toEqual(['rated', 'finished', 'started']);
  });

  it('nota, review e screenshot geram atividade; editar tag, plataforma e datas não', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 11, 'jogando');
    await updateEntry(db, user, entryId, { platform: 'PC', started: { month: 10, year: 2026 }, ended: { month: null, year: null } }, after(MIN));
    expect(await kinds(user, entryId)).toEqual(['started']);
    await updateEntry(db, user, entryId, { rating: 4 }, after(2 * MIN));
    await updateEntry(db, user, entryId, { review: 'Muito bom', reviewSpoiler: true }, after(3 * MIN));
    expect(await kinds(user, entryId)).toEqual(['review', 'rated', 'started']);
    const review = (await db.select().from(shelfActivities).where(eq(shelfActivities.kind, 'review'))).find((row) => row.entryId === entryId);
    expect(review).toMatchObject({ review: 'Muito bom', spoiler: true });
  });

  it('screenshot nova gera atividade com a referência e o spoiler; trocar o spoiler sozinho não', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 12, 'jogando');
    const ref = 'screenshots/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
    await updateEntry(db, user, entryId, { screenshot: ref, screenshotSpoiler: true }, after(MIN));
    const [row] = await db.select().from(shelfActivities).where(eq(shelfActivities.screenshotRef, ref));
    expect(row).toMatchObject({ kind: 'screenshot', spoiler: true });
    await updateEntry(db, user, entryId, { screenshotSpoiler: false }, after(2 * MIN));
    expect((await kinds(user, entryId)).filter((kind) => kind === 'screenshot')).toHaveLength(1);
  });

  it('edições seguidas da mesma nota em poucos minutos viram uma só atividade', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 13, 'jogando');
    await updateEntry(db, user, entryId, { rating: 3 }, after(MIN));
    await updateEntry(db, user, entryId, { rating: 4 }, after(2 * MIN));
    const rated = (await listEntryActivities(db, user, entryId)).filter((activity) => activity.kind === 'rated');
    expect(rated).toHaveLength(1);
    expect(rated[0].rating).toBe(4);
    // Passada a janela, é uma atividade nova.
    await updateEntry(db, user, entryId, { rating: 5 }, after(2 * MIN + MERGE_WINDOW_MS + MIN));
    expect((await listEntryActivities(db, user, entryId)).filter((activity) => activity.kind === 'rated')).toHaveLength(2);
  });

  it('se a atividade anterior já virou post, a edição seguinte não a altera', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 14, 'jogando');
    const first = await updateEntry(db, user, entryId, { rating: 3 }, after(MIN));
    if (!first.ok) throw new Error('save');
    const shared = await shareActivity(db, user, first.activities[0].id, '', after(MIN));
    expect(shared.ok).toBe(true);
    await updateEntry(db, user, entryId, { rating: 5 }, after(2 * MIN));
    const [row] = await db.select().from(shelfActivities).where(eq(shelfActivities.id, first.activities[0].id));
    expect(row.rating).toBe(3);
  });

  it('limpar a nota ou a review não gera atividade', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 15, 'jogando');
    await updateEntry(db, user, entryId, { rating: 4, review: 'Bom' }, after(MIN));
    await updateEntry(db, user, entryId, { rating: null, review: null }, after(MIN + MERGE_WINDOW_MS + MIN));
    expect((await kinds(user, entryId)).filter((kind) => kind === 'rated' || kind === 'review')).toHaveLength(2);
  });
});

describe('compartilhar', () => {
  async function setup() {
    const user = await account();
    const { entryId, activity } = await entryOf(user, 100 + counter, 'jogando');
    return { user, entryId, activityId: activity!.id };
  }

  it('cria o post de atividade com o texto opcional e o jogo marcado', async () => {
    const { user, activityId } = await setup();
    const result = await shareActivity(db, user, activityId, '  Bora!  ', after(MIN));
    expect(result.ok && !result.alreadyShared).toBe(true);
    if (!result.ok) return;
    const [post] = await db.select().from(posts).where(eq(posts.id, result.postId));
    expect(post).toMatchObject({ body: 'Bora!', activityId, spoiler: false, userId: user });
    expect(await db.select().from(postGames).where(eq(postGames.postId, post.id))).toHaveLength(1);
  });

  it('sem clique nada é publicado: só registrar a atividade não cria post', async () => {
    const { activityId } = await setup();
    expect(await db.select().from(posts).where(eq(posts.activityId, activityId))).toHaveLength(0);
  });

  it('cada atividade vira no máximo um post: compartilhar de novo devolve o mesmo', async () => {
    const { user, activityId } = await setup();
    const first = await shareActivity(db, user, activityId, '', after(MIN));
    const second = await shareActivity(db, user, activityId, 'outro texto', after(2 * MIN));
    expect(first.ok && second.ok && second.alreadyShared && second.postId === first.postId).toBe(true);
  });

  it('se o post for apagado, o botão volta (a atividade pode ser compartilhada de novo)', async () => {
    const { user, entryId, activityId } = await setup();
    const first = await shareActivity(db, user, activityId, '', after(MIN));
    if (!first.ok) throw new Error('share');
    expect((await listEntryActivities(db, user, entryId))[0].postId).toBe(first.postId);
    await deletePost(db, user, first.postId);
    expect((await listEntryActivities(db, user, entryId))[0].postId).toBeNull();
    const again = await shareActivity(db, user, activityId, '', after(3 * MIN));
    expect(again.ok && !again.alreadyShared).toBe(true);
  });

  it('review ou screenshot com spoiler geram post com spoiler ativo', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 200 + counter, 'jogando');
    const saved = await updateEntry(db, user, entryId, { review: 'Final incrível', reviewSpoiler: true }, after(MIN));
    if (!saved.ok) throw new Error('save');
    const result = await shareActivity(db, user, saved.activities[0].id, '', after(MIN));
    if (!result.ok) throw new Error('share');
    const [post] = await db.select().from(posts).where(eq(posts.id, result.postId));
    expect(post.spoiler).toBe(true);
  });

  it('só a dona compartilha a própria atividade; texto muito longo é recusado', async () => {
    const { user, activityId } = await setup();
    const other = await account();
    expect(await shareActivity(db, other, activityId, '', after(MIN))).toEqual({ ok: false, error: 'not-found' });
    expect(await shareActivity(db, user, activityId, 'x'.repeat(ACTIVITY_NOTE_MAX + 1), after(MIN))).toEqual({ ok: false, error: 'too-long' });
    expect(await db.select().from(posts).where(eq(posts.activityId, activityId))).toHaveLength(0);
  });
});

describe('tirar o jogo da Game Shelf', () => {
  it('apaga as atividades que não viraram post e mantém as que viraram', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 300 + counter, 'jogando');
    const saved = await updateEntry(db, user, entryId, { rating: 5 }, after(MIN));
    if (!saved.ok) throw new Error('save');
    const shared = await shareActivity(db, user, saved.activities[0].id, '', after(MIN));
    if (!shared.ok) throw new Error('share');
    await removeEntry(db, user, entryId);
    expect(await db.select().from(shelfEntries).where(eq(shelfEntries.id, entryId))).toHaveLength(0);
    const left = await db.select().from(shelfActivities).where(eq(shelfActivities.userId, user));
    expect(left.map((row) => row.kind)).toEqual(['rated']);
    expect(left[0].entryId).toBeNull();
    expect((await db.select().from(posts).where(eq(posts.id, shared.postId))).length).toBe(1);
  });

  it('a screenshot de um post de atividade não sai do armazenamento enquanto o post existir', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 400 + counter, 'jogando');
    const ref = 'screenshots/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
    const saved = await updateEntry(db, user, entryId, { screenshot: ref }, after(MIN));
    if (!saved.ok) throw new Error('save');
    await shareActivity(db, user, saved.activities[0].id, '', after(MIN));
    const replaced = await updateEntry(db, user, entryId, { screenshot: null }, after(2 * MIN));
    expect(replaced.ok && replaced.replacedScreenshot).toBeNull();
    const removed = await removeEntry(db, user, entryId);
    expect(removed.ok && removed.screenshotRef).toBeNull();
  });

  it('screenshot sem post sai normalmente e a atividade dela some', async () => {
    const user = await account();
    const { entryId } = await entryOf(user, 500 + counter, 'jogando');
    const ref = 'screenshots/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png';
    await updateEntry(db, user, entryId, { screenshot: ref }, after(MIN));
    const replaced = await updateEntry(db, user, entryId, { screenshot: null }, after(2 * MIN));
    expect(replaced.ok && replaced.replacedScreenshot).toBe(ref);
    expect(await db.select().from(shelfActivities).where(eq(shelfActivities.screenshotRef, ref))).toHaveLength(0);
  });
});
