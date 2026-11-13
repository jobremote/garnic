import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '@/lib/auth/users';
import type { Db } from '@/lib/db/connect';
import { users } from '@/lib/db/schema';
import type { IgdbGame } from '@/lib/igdb/igdb';
import { addToShelf } from '@/lib/shelf/shelf';
import { createTestDb, validSignup } from '@/test/db';
import { followCounters, followUser, isFollowing, suggestedUsers, unfollowUser } from './follows';
import { createPost, decodeCursor, deletePost, encodeCursor, listPosts, normalizePostBody, PAGE_SIZE, POST_MAX, updatePost, validatePost } from './posts';
import { timeAgo } from './time';

const T0 = new Date('2026-11-13T12:00:00.000Z');
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
async function account(verified = true) {
  counter += 1;
  const result = await registerUser(db, { ...validSignup, username: `feed${counter}`, email: `feed${counter}@email.com` }, T0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  if (verified) await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, result.user.id));
  return result.user.id;
}

describe('regras do post', () => {
  it('texto ou imagem é obrigatório; só marcar o jogo não basta', () => {
    expect(validatePost('', false)).toBe('empty');
    expect(validatePost('Oi', false)).toBeNull();
    expect(validatePost('', true)).toBeNull();
  });

  it('o texto vai até 1.500 caracteres', () => {
    expect(validatePost('a'.repeat(POST_MAX), false)).toBeNull();
    expect(validatePost('a'.repeat(POST_MAX + 1), false)).toBe('too-long');
  });

  it('preserva quebras de linha e apara as pontas', () => {
    expect(normalizePostBody('  linha 1\r\nlinha 2  \n')).toBe('linha 1\nlinha 2');
    expect(normalizePostBody(42)).toBe('');
  });
});

