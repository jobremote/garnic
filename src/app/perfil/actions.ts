'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { isAcceptableImageRef, type ImageKind } from '@/lib/profile/images';
import { profileMessages } from '@/lib/profile/messages';
import { updateProfile } from '@/lib/profile/profile';
import { deleteImage, verifyStoredImage } from '@/lib/storage';
import type { EditProfileState } from './state';

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

/**
 * Salva o perfil de quem está logado: nome, @usuário, bio, avatar e capa. As imagens já foram enviadas pelo navegador
 * (direto ao Blob, ou ao disco local em desenvolvimento) e aqui chegam só como referência. Cada referência é conferida:
 * tem que ser da pasta do próprio usuário e a imagem guardada tem que ter formato e peso válidos. Em caso de sucesso vai
 * para o perfil, já com o @usuário novo no endereço.
 */
export async function updateProfileAction(_previous: EditProfileState, data: FormData): Promise<EditProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');

  const values = { name: text(data, 'name'), username: text(data, 'username'), bio: text(data, 'bio') };
  const errors: EditProfileState['errors'] = {};

  const fresh: { kind: ImageKind; ref: string }[] = []; // imagens novas desta tentativa
  /** Apaga as imagens novas se algo falhar. Só as que são desta pessoa: nunca uma referência alheia vinda do navegador. */
  const cleanup = () =>
    Promise.all(fresh.filter((item) => isAcceptableImageRef(item.kind, user.id, item.ref)).map((item) => deleteImage(item.ref)));
  const keys: { avatarKey?: string | null; coverKey?: string | null } = {};
  for (const kind of ['avatar', 'cover'] as ImageKind[]) {
    const field = kind === 'avatar' ? 'avatarKey' : 'coverKey';
    const ref = text(data, kind === 'avatar' ? 'avatarRef' : 'coverRef');
    if (ref) {
      fresh.push({ kind, ref });
      if (!isAcceptableImageRef(kind, user.id, ref) || !(await verifyStoredImage(kind, ref))) {
        errors[kind] = profileMessages.imageType;
      } else {
        keys[field] = ref;
      }
    } else if (text(data, kind === 'avatar' ? 'removeAvatar' : 'removeCover') === '1') {
      keys[field] = null;
    }
  }
  if (errors.avatar || errors.cover) {
    await cleanup();
    return { values, errors };
  }

  const db = await getDb();
  const result = await updateProfile(db, user.id, { ...values, ...keys });
  if (!result.ok) {
    await cleanup(); // nada foi salvo: as imagens novas não ficam sobrando
    return { values, errors: result.errors };
  }
  await Promise.all(result.replacedKeys.map(deleteImage));
  redirect(`/perfil/${result.username}`);
}
