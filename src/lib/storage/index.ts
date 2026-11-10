import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  checkImage,
  detectImageExt,
  IMAGE_KEY_PATTERN,
  IMAGE_MAX_BYTES,
  isRemoteRef,
  type ImageExt,
  type ImageKind,
} from '@/lib/profile/images';

/**
 * Armazenamento das imagens do perfil.
 * - `blob`: Vercel Blob (homologação e produção). O navegador envia direto ao Blob (as funções da Vercel recusam
 *   corpo acima de 4,5 MB) e aqui só chega o endereço da imagem. Precisa de `BLOB_STORE_ID` (OIDC, Blob novo) ou de
 *   `BLOB_READ_WRITE_TOKEN` (Blob antigo).
 * - `local`: disco (`.data/uploads`, fora do Git), só em desenvolvimento e só quando não há token do Blob.
 * - `unavailable`: produção sem Blob configurado. O envio de imagem é recusado com mensagem clara.
 */
export type StorageMode = 'blob' | 'local' | 'unavailable';

export function storageMode(): StorageMode {
  // Blob novo da Vercel: autenticação por OIDC, com `BLOB_STORE_ID`. Blob antigo: `BLOB_READ_WRITE_TOKEN`.
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  return process.env.NODE_ENV === 'production' ? 'unavailable' : 'local';
}

const root = () => path.join(process.cwd(), '.data', 'uploads');

export async function saveLocalImage(kind: ImageKind, bytes: Uint8Array, ext: ImageExt): Promise<string> {
  if (storageMode() !== 'local') throw new Error('O armazenamento local só existe em desenvolvimento.');
  const key = `${kind === 'avatar' ? 'avatars' : 'covers'}/${randomUUID()}.${ext}`;
  const file = path.join(root(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return key;
}

export async function readLocalImage(key: string): Promise<Uint8Array | null> {
  if (!IMAGE_KEY_PATTERN.test(key)) return null;
  try {
    return await readFile(path.join(root(), key));
  } catch {
    return null;
  }
}

/**
 * Confere uma imagem já guardada: o formato pelos primeiros bytes (o tipo informado pelo navegador não é confiável)
 * e o peso. Devolve `false` se algo não bate ou não foi possível ler.
 */
export async function verifyStoredImage(kind: ImageKind, ref: string): Promise<boolean> {
  try {
    if (!isRemoteRef(ref)) {
      const bytes = await readLocalImage(ref);
      return bytes ? checkImage(kind, bytes).ok : false;
    }
    const { head } = await import('@vercel/blob');
    const info = await head(ref);
    if (info.size > IMAGE_MAX_BYTES[kind]) return false;
    // Só os primeiros bytes bastam para saber o formato; o peso já veio dos metadados.
    const response = await fetch(ref, { headers: { Range: 'bytes=0-15' }, cache: 'no-store' });
    if (!response.ok) return false;
    const first = new Uint8Array(await response.arrayBuffer()).slice(0, 16);
    return detectImageExt(first) !== null;
  } catch {
    return false;
  }
}

/** Apaga sem reclamar se a imagem não existe (limpeza de imagem antiga ou recusada). */
export async function deleteImage(ref: string | null | undefined): Promise<void> {
  if (!ref) return;
  try {
    if (isRemoteRef(ref)) {
      const { del } = await import('@vercel/blob');
      await del(ref);
    } else if (IMAGE_KEY_PATTERN.test(ref)) {
      await rm(path.join(root(), ref), { force: true });
    }
  } catch {
    // limpeza de melhor esforço: uma imagem sobrando não deve quebrar o salvar do perfil
  }
}
