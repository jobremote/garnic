import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { screenshotReports, users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { createTestDb, validSignup } from '@/test/db';
import { getEntry, removeEntry, updateEntry } from './entry';
import { getPublicEntry, REPORT_DETAILS_MAX, reportScreenshot } from './screenshot';
import { addToShelf } from './shelf';

const T0 = new Date('2026-11-11T12:00:00.000Z');
const game = (igdbId: number): IgdbGame => ({ igdbId, name: `Jogo ${igdbId}`, slug: null, coverImageId: null, releasedAt: null, platforms: [] });
const BLOB = (userId: string, name = 'screenshot-Ab12.png') => `https://abc123.public.blob.vercel-storage.com/screenshots/${userId}/${name}`;

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `shot${counter}`, email: `shot${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}
async function entryOf(userId: string, igdbId: number) {
  const added = await addToShelf(db, userId, game(igdbId), 'zerado', T0);
  if (!added.ok) throw new Error('falhou');
  return added.entryId;
}

describe('screenshot da entrada', () => {
  it('salva a referência e o spoiler; uma por entrada, trocar devolve a antiga para apagar', async () => {
    const userId = await account();
    const entryId = await entryOf(userId, 3001);
    const first = await updateEntry(db, userId, entryId, { screenshot: BLOB(userId), screenshotSpoiler: true }, T0);
    expect(first).toMatchObject({ ok: true, replacedScreenshot: null });
    expect(await getEntry(db, userId, entryId)).toMatchObject({ screenshotRef: BLOB(userId), screenshotSpoiler: true });

    const second = await updateEntry(db, userId, entryId, { screenshot: BLOB(userId, 'screenshot-Zz99.png') }, T0);
    expect(second).toMatchObject({ ok: true, replacedScreenshot: BLOB(userId) });
    expect((await getEntry(db, userId, entryId))?.screenshotRef).toBe(BLOB(userId, 'screenshot-Zz99.png'));
  });

  it('remover a screenshot (null) devolve a antiga; mudar só o spoiler mantém a imagem', async () => {
    const userId = await account();
    const entryId = await entryOf(userId, 3002);
    await updateEntry(db, userId, entryId, { screenshot: BLOB(userId) }, T0);
    await updateEntry(db, userId, entryId, { screenshotSpoiler: true }, T0);
    expect(await getEntry(db, userId, entryId)).toMatchObject({ screenshotRef: BLOB(userId), screenshotSpoiler: true });
    expect(await updateEntry(db, userId, entryId, { screenshot: null }, T0)).toMatchObject({ ok: true, replacedScreenshot: BLOB(userId) });
    expect((await getEntry(db, userId, entryId))?.screenshotRef).toBeNull();
  });

  it('só aceita imagem da própria pasta de screenshots', async () => {
    const a = await account();
    const b = await account();
    const entryId = await entryOf(a, 3003);
    for (const screenshot of [BLOB(b), `https://abc123.public.blob.vercel-storage.com/avatars/${a}/avatar.png`, 'https://evil.example.com/x.png', '../.env', `${BLOB(a)}?x=1`]) {
      expect(await updateEntry(db, a, entryId, { screenshot, rating: 5 }, T0)).toMatchObject({ ok: false, errors: { screenshot: 'invalid-screenshot' } });
    }
    expect((await getEntry(db, a, entryId))?.rating).toBeNull(); // nada gravado junto
  });

  it('remover a entrada devolve a screenshot para ser apagada do armazenamento', async () => {
    const userId = await account();
    const entryId = await entryOf(userId, 3004);
    await updateEntry(db, userId, entryId, { screenshot: BLOB(userId) }, T0);
    expect(await removeEntry(db, userId, entryId)).toMatchObject({ ok: true, screenshotRef: BLOB(userId) });
  });
});

