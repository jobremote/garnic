import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { getEditLocks, getPublicProfile } from '@/lib/profile/profile';
import { ProfileView } from '../_components/ProfileView';

export const metadata: Metadata = { title: 'Perfil' };

/** Perfil de qualquer usuário, pelo @usuário. Só quem está logado vê (no MVP todo perfil é público para quem entrou). */
async function Profile({ params }: { params: Promise<{ username: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect('/entrar');

  const { username } = await params;
  const db = await getDb();
  const profile = await getPublicProfile(db, decodeURIComponent(username).toLowerCase());
  if (!profile) notFound();

  const locks = viewer.id === profile.id ? await getEditLocks(db, viewer.id) : null;
  return <ProfileView viewer={viewer} profile={profile} locks={locks} />;
}

export default function ProfilePage({ params }: PageProps<'/perfil/[username]'>) {
  return (
    <Suspense fallback={null}>
      <Profile params={params} />
    </Suspense>
  );
}
