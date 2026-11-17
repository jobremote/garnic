'use client';

import { useState } from 'react';
import { setLikeAction } from '../comment-actions';

export interface LikeState {
  liked: boolean;
  count: number;
}

/**
 * Curtir e descurtir com resposta imediata: o coração muda na hora e volta atrás se o servidor não aceitar. O contador
 * final vem do servidor. Se os dados de fora mudarem (a página recarregou), o estado acompanha.
 */
export function useLike(target: 'post' | 'comment', id: string, initial: LikeState) {
  const [state, setState] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (initial.liked !== seen.liked || initial.count !== seen.count) {
    setSeen(initial);
    setState(initial);
  }

  async function toggle() {
    if (pending) return;
    const previous = state;
    const like = !previous.liked;
    setState({ liked: like, count: Math.max(0, previous.count + (like ? 1 : -1)) });
    setPending(true);
    setFailed(false);
    const result = await setLikeAction(target, id, like);
    setPending(false);
    if (!result.ok) {
      setState(previous);
      setFailed(true);
      return;
    }
    setState({ liked: result.liked, count: result.count });
  }

  return { ...state, pending, failed, toggle };
}
