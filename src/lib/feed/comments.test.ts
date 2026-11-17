import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { comments, users } from '@/lib/db/schema';
import { createTestDb, validSignup } from '@/test/db';
import { addComment, COMMENT_MAX, deleteComment, editComment, listComments, normalizeCommentBody, setCommentHidden, setCommentLike, setPostLike, validateComment } from './comments';
import { createPost, deletePost, listPosts } from './posts';

const T0 = new Date('2026-11-17T12:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let counter = 0;
async function account() {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `coment${counter}`, email: `coment${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

async function postBy(userId: string) {
  const result = await createPost(db, userId, { body: 'Um post' }, T0);
  if (!result.ok) throw new Error('post');
  return result.postId;
}

async function comment(userId: string, postId: string, body: string, ms = 0, parentId?: string) {
  const result = await addComment(db, userId, postId, { body, parentId }, after(ms));
  if (!result.ok) throw new Error(`comentário: ${result.error}`);
  return result.commentId;
}

describe('regras do comentário', () => {
  it('só texto, de 1 a 500 caracteres; quebras de linha preservadas', () => {
    expect(validateComment('')).toBe('empty');
    expect(validateComment('a'.repeat(COMMENT_MAX))).toBeNull();
    expect(validateComment('a'.repeat(COMMENT_MAX + 1))).toBe('too-long');
    expect(normalizeCommentBody('  oi\r\ntudo bem  ')).toBe('oi\ntudo bem');
    expect(normalizeCommentBody(7)).toBe('');
  });
});

describe('comentar e responder', () => {
  it('comenta em um post e recusa texto vazio, longo e post que não existe', async () => {
    const author = await account();
    const postId = await postBy(author);
    expect((await addComment(db, author, postId, { body: 'Boa!' })).ok).toBe(true);
    expect(await addComment(db, author, postId, { body: '   ' })).toEqual({ ok: false, error: 'empty' });
    expect(await addComment(db, author, postId, { body: 'a'.repeat(COMMENT_MAX + 1) })).toEqual({ ok: false, error: 'too-long' });
    expect(await addComment(db, author, '00000000-0000-4000-8000-000000000000', { body: 'oi' })).toEqual({ ok: false, error: 'not-found' });
  });

  it('responde a um comentário de 1º nível, mas não a uma resposta (1 nível só)', async () => {
    const owner = await account();
    const postId = await postBy(owner);
    const top = await comment(owner, postId, 'Comentário', 0);
    const replyId = await comment(owner, postId, 'Resposta', 1000, top);
    expect(await addComment(db, owner, postId, { body: 'Resposta da resposta', parentId: replyId })).toEqual({ ok: false, error: 'not-found' });
  });

  it('não responde a comentário de outro post, excluído ou oculto', async () => {
    const owner = await account();
    const other = await account();
    const postA = await postBy(owner);
    const postB = await postBy(owner);
    const onB = await comment(other, postB, 'Em B', 0);
    expect(await addComment(db, owner, postA, { body: 'x', parentId: onB })).toEqual({ ok: false, error: 'not-found' });

    const hidden = await comment(other, postA, 'Vai ser oculto', 1000);
    await setCommentHidden(db, owner, hidden, true);
    expect(await addComment(db, owner, postA, { body: 'x', parentId: hidden })).toEqual({ ok: false, error: 'not-found' });
  });

  it('lista do mais antigo para o mais novo, com as respostas embaixo de cada comentário', async () => {
    const owner = await account();
    const reader = await account();
    const postId = await postBy(owner);
    const first = await comment(owner, postId, 'Primeiro', 0);
    await comment(reader, postId, 'Segundo', 1000);
    await comment(reader, postId, 'Resposta 2', 3000, first);
    await comment(owner, postId, 'Resposta 1', 2000, first);
    const page = await listComments(db, postId, reader);
    expect(page.comments.map((item) => item.body)).toEqual(['Primeiro', 'Segundo']);
    expect(page.comments[0].replies.map((item) => item.body)).toEqual(['Resposta 1', 'Resposta 2']);
    expect(page.postOwnerId).toBe(owner);
  });

  it('pagina de 20 em 20 com cursor, sem repetir nem pular', async () => {
    const owner = await account();
    const postId = await postBy(owner);
    for (let n = 0; n < 25; n += 1) await comment(owner, postId, `Comentário ${n}`, n * 1000);
    const one = await listComments(db, postId, owner);
    expect(one.comments).toHaveLength(20);
    expect(one.next).not.toBeNull();
    const { decodeCursor } = await import('./posts');
    const two = await listComments(db, postId, owner, { after: decodeCursor(one.next) });
    expect(two.comments.map((item) => item.body)).toEqual(['Comentário 20', 'Comentário 21', 'Comentário 22', 'Comentário 23', 'Comentário 24']);
    expect(two.next).toBeNull();
  });
});

describe('editar', () => {
  it('só o autor edita; "editado" só se o texto mudou', async () => {
    const owner = await account();
    const author = await account();
    const postId = await postBy(owner);
    const id = await comment(author, postId, 'Texto', 0);
    expect(await editComment(db, owner, id, 'Invadi')).toEqual({ ok: false, error: 'not-found' });
    expect(await editComment(db, author, id, 'Texto')).toEqual({ ok: true, edited: false });
    expect(await editComment(db, author, id, '')).toEqual({ ok: false, error: 'empty' });
    expect(await editComment(db, author, id, 'Texto novo', after(5000))).toEqual({ ok: true, edited: true });
    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    expect(row.body).toBe('Texto novo');
    expect(row.editedAt).not.toBeNull();
  });
});

describe('excluir', () => {
  it('sem respostas, some de vez', async () => {
    const author = await account();
    const postId = await postBy(author);
    const id = await comment(author, postId, 'Some', 0);
    expect(await deleteComment(db, author, id)).toEqual({ ok: true });
    expect((await listComments(db, postId, author)).comments).toHaveLength(0);
    expect(await deleteComment(db, author, id)).toEqual({ ok: false, error: 'not-found' });
  });

  it('só o autor exclui (o dono do post só oculta)', async () => {
    const owner = await account();
    const author = await account();
    const postId = await postBy(owner);
    const id = await comment(author, postId, 'Meu', 0);
    expect(await deleteComment(db, owner, id)).toEqual({ ok: false, error: 'not-found' });
  });

  it('com respostas, fica "excluído" sem texto e as respostas continuam; sem a última resposta, some junto', async () => {
    const owner = await account();
    const author = await account();
    const postId = await postBy(owner);
    const top = await comment(author, postId, 'Segredo', 0);
    const replyA = await comment(owner, postId, 'Resposta A', 1000, top);
    const replyB = await comment(owner, postId, 'Resposta B', 2000, top);
    await deleteComment(db, author, top, after(3000));
    let page = await listComments(db, postId, owner);
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({ status: 'deleted', body: null });
    expect(page.comments[0].replies.map((item) => item.body)).toEqual(['Resposta A', 'Resposta B']);

    await deleteComment(db, owner, replyA);
    page = await listComments(db, postId, owner);
    expect(page.comments[0].replies.map((item) => item.body)).toEqual(['Resposta B']);
    await deleteComment(db, owner, replyB);
    expect((await listComments(db, postId, owner)).comments).toHaveLength(0);
  });

  it('não dá para curtir, editar nem ocultar comentário excluído', async () => {
    const owner = await account();
    const author = await account();
    const postId = await postBy(owner);
    const top = await comment(author, postId, 'Vai embora', 0);
    await comment(owner, postId, 'Resposta', 1000, top);
    await deleteComment(db, author, top);
    expect(await editComment(db, author, top, 'volta')).toEqual({ ok: false, error: 'not-found' });
    expect(await setCommentHidden(db, owner, top, true)).toEqual({ ok: false, error: 'not-found' });
    expect(await setCommentLike(db, owner, top, true)).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('ocultar', () => {
  it('só o dono do post oculta; todos veem o aviso e só o autor e o dono leem o texto; as respostas saem junto', async () => {
    const owner = await account();
    const author = await account();
    const reader = await account();
    const postId = await postBy(owner);
    const top = await comment(author, postId, 'Texto oculto', 0);
    await comment(reader, postId, 'Resposta', 1000, top);

    expect(await setCommentHidden(db, reader, top, true)).toEqual({ ok: false, error: 'not-found' });
    expect(await setCommentHidden(db, author, top, true)).toEqual({ ok: false, error: 'not-found' });
    expect(await setCommentHidden(db, owner, top, true)).toEqual({ ok: true });

    const seenBy = async (viewer: string) => (await listComments(db, postId, viewer)).comments[0];
    expect(await seenBy(reader)).toMatchObject({ status: 'hidden', body: null, replies: [] });
    expect(await seenBy(owner)).toMatchObject({ status: 'hidden-owner', body: 'Texto oculto', replies: [] });
    expect(await seenBy(author)).toMatchObject({ status: 'hidden-owner', body: 'Texto oculto' });

    await setCommentHidden(db, owner, top, false);
    const shown = await seenBy(reader);
    expect(shown).toMatchObject({ status: 'default', body: 'Texto oculto' });
    expect(shown.replies).toHaveLength(1);
  });

  it('o texto de um comentário oculto nunca vai para quem não pode ler', async () => {
    const owner = await account();
    const author = await account();
    const reader = await account();
    const postId = await postBy(owner);
    const top = await comment(author, postId, 'Muito secreto', 0);
    await setCommentHidden(db, owner, top, true);
    expect(JSON.stringify(await listComments(db, postId, reader))).not.toContain('Muito secreto');
  });
});

describe('curtidas', () => {
  it('uma por pessoa; curtir de novo não duplica e descurtir volta ao contador anterior (post)', async () => {
    const owner = await account();
    const other = await account();
    const postId = await postBy(owner);
    expect(await setPostLike(db, owner, postId, true)).toEqual({ ok: true, liked: true, count: 1 });
    expect(await setPostLike(db, owner, postId, true)).toEqual({ ok: true, liked: true, count: 1 });
    expect(await setPostLike(db, other, postId, true)).toEqual({ ok: true, liked: true, count: 2 });
    expect(await setPostLike(db, owner, postId, false)).toEqual({ ok: true, liked: false, count: 1 });
    expect(await setPostLike(db, owner, postId, false)).toEqual({ ok: true, liked: false, count: 1 });
    expect(await setPostLike(db, owner, '00000000-0000-4000-8000-000000000000', true)).toEqual({ ok: false, error: 'not-found' });
  });

  it('a lista de posts traz o contador, se a pessoa curtiu e quantos comentários há (sem contar os excluídos)', async () => {
    const owner = await account();
    const other = await account();
    const postId = await postBy(owner);
    await setPostLike(db, other, postId, true);
    const keep = await comment(owner, postId, 'Fica', 0);
    const gone = await comment(owner, postId, 'Sai', 1000);
    await comment(other, postId, 'Resposta', 2000, keep);
    await deleteComment(db, owner, gone);
    const asOther = (await listPosts(db, { kind: 'post', postId }, { viewerId: other })).posts[0];
    expect(asOther).toMatchObject({ likeCount: 1, liked: true, commentCount: 2 });
    const asOwner = (await listPosts(db, { kind: 'post', postId }, { viewerId: owner })).posts[0];
    expect(asOwner.liked).toBe(false);
    expect((await listPosts(db, { kind: 'post', postId })).posts[0].liked).toBe(false);
  });

  it('curte comentário e resposta, uma por pessoa, e mostra se quem vê curtiu', async () => {
    const owner = await account();
    const other = await account();
    const postId = await postBy(owner);
    const top = await comment(owner, postId, 'Comentário', 0);
    const reply = await comment(owner, postId, 'Resposta', 1000, top);
    expect(await setCommentLike(db, other, top, true)).toEqual({ ok: true, liked: true, count: 1 });
    expect(await setCommentLike(db, other, top, true)).toEqual({ ok: true, liked: true, count: 1 });
    expect(await setCommentLike(db, owner, top, true)).toEqual({ ok: true, liked: true, count: 2 });
    expect(await setCommentLike(db, other, reply, true)).toEqual({ ok: true, liked: true, count: 1 });
    const seen = (await listComments(db, postId, other)).comments[0];
    expect(seen).toMatchObject({ likeCount: 2, liked: true });
    expect(seen.replies[0]).toMatchObject({ likeCount: 1, liked: true });
    expect((await listComments(db, postId, owner)).comments[0].replies[0].liked).toBe(false);
    expect(await setCommentLike(db, other, top, false)).toEqual({ ok: true, liked: false, count: 1 });
  });
});

describe('excluir o post', () => {
  it('apaga comentários e curtidas junto', async () => {
    const owner = await account();
    const other = await account();
    const postId = await postBy(owner);
    const top = await comment(other, postId, 'Vai junto', 0);
    await setPostLike(db, other, postId, true);
    await setCommentLike(db, owner, top, true);
    expect(await deletePost(db, owner, postId)).toMatchObject({ ok: true });
    expect(await db.select().from(comments).where(eq(comments.postId, postId))).toHaveLength(0);
    expect(await setCommentLike(db, owner, top, true)).toEqual({ ok: false, error: 'not-found' });
  });
});