describe('criar, editar e excluir post', () => {
  it('cria um post só com texto', async () => {
    const userId = await account();
    const result = await createPost(db, userId, { body: 'Primeiro post' }, T0);
    expect(result.ok).toBe(true);
    const page = await listPosts(db, { kind: 'user', userId });
    expect(page.posts).toHaveLength(1);
    expect(page.posts[0]).toMatchObject({ body: 'Primeiro post', imageRef: null, spoiler: false, editedAt: null, game: null, authorStatus: null });
  });

  it('cria um post só com imagem, com jogo marcado e spoiler', async () => {
    const userId = await account();
    const result = await createPost(db, userId, { body: '', imageRef: 'posts/a.jpg', spoiler: true, game: game(10, 'Celeste') }, T0);
    expect(result.ok).toBe(true);
    const [post] = (await listPosts(db, { kind: 'user', userId })).posts;
    expect(post).toMatchObject({ body: '', imageRef: 'posts/a.jpg', spoiler: true, game: { igdbId: 10, name: 'Celeste', coverImageId: 'co10' } });
  });

  it('recusa post vazio e post só com o jogo marcado', async () => {
    const userId = await account();
    expect(await createPost(db, userId, { body: '   ' }, T0)).toEqual({ ok: false, error: 'empty' });
    expect(await createPost(db, userId, { body: '', game: game(11) }, T0)).toEqual({ ok: false, error: 'empty' });
    expect(await createPost(db, userId, { body: 'a'.repeat(POST_MAX + 1) }, T0)).toEqual({ ok: false, error: 'too-long' });
    expect((await listPosts(db, { kind: 'user', userId })).posts).toHaveLength(0);
  });

  it('o jogo marcado não precisa estar no Game Shelf; com status, mostra o do autor', async () => {
    const userId = await account();
    await createPost(db, userId, { body: 'Fora do Game Shelf', game: game(20) }, after(1));
    await addToShelf(db, userId, game(21, 'Hades'), 'jogando', T0);
    await createPost(db, userId, { body: 'Dentro do Game Shelf', game: game(21, 'Hades') }, after(2));
    const [dentro, fora] = (await listPosts(db, { kind: 'user', userId })).posts;
    expect(dentro.authorStatus).toBe('jogando');
    expect(fora.authorStatus).toBeNull();
  });

  it('edita só o próprio post e marca "editado" apenas quando algo mudou', async () => {
    const dona = await account();
    const outra = await account();
    const created = await createPost(db, dona, { body: 'Texto original' }, T0);
    if (!created.ok) throw new Error('post');

    expect(await updatePost(db, outra, created.postId, { body: 'Invasão', game: { kind: 'keep' } }, after(10))).toEqual({ ok: false, error: 'not-found' });

    const same = await updatePost(db, dona, created.postId, { body: 'Texto original', game: { kind: 'keep' } }, after(20));
    expect(same).toMatchObject({ ok: true, edited: false });
    expect((await listPosts(db, { kind: 'user', userId: dona })).posts[0].editedAt).toBeNull();

    const changed = await updatePost(db, dona, created.postId, { body: 'Texto novo', spoiler: true, game: { kind: 'set', game: game(30, 'Hollow Knight') } }, after(30));
    expect(changed).toMatchObject({ ok: true, edited: true });
    const [post] = (await listPosts(db, { kind: 'user', userId: dona })).posts;
    expect(post).toMatchObject({ body: 'Texto novo', spoiler: true, game: { name: 'Hollow Knight' } });
    expect(post.editedAt?.getTime()).toBe(after(30).getTime());
  });

  it('trocar ou tirar a imagem devolve a antiga para ser apagada, e a edição não deixa o post vazio', async () => {
    const userId = await account();
    const created = await createPost(db, userId, { body: '', imageRef: 'posts/old.jpg' }, T0);
    if (!created.ok) throw new Error('post');
    expect(await updatePost(db, userId, created.postId, { body: '', imageRef: null, game: { kind: 'keep' } }, after(1))).toEqual({ ok: false, error: 'empty' });
    const swap = await updatePost(db, userId, created.postId, { body: '', imageRef: 'posts/new.jpg', game: { kind: 'keep' } }, after(2));
    expect(swap).toEqual({ ok: true, edited: true, replacedImageRef: 'posts/old.jpg' });
    const remove = await updatePost(db, userId, created.postId, { body: 'Agora com texto', imageRef: null, game: { kind: 'keep' } }, after(3));
    expect(remove).toEqual({ ok: true, edited: true, replacedImageRef: 'posts/new.jpg' });
  });

  it('tirar o jogo marcado funciona', async () => {
    const userId = await account();
    const created = await createPost(db, userId, { body: 'Com jogo', game: game(40) }, T0);
    if (!created.ok) throw new Error('post');
    await updatePost(db, userId, created.postId, { body: 'Com jogo', game: { kind: 'none' } }, after(1));
    expect((await listPosts(db, { kind: 'user', userId })).posts[0].game).toBeNull();
  });

  it('só quem postou exclui, e a imagem volta para ser apagada', async () => {
    const dona = await account();
    const outra = await account();
    const created = await createPost(db, dona, { body: 'Apagar', imageRef: 'posts/x.jpg' }, T0);
    if (!created.ok) throw new Error('post');
    expect(await deletePost(db, outra, created.postId)).toEqual({ ok: false, error: 'not-found' });
    expect(await deletePost(db, dona, created.postId)).toEqual({ ok: true, imageRef: 'posts/x.jpg' });
    expect((await listPosts(db, { kind: 'user', userId: dona })).posts).toHaveLength(0);
  });
});

