'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Banner, Button, Modal, Thumbnail, Toast } from 'nogasds';
import { ReportModal } from '@/app/perfil/_components/EntryViewModal';
import { gameMessages as t } from '@/lib/game/messages';
import { screenshotMessages as sm } from '@/lib/shelf/messages';
import { loadMoreScreenshotsAction } from '../actions';
import type { ScreenshotView } from '../view';
import styles from '../game.module.css';

/**
 * Screenshots dos usuários: grade com as de spoiler desfocadas (um clique mostra), "Ver mais" e a screenshot aberta com
 * quem enviou e a denúncia (a mesma do Game Shelf).
 */
export function GameScreenshots({
  gameId,
  gameName,
  initial,
  next: initialNext,
}: {
  gameId: string;
  gameName: string;
  initial: ScreenshotView[];
  next: number | null;
}) {
  const [shots, setShots] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<ScreenshotView | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ variant: 'success' | 'info'; title: string; text?: string } | null>(null);

  async function more() {
    if (next === null) return;
    setLoading(true);
    setFailed(false);
    const result = await loadMoreScreenshotsAction(gameId, next);
    setLoading(false);
    if (!result.ok) return setFailed(true);
    setShots((current) => [...current, ...result.screenshots.filter((shot) => !current.some((item) => item.entryId === shot.entryId))]);
    setNext(result.next);
  }

  if (shots.length === 0) return <p className={styles.empty}>{t.noScreenshots}</p>;

  return (
    <>
      <ul className={styles.gallery}>
        {shots.map((shot) => (
          <li key={shot.entryId}>
            <Thumbnail src={shot.url} alt={t.screenshotAlt(gameName, shot.username)} spoiler={shot.spoiler} onOpen={() => setOpen(shot)} />
          </li>
        ))}
      </ul>
      {failed ? <Banner variant="error" title={t.loadFailed} /> : null}
      {next !== null ? (
        <Button variant="outline" className={styles.fullWidth} onClick={() => void more()} disabled={loading}>
          {loading ? t.loadingMore : t.moreScreenshots}
        </Button>
      ) : null}

      <Modal
        open={open !== null && reporting === null}
        onClose={() => setOpen(null)}
        title={t.screenshotTitle(gameName)}
        footer={
          open ? (
            <div className={styles.viewerFooter}>
              <span className={styles.muted}>
                {t.sentBy} <Link href={`/perfil/${open.username}`}>@{open.username}</Link>
              </span>
              {!open.own ? (
                <Button variant="ghost" size="sm" onClick={() => setReporting(open.entryId)}>
                  {t.report}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {open ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.viewerImage} src={open.url} alt={t.screenshotAlt(gameName, open.username)} />
        ) : null}
      </Modal>
      {reporting ? (
        <ReportModal
          entryId={reporting}
          onCancel={() => setReporting(null)}
          onDone={(already) => {
            setReporting(null);
            setOpen(null);
            setNotice(already ? { variant: 'info', title: sm.alreadyReported } : { variant: 'success', title: sm.reported, text: sm.reportedText });
          }}
        />
      ) : null}
      {notice ? (
        <div className={styles.toast}>
          <Toast variant={notice.variant} title={notice.title} onClose={() => setNotice(null)} closeLabel={t.closeToast}>
            {notice.text}
          </Toast>
        </div>
      ) : null}
    </>
  );
}
