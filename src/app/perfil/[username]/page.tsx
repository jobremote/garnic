import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { requireViewer } from '@/lib/auth/current-user';
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function Profile({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewer();

  const { username } = await params;
  // `?editar=<entrada>`: a página do jogo leva direto à edição da entrada (só no próprio perfil).
  const editar = (await searchParams).editar;
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
    listPosts(db, { kind: 'user', userId: profile.id }, { viewerId: viewer.id }),
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
      openEntryId={viewer.id === profile.id && typeof editar === 'string' && UUID.test(editar) ? editar : undefined}
    />
  );
}

export default function ProfilePage({ params, searchParams }: PageProps<'/perfil/[username]'>) {
  return (
    <Suspense fallback={null}>
      <Profile params={params} searchParams={searchParams} />
    </Suspense>
  );
}