describe('abas do feed', () => {
  it('Seguindo mostra os posts de quem a pessoa segue e os próprios, do mais recente para o mais antigo', async () => {
    const eu = await account();
    const amiga = await account();
    const estranha = await account();
    await followUser(db, eu, amiga);
    await createPost(db, amiga, { body: 'da amiga' }, after(1000));
    await createPost(db, estranha, { body: 'da estranha' }, after(2000));
    await createPost(db, eu, { body: 'meu' }, after(3000));
    const bodies = (await listPosts(db, { kind: 'following', viewerId: eu })).posts.map((post) => post.body);
    expect(bodies).toEqual(['meu', 'da amiga']);
  });

  it('Meus jogos mostra posts que marcam jogos em Quero jogar, Jogando ou Zerado; Parado não entra', async () => {
    const eu = await account();
    const autora = await account();
    await addToShelf(db, eu, game(101), 'quero-jogar', T0);
    await addToShelf(db, eu, game(102), 'jogando', T0);
    await addToShelf(db, eu, game(103), 'zerado', T0);
    await addToShelf(db, eu, game(104), 'parado', T0);
    for (const [i, id] of [101, 102, 103, 104, 105].entries()) await createPost(db, autora, { body: `sobre ${id}`, game: game(id) }, after(i));
    await createPost(db, autora, { body: 'sem jogo' }, after(10));
    const bodies = (await listPosts(db, { kind: 'my-games', viewerId: eu })).posts.map((post) => post.body).sort();
    expect(bodies).toEqual(['sobre 101', 'sobre 102', 'sobre 103']);
  });

  it('posts de contas não validadas não aparecem', async () => {
    const naoValidada = await account(false);
    await createPost(db, naoValidada, { body: 'invisível' }, T0);
    const bodies = (await listPosts(db, { kind: 'all' })).posts.map((post) => post.body);
    expect(bodies).not.toContain('invisível');
  });

  it('pagina em blocos com cursor, sem repetir nem pular posts', async () => {
    const userId = await account();
    for (let i = 0; i < 5; i += 1) await createPost(db, userId, { body: `p${i}` }, after(100_000 + i * 1000));
    const first = await listPosts(db, { kind: 'user', userId }, { limit: 2 });
    expect(first.posts.map((post) => post.body)).toEqual(['p4', 'p3']);
    expect(first.next).not.toBeNull();
    const second = await listPosts(db, { kind: 'user', userId }, { limit: 2, before: decodeCursor(first.next) });
    expect(second.posts.map((post) => post.body)).toEqual(['p2', 'p1']);
    const third = await listPosts(db, { kind: 'user', userId }, { limit: 2, before: decodeCursor(second.next) });
    expect(third.posts.map((post) => post.body)).toEqual(['p0']);
    expect(third.next).toBeNull();
  });

  it('posts do mesmo instante também paginam sem perder nenhum', async () => {
    const userId = await account();
    for (let i = 0; i < 3; i += 1) await createPost(db, userId, { body: `igual${i}` }, after(500_000));
    const a = await listPosts(db, { kind: 'user', userId }, { limit: 2 });
    const b = await listPosts(db, { kind: 'user', userId }, { limit: 2, before: decodeCursor(a.next) });
    expect([...a.posts, ...b.posts].map((post) => post.body).sort()).toEqual(['igual0', 'igual1', 'igual2']);
  });

  it('o tamanho da página padrão é de 20 posts', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  it('cursor inválido é ignorado', () => {
    expect(decodeCursor('lixo')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    const cursor = { at: T0, id: '123e4567-e89b-12d3-a456-426614174000' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });
});

describe('seguir', () => {
  it('segue, não duplica e deixa de seguir', async () => {
    const a = await account();
    const b = await account();
    expect(await followUser(db, a, b)).toEqual({ ok: true, changed: true });
    expect(await followUser(db, a, b)).toEqual({ ok: true, changed: false });
    expect(await isFollowing(db, a, b)).toBe(true);
    expect(await isFollowing(db, b, a)).toBe(false);
    expect(await unfollowUser(db, a, b)).toEqual({ ok: true, changed: true });
    expect(await unfollowUser(db, a, b)).toEqual({ ok: true, changed: false });
    expect(await isFollowing(db, a, b)).toBe(false);
  });

  it('ninguém segue a si mesmo nem uma conta que não existe ou não foi validada', async () => {
    const a = await account();
    const naoValidada = await account(false);
    expect(await followUser(db, a, a)).toEqual({ ok: false, error: 'self' });
    expect(await followUser(db, a, naoValidada)).toEqual({ ok: false, error: 'not-found' });
    expect(await followUser(db, a, '123e4567-e89b-12d3-a456-426614174000')).toEqual({ ok: false, error: 'not-found' });
  });

  it('conta Seguidores e Seguindo', async () => {
    const a = await account();
    const b = await account();
    const c = await account();
    await followUser(db, b, a);
    await followUser(db, c, a);
    await followUser(db, a, b);
    expect(await followCounters(db, a)).toEqual({ followers: 2, following: 1 });
    expect(await followCounters(db, c)).toEqual({ followers: 0, following: 1 });
  });

  it('Quem seguir: contas validadas que a pessoa ainda não segue, sem ela mesma', async () => {
    const eu = await account();
    const seguida = await account();
    const nova = await account();
    const naoValidada = await account(false);
    await followUser(db, eu, seguida);
    const ids = (await suggestedUsers(db, eu, 100)).map((user) => user.id);
    expect(ids).toContain(nova);
    expect(ids).not.toContain(seguida);
    expect(ids).not.toContain(eu);
    expect(ids).not.toContain(naoValidada);
  });
});

describe('tempo desde a publicação', () => {
  it('formata como no Figma', () => {
    expect(timeAgo(T0, after(30_000))).toBe('agora');
    expect(timeAgo(T0, after(5 * 60_000))).toBe('há 5 min');
    expect(timeAgo(T0, after(2 * 3_600_000))).toBe('há 2 h');
    expect(timeAgo(T0, after(3 * 86_400_000))).toBe('há 3 d');
    expect(timeAgo(T0, after(10 * 86_400_000))).toBe('13/11/2026');
  });
});
