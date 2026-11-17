'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { recentActivitiesAction, type RecentActivityRow } from '../activity-actions';
import styles from '../shelf.module.css';

/**
 * "Atividade recente" da entrada: as últimas atividades do jogo, cada uma com o botão Compartilhar. Compartilhada, o
 * botão vira "Compartilhado" e leva ao post; se o post for apagado, o botão volta.
 */
export function RecentActivity({ entryId, onShare }: { entryId: string; onShare: (activityId: string) => void }) {
  const [rows, setRows] = useState<RecentActivityRow[] | null>(null);

  useEffect(() => {
    let active = true;
    recentActivitiesAction(entryId).then((result) => {
      if (active) setRows(result.ok ? result.rows : []);
    });
    return () => {
      active = false;
    };
  }, [entryId]);

  if (rows === null) return null;
  return (
    <section className={styles.recentActivity} aria-label={t.recentActivity}>
      <h3 className={styles.recentTitle}>{t.recentActivity}</h3>
      {rows.length === 0 ? (
        <p className={styles.hint}>{t.recentActivityEmpty}</p>
      ) : (
        <ul className={styles.recentList}>
          {rows.map((row) => (
            <li key={row.id} className={styles.recentRow}>
              <span className={styles.recentText}>
                <span>{row.phrase}</span>
                <span className={styles.hint}>{[row.detail, row.time].filter(Boolean).join(' · ')}</span>
              </span>
              {row.postId ? (
                <Link href={`/post/${row.postId}`} className={styles.recentShared}>
                  {t.shared}
                </Link>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onShare(row.id)}>
                  {t.shareOfferAction}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
