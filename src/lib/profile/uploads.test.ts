import { describe, expect, it } from 'vitest';
import { authorizeBlobUpload, IMAGE_MAX_BYTES, isAcceptableImageRef, isRemoteRef, mediaUrl } from './images';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const blob = (path: string, host = 'abc123.public.blob.vercel-storage.com') => `https://${host}/${path}`;
const LOCAL_KEY = 'avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg';

describe('referências de imagem', () => {
  it('endereço do Blob vira o endereço da imagem; chave local passa por /media', () => {
    const url = blob(`avatars/${USER}/avatar-Xy12.png`);
    expect(isRemoteRef(url)).toBe(true);
    expect(mediaUrl(url)).toBe(url);
    expect(mediaUrl(LOCAL_KEY)).toBe(`/media/${LOCAL_KEY}`);
    expect(mediaUrl(null)).toBeUndefined();
  });

  it('aceita o endereço do Blob na pasta do próprio usuário e do tipo certo', () => {
    expect(isAcceptableImageRef('avatar', USER, blob(`avatars/${USER}/avatar-Xy12.png`))).toBe(true);
    expect(isAcceptableImageRef('cover', USER, blob(`covers/${USER}/cover-Zz99.webp`))).toBe(true);
  });

  it('recusa a pasta de outra pessoa, o tipo trocado, outro servidor, outro formato e endereços com parâmetros', () => {
    expect(isAcceptableImageRef('avatar', USER, blob(`avatars/${OTHER}/avatar-Xy12.png`))).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, blob(`covers/${USER}/cover-Zz99.webp`))).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, blob(`avatars/${USER}/avatar.png`, 'evil.example.com'))).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, blob(`avatars/${USER}/avatar.svg`))).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, `${blob(`avatars/${USER}/avatar.png`)}?x=1`)).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, 'http://abc123.public.blob.vercel-storage.com/avatars/x.png')).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, 'https://')).toBe(false);
  });

  it('chave local: só no formato esperado e na pasta do tipo', () => {
    expect(isAcceptableImageRef('avatar', USER, LOCAL_KEY)).toBe(true);
    expect(isAcceptableImageRef('cover', USER, LOCAL_KEY)).toBe(false);
    expect(isAcceptableImageRef('avatar', USER, '../.env')).toBe(false);
  });
});

describe('autorização do envio direto ao Blob', () => {
  const payload = (kind: string) => JSON.stringify({ kind });

  it('libera a pasta do próprio usuário, só imagem e dentro do limite de peso', () => {
    const avatar = authorizeBlobUpload(USER, `avatars/${USER}/avatar.png`, payload('avatar'));
    expect(avatar.allowedContentTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(avatar.maximumSizeInBytes).toBe(IMAGE_MAX_BYTES.avatar);
    expect(avatar.addRandomSuffix).toBe(true);
    expect(JSON.parse(avatar.tokenPayload)).toEqual({ userId: USER, kind: 'avatar' });

    const cover = authorizeBlobUpload(USER, `covers/${USER}/cover.webp`, payload('cover'));
    expect(cover.maximumSizeInBytes).toBe(IMAGE_MAX_BYTES.cover);
  });

  it('recusa a pasta de outra pessoa, subpastas, outro formato e tipo inválido', () => {
    expect(() => authorizeBlobUpload(USER, `avatars/${OTHER}/avatar.png`, payload('avatar'))).toThrow();
    expect(() => authorizeBlobUpload(USER, `avatars/${USER}/sub/avatar.png`, payload('avatar'))).toThrow();
    expect(() => authorizeBlobUpload(USER, `avatars/${USER}/avatar.gif`, payload('avatar'))).toThrow();
    expect(() => authorizeBlobUpload(USER, `covers/${USER}/cover.png`, payload('avatar'))).toThrow();
    expect(() => authorizeBlobUpload(USER, `avatars/${USER}/avatar.png`, payload('banner'))).toThrow();
    expect(() => authorizeBlobUpload(USER, `avatars/${USER}/avatar.png`, null)).toThrow();
    expect(() => authorizeBlobUpload(USER, `avatars/${USER}/avatar.png`, 'não é json')).toThrow();
    expect(() => authorizeBlobUpload(USER, `avatars/${USER}/`, payload('avatar'))).toThrow();
  });
});
