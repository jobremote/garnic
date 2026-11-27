import type { GameScreenshot } from '@/lib/game/page';

/** Screenshot como a tela precisa. */
export interface ScreenshotView {
  entryId: string;
  url: string;
  spoiler: boolean;
  username: string;
  own: boolean;
}

export const toScreenshotView = (shot: GameScreenshot, toUrl: (ref: string) => string | undefined): ScreenshotView[] => {
  const url = toUrl(shot.ref);
  return url ? [{ entryId: shot.entryId, url, spoiler: shot.spoiler, username: shot.username, own: shot.own }] : [];
};
