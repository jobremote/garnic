import { describe, expect, it } from 'vitest';
import { authorizeBlobUpload, checkImage, detectImageExt, IMAGE_KEY_PATTERN, IMAGE_MAX_BYTES, isAcceptableImageRef, mediaUrl } from './images';

const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP')]);

describe('imagens do perfil', () => {
  it('reconhece JPG, PNG e WebP pelos primeiros bytes', () => {
    expect(detectImageExt(jpg)).toBe('jpg');
    expect(detectImageExt(png)).toBe('png');
    expect(detectImageExt(webp)).toBe('webp');
  });

  it('recusa outros formatos, mesmo com extensão de imagem', () => {
    expect(detectImageExt(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageExt(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectImageExt(new Uint8Array())).toBeNull();
    expect(checkImage('avatar', new TextEncoder().encode('não sou imagem'))).toEqual({ ok: false, reason: 'type' });
  });

  it('avatar, capa e screenshot até 5 MB (avatar subiu de 2 para 5 MB em 12/11/2026)', () => {
    const big = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(jpg);
      return bytes;
    };
    expect(checkImage('avatar', big(IMAGE_MAX_BYTES.avatar))).toEqual({ ok: true, ext: 'jpg' });
    expect(checkImage('avatar', big(IMAGE_MAX_BYTES.avatar + 1))).toEqual({ ok: false, reason: 'size' });
    expect(IMAGE_MAX_BYTES.avatar).toBe(5 * 1024 * 1024);
    expect(checkImage('avatar', big(3 * 1024 * 1024))).toEqual({ ok: true, ext: 'jpg' }); // foto do rolo de câmera
    expect(checkImage('cover', big(IMAGE_MAX_BYTES.cover))).toEqual({ ok: true, ext: 'jpg' });
    expect(checkImage('cover', big(IMAGE_MAX_BYTES.cover + 1))).toEqual({ ok: false, reason: 'size' });
    expect(checkImage('screenshot', big(IMAGE_MAX_BYTES.screenshot + 1))).toEqual({ ok: false, reason: 'size' });
  });

  it('só aceita chaves no formato esperado (sem caminhos fora da pasta)', () => {
    expect(IMAGE_KEY_PATTERN.test('avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg')).toBe(true);
    expect(IMAGE_KEY_PATTERN.test('covers/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp')).toBe(true);
    expect(IMAGE_KEY_PATTERN.test('../.env')).toBe(false);
    expect(IMAGE_KEY_PATTERN.test('avatars/../x.jpg')).toBe(false);
    expect(IMAGE_KEY_PATTERN.test('avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg')).toBe(false);
  });

  it('imagem de post (Feed): até 5 MB, só na pasta posts da própria pessoa', () => {
    const user = '11111111-1111-1111-1111-111111111111';
    const other = '22222222-2222-2222-2222-222222222222';
    expect(IMAGE_MAX_BYTES.post).toBe(5 * 1024 * 1024);
    expect(IMAGE_KEY_PATTERN.test('posts/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png')).toBe(true);
    // disco local: a chave tem que ser da pasta de posts
    expect(isAcceptableImageRef('post', user, 'posts/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png')).toBe(true);
    expect(isAcceptableImageRef('post', user, 'avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png')).toBe(false);
    // Blob: só o nosso endereço, na pasta posts com o id de quem posta
    const blob = (id: string) => `https://loja.public.blob.vercel-storage.com/posts/${id}/post-abc123.png`;
    expect(isAcceptableImageRef('post', user, blob(user))).toBe(true);
    expect(isAcceptableImageRef('post', user, blob(other))).toBe(false);
    expect(isAcceptableImageRef('screenshot', user, blob(user))).toBe(false);
    expect(isAcceptableImageRef('post', user, 'https://evil.example.com/posts/' + user + '/post.png')).toBe(false);
    // autorização do envio direto ao Blob
    const payload = (kind: string) => JSON.stringify({ kind });
    expect(authorizeBlobUpload(user, 'posts/' + user + '/post.png', payload('post')).maximumSizeInBytes).toBe(5 * 1024 * 1024);
    expect(() => authorizeBlobUpload(user, 'posts/' + other + '/post.png', payload('post'))).toThrow();
    expect(() => authorizeBlobUpload(user, 'posts/' + user + '/post.png', payload('avatar'))).toThrow();
  });

  it('mediaUrl devolve o endereço da imagem ou nada', () => {
    expect(mediaUrl('avatars/x.jpg')).toBe('/media/avatars/x.jpg');
    expect(mediaUrl(null)).toBeUndefined();
  });
});
