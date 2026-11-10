import { IMAGE_KEY_PATTERN } from '@/lib/profile/images';
import { readLocalImage } from '@/lib/storage';

const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Serve as imagens guardadas em disco (só desenvolvimento; na nuvem as imagens vêm direto do Blob). O nome do arquivo
 * é um UUID novo a cada troca, então o navegador pode guardar a imagem para sempre. Só chaves no formato esperado.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  if (!IMAGE_KEY_PATTERN.test(key)) return new Response('Não encontrado', { status: 404 });
  const bytes = await readLocalImage(key);
  if (!bytes) return new Response('Não encontrado', { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': CONTENT_TYPES[key.split('.').pop() ?? ''],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
