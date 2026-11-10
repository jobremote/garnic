import { describe, expect, it } from 'vitest';
import { checkImage, detectImageExt, IMAGE_KEY_PATTERN, IMAGE_MAX_BYTES, mediaUrl } from './images';

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

  it('avatar até 2 MB e capa até 5 MB', () => {
    const big = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(jpg);
      return bytes;
    };
    expect(checkImage('avatar', big(IMAGE_MAX_BYTES.avatar))).toEqual({ ok: true, ext: 'jpg' });
    expect(checkImage('avatar', big(IMAGE_MAX_BYTES.avatar + 1))).toEqual({ ok: false, reason: 'size' });
    expect(checkImage('cover', big(IMAGE_MAX_BYTES.avatar + 1))).toEqual({ ok: true, ext: 'jpg' });
    expect(checkImage('cover', big(IMAGE_MAX_BYTES.cover + 1))).toEqual({ ok: false, reason: 'size' });
  });

  it('só aceita chaves no formato esperado (sem caminhos fora da pasta)', () => {
    expect(IMAGE_KEY_PATTERN.test('avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg')).toBe(true);
    expect(IMAGE_KEY_PATTERN.test('covers/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp')).toBe(true);
    expect(IMAGE_KEY_PATTERN.test('../.env')).toBe(false);
    expect(IMAGE_KEY_PATTERN.test('avatars/../x.jpg')).toBe(false);
    expect(IMAGE_KEY_PATTERN.test('avatars/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg')).toBe(false);
  });

  it('mediaUrl devolve o endereço da imagem ou nada', () => {
    expect(mediaUrl('avatars/x.jpg')).toBe('/media/avatars/x.jpg');
    expect(mediaUrl(null)).toBeUndefined();
  });
});
