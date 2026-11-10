/** Regras das imagens de perfil. Sem dependência de servidor: também roda no cliente. */

export type ImageKind = 'avatar' | 'cover';
export type ImageExt = 'jpg' | 'png' | 'webp';

/** Limites provisórios (a confirmar com o Leo): avatar até 2 MB, capa até 5 MB. */
export const IMAGE_MAX_BYTES: Record<ImageKind, number> = { avatar: 2 * 1024 * 1024, cover: 5 * 1024 * 1024 };

/** Tamanho recomendado em pixels (só orientação: a imagem é cortada para caber). */
export const IMAGE_RECOMMENDED_SIZE: Record<ImageKind, { width: number; height: number }> = {
  avatar: { width: 400, height: 400 },
  cover: { width: 1040, height: 200 },
};

export const IMAGE_ACCEPT ='image/jpeg,image/png,image/webp';

/** Descobre o formato pelos primeiros bytes (a extensão e o tipo enviados pelo navegador não são confiáveis). */
export function detectImageExt(bytes: Uint8Array): ImageExt | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

export type ImageCheck = { ok: true; ext: ImageExt } | { ok: false; reason: 'type' | 'size' };

export function checkImage(kind: ImageKind, bytes: Uint8Array): ImageCheck {
  if (bytes.length > IMAGE_MAX_BYTES[kind]) return { ok: false, reason: 'size' };
  const ext = detectImageExt(bytes);
  return ext ? { ok: true, ext } : { ok: false, reason: 'type' };
}

/** Chave de imagem válida (evita caminhos inesperados ao servir arquivos). */
export const IMAGE_KEY_PATTERN = /^(avatars|covers)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * Referência de uma imagem guardada: no Vercel Blob é o endereço completo (`https://…public.blob.vercel-storage.com/…`);
 * no disco local (só desenvolvimento) é a chave (`avatars/<uuid>.jpg`).
 */
export const isRemoteRef = (ref: string) => ref.startsWith('https://');

/** Endereço para mostrar a imagem numa tela. */
export const mediaUrl = (ref: string | null | undefined): string | undefined =>
  ref ? (isRemoteRef(ref) ? ref : `/media/${ref}`) : undefined;

export const IMAGE_FOLDER: Record<ImageKind, 'avatars' | 'covers'> = { avatar: 'avatars', cover: 'covers' };

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';
const BLOB_EXT = /\.(jpg|jpeg|png|webp)$/i;

/**
 * A referência enviada pelo navegador é aceitável para este usuário e este tipo de imagem?
 * - Blob: endereço https do nosso Blob, numa pasta com o id do usuário (ninguém aponta o perfil para a imagem de outra pessoa).
 * - Disco local: chave no formato esperado.
 */
export function isAcceptableImageRef(kind: ImageKind, userId: string, ref: string): boolean {
  if (!isRemoteRef(ref)) return IMAGE_KEY_PATTERN.test(ref) && ref.startsWith(`${IMAGE_FOLDER[kind]}/`);
  try {
    const url = new URL(ref);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith(BLOB_HOST_SUFFIX) &&
      url.pathname.startsWith(`/${IMAGE_FOLDER[kind]}/${userId}/`) &&
      BLOB_EXT.test(url.pathname) &&
      url.search === ''
    );
  } catch {
    return false;
  }
}

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Autoriza um envio direto ao Blob: só quem está logado, só para a própria pasta e só imagem dentro do limite.
 * Devolve as opções do token ou lança um erro (a rota responde 400).
 */
export function authorizeBlobUpload(userId: string, pathname: string, clientPayload: string | null) {
  let kind: unknown;
  try {
    kind = (JSON.parse(clientPayload ?? '{}') as { kind?: unknown }).kind;
  } catch {
    kind = undefined;
  }
  if (kind !== 'avatar' && kind !== 'cover') throw new Error('Tipo de imagem inválido.');
  const prefix = `${IMAGE_FOLDER[kind]}/${userId}/`;
  const rest = pathname.slice(prefix.length);
  if (!pathname.startsWith(prefix) || rest === '' || rest.includes('/') || !BLOB_EXT.test(rest)) {
    throw new Error('Caminho de imagem inválido.');
  }
  return {
    allowedContentTypes: IMAGE_CONTENT_TYPES,
    maximumSizeInBytes: IMAGE_MAX_BYTES[kind],
    addRandomSuffix: true,
    tokenPayload: JSON.stringify({ userId, kind }),
  };
}
