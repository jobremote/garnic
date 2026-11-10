import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { getCurrentUser } from '@/lib/auth/current-user';
import { authorizeBlobUpload, checkImage } from '@/lib/profile/images';
import { saveLocalImage, storageMode } from '@/lib/storage';

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Envio das imagens de avatar e capa. Só para quem está logado.
 * - Blob (homologação e produção): o navegador pede aqui uma URL assinada e envia o arquivo direto ao Blob, sem passar
 *   pelas funções da Vercel (que recusam corpo acima de 4,5 MB). A assinatura só vale para a pasta do próprio usuário,
 *   para imagem e dentro do limite de peso. Funciona com a autenticação por OIDC do Blob novo (sem token fixo).
 * - Disco local (só desenvolvimento, sem Blob configurado): o arquivo vem em `multipart/form-data` e é guardado em `.data`.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Entre na sua conta para enviar imagens.' }, 401);

  const mode = storageMode();
  if (mode === 'unavailable') return json({ error: 'O envio de imagens não está configurado neste ambiente.' }, 503);

  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    if (mode !== 'local') return json({ error: 'Envio inválido.' }, 400);
    const data = await request.formData();
    const kind = data.get('kind');
    const file = data.get('file');
    if ((kind !== 'avatar' && kind !== 'cover') || !(file instanceof File)) return json({ error: 'Envio inválido.' }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkImage(kind, bytes);
    if (!check.ok) return json({ error: check.reason }, 400);
    return json({ ref: await saveLocalImage(kind, bytes, check.ext) });
  }

  if (mode !== 'blob') return json({ error: 'Envio inválido.' }, 400);
  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        const rules = authorizeBlobUpload(user.id, pathname, clientPayload);
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: rules.allowedContentTypes,
          maximumSizeInBytes: rules.maximumSizeInBytes,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: rules.allowedContentTypes,
            maximumSizeInBytes: rules.maximumSizeInBytes,
            addRandomSuffix: rules.addRandomSuffix,
          },
        };
      },
    });
    return json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Envio inválido.' }, 400);
  }
}
