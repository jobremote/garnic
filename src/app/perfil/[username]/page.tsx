import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { followCounters, isFollowing } from '@/lib/feed/follows';
import { listPosts } from '@/lib/feed/posts';
import { toPostView } from '@/lib/feed/view';
import { getEditLocks, getPublicProfile } from '@/lib/profile/profile';
import { getShelf, shelfCounters } from '@/lib/shelf/shelf';
import { listTags } from '@/lib/shelf/tags';
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
  const [shelf, counters, tags, following, follows, page] = await Promise.all([
    getShelf(db, profile.id),
    shelfCounters(db, profile.id),
    listTags(db, profile.id),
    viewer.id === profile.id ? false : isFollowing(db, viewer.id, profile.id),
    followCounters(db, profile.id),
    listPosts(db, { kind: 'user', userId: profile.id }),
  ]);
  const now = new Date();
  return (
    <ProfileView
      viewer={viewer}
      profile={profile}
      locks={locks}
      shelf={shelf}
      counters={counters}
      tags={tags}
      following={following}
      followCounters={follows}
      posts={page.posts.map((post) => toPostView(post, viewer.id, now))}
      postsNext={page.next}
    />
  );
}

export default function ProfilePage({ params }: PageProps<'/perfil/[username]'>) {
  return (
    <Suspense fallback={null}>
      <Profile params={params} />
    </Suspense>
  );
}