describe('ver a entrada de outra pessoa', () => {
  it('qualquer pessoa logada vê os detalhes públicos, com a screenshot e o aviso de spoiler', async () => {
    const owner = await account();
    const viewer = await account();
    const entryId = await entryOf(owner, 3010);
    await updateEntry(db, owner, entryId, { rating: 4, review: 'O final é triste.', reviewSpoiler: true, screenshot: BLOB(owner), screenshotSpoiler: true }, T0);
    const view = await getPublicEntry(db, viewer, entryId);
    expect(view).toMatchObject({ ownerId: owner, rating: 4, review: 'O final é triste.', reviewSpoiler: true, screenshotRef: BLOB(owner), screenshotSpoiler: true, reportedByViewer: false });
  });

  it('entrada inexistente não é encontrada', async () => {
    const viewer = await account();
    expect(await getPublicEntry(db, viewer, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('denunciar screenshot', () => {
  async function withScreenshot() {
    const owner = await account();
    const entryId = await entryOf(owner, 3100 + counter);
    await updateEntry(db, owner, entryId, { screenshot: BLOB(owner) }, T0);
    return { owner, entryId };
  }

  it('só registra: guarda quem denunciou, a imagem e o motivo, e a imagem continua lá', async () => {
    const { owner, entryId } = await withScreenshot();
    const reporter = await account();
    expect(await reportScreenshot(db, reporter, entryId, { reason: 'spoiler', details: '  Entrega o final   do jogo ' })).toEqual({ ok: true, alreadyReported: false });
    const [report] = await db.select().from(screenshotReports).where(eq(screenshotReports.reporterId, reporter));
    expect(report).toMatchObject({ entryId, screenshotRef: BLOB(owner), reason: 'spoiler', details: 'Entrega o final do jogo' });
    expect((await getEntry(db, owner, entryId))?.screenshotRef).toBe(BLOB(owner));
    expect((await getPublicEntry(db, reporter, entryId))?.reportedByViewer).toBe(true);
  });

  it('denunciar a mesma imagem de novo não duplica', async () => {
    const { entryId } = await withScreenshot();
    const reporter = await account();
    await reportScreenshot(db, reporter, entryId, { reason: 'spam' });
    expect(await reportScreenshot(db, reporter, entryId, { reason: 'other' })).toEqual({ ok: true, alreadyReported: true });
    expect(await db.select().from(screenshotReports).where(eq(screenshotReports.reporterId, reporter))).toHaveLength(1);
  });

  it('uma imagem nova na mesma entrada pode ser denunciada de novo', async () => {
    const { owner, entryId } = await withScreenshot();
    const reporter = await account();
    await reportScreenshot(db, reporter, entryId, { reason: 'spam' });
    await updateEntry(db, owner, entryId, { screenshot: BLOB(owner, 'screenshot-Novo1.png') }, T0);
    expect(await reportScreenshot(db, reporter, entryId, { reason: 'spam' })).toEqual({ ok: true, alreadyReported: false });
  });

  it('não dá para denunciar a própria screenshot nem uma entrada sem screenshot', async () => {
    const { owner, entryId } = await withScreenshot();
    expect(await reportScreenshot(db, owner, entryId, { reason: 'spam' })).toEqual({ ok: false, error: 'own-entry' });
    const other = await account();
    const bare = await entryOf(other, 3200 + counter);
    const reporter = await account();
    expect(await reportScreenshot(db, reporter, bare, { reason: 'spam' })).toEqual({ ok: false, error: 'not-found' });
  });

  it('motivo inválido e detalhes longos demais são recusados', async () => {
    const { entryId } = await withScreenshot();
    const reporter = await account();
    expect(await reportScreenshot(db, reporter, entryId, { reason: 'odeio' })).toMatchObject({ ok: false, error: 'invalid', errors: { reason: 'invalid-reason' } });
    expect(await reportScreenshot(db, reporter, entryId, { reason: 'spam', details: 'a'.repeat(REPORT_DETAILS_MAX + 1) })).toMatchObject({ errors: { details: 'details-too-long' } });
    expect(await db.select().from(screenshotReports).where(eq(screenshotReports.reporterId, reporter))).toHaveLength(0);
  });

  it('a denúncia sobrevive se a entrada for removida (o entry_id fica nulo)', async () => {
    const { owner, entryId } = await withScreenshot();
    const reporter = await account();
    await reportScreenshot(db, reporter, entryId, { reason: 'inappropriate' });
    await removeEntry(db, owner, entryId);
    const [report] = await db.select().from(screenshotReports).where(eq(screenshotReports.reporterId, reporter));
    expect(report).toMatchObject({ entryId: null, screenshotRef: BLOB(owner), reason: 'inappropriate' });
  });
});
