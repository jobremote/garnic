import { uploadPresigned } from '@vercel/blob/client';
import { IMAGE_FOLDER, type ImageKind } from '@/lib/profile/images';

export type UploadMode = 'blob' | 'local' | 'unavailable';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Envia uma imagem e devolve a referência a guardar no perfil.
 * - `blob`: direto do navegador para o Vercel Blob, na pasta do próprio usuário (a rota só entrega o token).
 * - `local`: para a nossa rota, que grava em disco (só desenvolvimento).
 */
export async function uploadImage(mode: UploadMode, kind: ImageKind, file: File, userId: string): Promise<string> {
  if (mode === 'blob') {
    const ext = EXT[file.type] ?? 'jpg';
    const result = await uploadPresigned(`${IMAGE_FOLDER[kind]}/${userId}/${kind}.${ext}`, file, {
      access: 'public',
      handleUploadUrl: '/api/profile-images',
      clientPayload: JSON.stringify({ kind }),
      contentType: file.type,
    });
    return result.url;
  }

  const body = new FormData();
  body.set('kind', kind);
  body.set('file', file);
  const response = await fetch('/api/profile-images', { method: 'POST', body });
  if (!response.ok) throw new Error('Falha no envio da imagem.');
  return ((await response.json()) as { ref: string }).ref;
}
