'use client';

import { useState, useTransition } from 'react';
import { Button, type ButtonSize } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { followAction } from '../actions';
import styles from '../feed.module.css';

/** Seguir e deixar de seguir, com resposta imediata (volta atrás se o servidor falhar). */
export function FollowButton({ userId, name, initialFollowing, size = 'sm' }: { userId: string; name: string; initialFollowing: boolean; size?: ButtonSize }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !following;
    setFollowing(next);
    setFailed(false);
    startTransition(async () => {
      const result = await followAction(userId, next);
      if (!result.ok) {
        setFollowing(!next);
        setFailed(true);
      }
    });
  };

  return (
    <>
      <Button
        variant={following ? 'outline' : 'primary'}
        size={size}
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        aria-label={`${following ? t.unfollow : t.follow}: ${name}`}
      >
        {following ? t.following : t.follow}
      </Button>
      {failed ? (
        <p role="alert" className={styles.error}>
          {t.followError}
        </p>
      ) : null}
    </>
  );
}
