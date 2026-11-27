'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { listGameScreenshots } from '@/lib/game/page';
import { mediaUrl } from '@/lib/profile/images';
import { toScreenshotView, type ScreenshotView } from './view';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type MoreScreenshotsResult = { ok: true; screenshots: ScreenshotView[]; next: number | null } | { ok: false };

/** Próxima página de screenshots da página do jogo. */
export async function loadMoreScreenshotsAction(gameId: unknown, offset: unknown): Promise<MoreScreenshotsResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect('/entrar');
  if (typeof gameId !== 'string' || !UUID.test(gameId) || typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) return { ok: false };
  const page = await listGameScreenshots(await getDb(), gameId, viewer.id, offset);
  return { ok: true, screenshots: page.screenshots.flatMap((shot) => toScreenshotView(shot, mediaUrl)), next: page.next };
}
