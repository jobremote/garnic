import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';

/** `/perfil` leva ao perfil de quem está logado. */
async function GoToOwnProfile(): Promise<never> {
  const user = await getCurrentUser();
  return redirect(user ? `/perfil/${user.username}` : '/entrar');
}

export default function OwnProfilePage() {
  return (
    <Suspense fallback={null}>
      <GoToOwnProfile />
    </Suspense>
  );
}
