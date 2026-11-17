'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { games, shelfActivities } from '@/lib/db/schema';
import { timeAgo } from '@/lib/feed/time';
import { toPostView, type ActivityView } from '@/lib/feed/view';
import { listEntryActivities, shareActivity, type ActivityKind } from '@/lib/shelf/activity';
import { isShelfStatus, type ShelfStatus } from '@/lib/shelf/status';
import { feedMessages as t } from '@/lib/feed/messages';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return user;
}

export type PreviewActivityResult = { ok: true; activity: ActivityView; spoiler: boolean } | { ok: false };

/**
 * Prévia do post que a atividade vai gerar (a mesma tela do post de atividade, montada a partir do registro). Só a
 * dona vê, e nada é publicado: serve para o modal "Compartilhar atividade".
 */
export async function previewActivityAction(activityId: string): Promise<PreviewActivityResult> {
  const user = await requireUser();
  if (typeof activityId !== 'string' || !UUID.test(activityId)) return { ok: false };
  const db = await getDb();
  const [row] = await db
    .select({ id: shelfActivities.id })
    .from(shelfActivities)
    .where(and(eq(shelfActivities.id, activityId), eq(shelfActivities.userId, user.id)))
    .limit(1);
  if (!row) return { ok: false };
  const view = await activityViewOf(activityId);
  return view ? { ok: true, activity: view.activity, spoiler: view.spoiler } : { ok: false };
}

/** Monta a `ActivityView` de uma atividade pelo mesmo caminho dos posts (um post "fantasma" só para a tela). */
async function activityViewOf(activityId: string): Promise<{ activity: ActivityView; spoiler: boolean } | null> {
  const db = await getDb();
  const [found] = await db
    .select({ activity: shelfActivities, game: games })
    .from(shelfActivities)
    .innerJoin(games, eq(games.id, shelfActivities.gameId))
    .where(eq(shelfActivities.id, activityId))
    .limit(1);
  if (!found || !isShelfStatus(found.activity.status)) return null;
  const { activity, game } = found;
  const fake = toPostView(
    {
      id: activity.id,
      body: '',
      imageRef: null,
      spoiler: activity.spoiler,
      createdAt: new Date(activity.createdAt),
      editedAt: null,
      author: { id: activity.userId, name: '', username: '', avatarKey: null },
      games: [],
      likeCount: 0,
      liked: false,
      commentCount: 0,
      activity: {
        kind: activity.kind as ActivityKind,
        status: activity.status as ShelfStatus,
        platform: activity.platform,
        rating: activity.rating,
        playMinutes: activity.playMinutes,
        review: activity.review,
        screenshotRef: activity.screenshotRef,
        game: { igdbId: game.igdbId, name: game.name, coverImageId: game.coverImageId, releasedAt: game.releasedAt },
      },
    },
    activity.userId,
    new Date(),
  );
  return fake.activity ? { activity: fake.activity, spoiler: activity.spoiler } : null;
}

export type ShareActivityResult = { ok: true; postId: string } | { ok: false; error: 'not-found' | 'too-long' | 'generic' };

/** Compartilha a atividade no feed de quem está logado (com o texto opcional). Nada é publicado sem este clique. */
export async function shareActivityAction(activityId: string, note: unknown): Promise<ShareActivityResult> {
  const user = await requireUser();
  if (typeof activityId !== 'string' || !UUID.test(activityId)) return { ok: false, error: 'not-found' };
  const result = await shareActivity(await getDb(), user.id, activityId, note);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath('/');
  revalidatePath('/perfil/[username]', 'page');
  return { ok: true, postId: result.postId };
}

/** Uma linha de "Atividade recente" da entrada, já em texto. */
export interface RecentActivityRow {
  id: string;
  phrase: string;
  detail?: string;
  /** "há 2 h". */
  time: string;
  /** Post que compartilha a atividade (o botão vira "Compartilhado" e leva a ele). */
  postId: string | null;
}

export type RecentActivitiesResult = { ok: true; rows: RecentActivityRow[] } | { ok: false };

/** "Atividade recente" da entrada: só a dona vê e compartilha. */
export async function recentActivitiesAction(entryId: string): Promise<RecentActivitiesResult> {
  const user = await requireUser();
  if (typeof entryId !== 'string' || !UUID.test(entryId)) return { ok: false };
  const now = new Date();
  const list = await listEntryActivities(await getDb(), user.id, entryId);
  return {
    ok: true,
    rows: list.map((activity) => ({
      id: activity.id,
      phrase: t.activityPhrase[activity.kind],
      detail: [activity.kind === 'finished' && activity.playMinutes ? `${Math.floor(activity.playMinutes / 60)} h` : null, (activity.kind === 'finished' || activity.kind === 'rated') && activity.rating ? t.activityRating(activity.rating) : null]
        .filter(Boolean)
        .join(' · ') || undefined,
      time: timeAgo(activity.createdAt, now),
      postId: activity.postId,
    })),
  };
}
