import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { reports, users } from '@/lib/db/schema';
import { REPORT_DETAILS_MAX } from '@/lib/shelf/screenshot';
import { createTestDb, validSignup } from '@/test/db';
import { addComment, deleteComment } from './comments';
import { createPost, deletePost } from './posts';
import { reportContent } from './reports';

const T0 = new Date('2026-11-17T12:00:00.000Z');

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account(verified = true) {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `denun${counter}`, email: `denun${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result));
  if (verified) await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

async function setup() {
  const author = await account();
  const reporter = await account();
  const post = await createPost(db, author, { body: 'Post' }, T0);
  if (!post.ok) throw new Error('post');
  const comment = await addComment(db, author, post.postId, { body: 'Comentário' }, T0);
  if (!comment.ok) throw new Error('comentário');
  return { author, reporter, postId: post.postId, commentId: comment.commentId };
}

describe('denunciar post, comentário e usuário', () => {
  it('registra a denúncia dos três alvos, com motivo e detalhes', async () => {
    const { author, reporter, postId, commentId } = await setup();
    expect(await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'spam', details: '  vende   coisa  ' })).toEqual({ ok: true, alreadyReported: false });
    expect(await reportContent(db, reporter, { kind: 'comment', id: commentId }, { reason: 'inappropriate' })).toEqual({ ok: true, alreadyReported: false });
    expect(await reportContent(db, reporter, { kind: 'user', id: author }, { reason: 'other', details: 'foto ofensiva' })).toEqual({ ok: true, alreadyReported: false });
    const rows = await db.select().from(reports).where(eq(reports.reporterId, reporter));
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.postId === postId)).toMatchObject({ reason: 'spam', details: 'vende coisa', commentId: null, reportedUserId: null });
    expect(rows.find((row) => row.commentId === commentId)).toMatchObject({ reason: 'inappropriate', details: null });
    expect(rows.find((row) => row.reportedUserId === author)).toMatchObject({ reason: 'other', details: 'foto ofensiva' });
  });

  it('denunciar de novo o mesmo alvo não duplica', async () => {
    const { reporter, postId } = await setup();
    await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'spam' });
    expect(await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'other' })).toEqual({ ok: true, alreadyReported: true });
    expect(await db.select().from(reports).where(eq(reports.postId, postId))).toHaveLength(1);
  });

  it('outra pessoa pode denunciar o mesmo alvo', async () => {
    const { reporter, postId } = await setup();
    const other = await account();
    await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'spam' });
    expect(await reportContent(db, other, { kind: 'post', id: postId }, { reason: 'spam' })).toEqual({ ok: true, alreadyReported: false });
    expect(await db.select().from(reports).where(eq(reports.postId, postId))).toHaveLength(2);
  });

  it('não dá para denunciar o que é seu', async () => {
    const { author, postId, commentId } = await setup();
    expect(await reportContent(db, author, { kind: 'post', id: postId }, { reason: 'spam' })).toEqual({ ok: false, error: 'own-content' });
    expect(await reportContent(db, author, { kind: 'comment', id: commentId }, { reason: 'spam' })).toEqual({ ok: false, error: 'own-content' });
    expect(await reportContent(db, author, { kind: 'user', id: author }, { reason: 'spam' })).toEqual({ ok: false, error: 'own-content' });
  });

  it('exige motivo válido e limita os detalhes a 500 caracteres', async () => {
    const { reporter, postId } = await setup();
    expect(await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'xyz' })).toEqual({ ok: false, error: 'invalid', errors: { reason: 'invalid-reason' } });
    expect(await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: undefined })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'spam', details: 'a'.repeat(REPORT_DETAILS_MAX + 1) })).toEqual({ ok: false, error: 'invalid', errors: { details: 'details-too-long' } });
    expect(await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'spam', details: 'a'.repeat(REPORT_DETAILS_MAX) })).toEqual({ ok: true, alreadyReported: false });
  });

  it('alvo que não existe, comentário excluído e conta não validada dão "não encontrado"', async () => {
    const { author, reporter, postId } = await setup();
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const kind of ['post', 'comment', 'user'] as const) expect(await reportContent(db, reporter, { kind, id: missing }, { reason: 'spam' })).toEqual({ ok: false, error: 'not-found' });
    const gone = await addComment(db, author, postId, { body: 'Vai sair' }, T0);
    if (!gone.ok) throw new Error('comentário');
    await deleteComment(db, author, gone.commentId);
    expect(await reportContent(db, reporter, { kind: 'comment', id: gone.commentId }, { reason: 'spam' })).toEqual({ ok: false, error: 'not-found' });
    const unverified = await account(false);
    expect(await reportContent(db, reporter, { kind: 'user', id: unverified }, { reason: 'spam' })).toEqual({ ok: false, error: 'not-found' });
  });

  it('excluir o post leva as denúncias dele junto', async () => {
    const { author, reporter, postId } = await setup();
    await reportContent(db, reporter, { kind: 'post', id: postId }, { reason: 'spam' });
    await deletePost(db, author, postId);
    expect(await db.select().from(reports).where(eq(reports.reporterId, reporter))).toHaveLength(0);
  });
});
