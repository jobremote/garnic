'use client';

import { useEffect, useRef, useState } from 'react';
import { searchGamesAction, type GameResult } from '@/app/perfil/shelf-actions';

export type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; results: GameResult[] }
  | { kind: 'error'; error: 'not-configured' | 'unavailable' };

/** Menor texto que dispara a busca (igual ao da busca do Game Shelf). */
export const SEARCH_MIN = 2;

/**
 * Busca jogos no IGDB conforme a pessoa digita: espera 250 ms depois da última tecla (a mesma do Game Shelf) e ignora
 * respostas atrasadas de buscas antigas. Com `enabled` falso ou texto curto, não busca e fica em `idle`; enquanto a
 * busca do texto atual não responde, também fica em `idle` (a tela mostra "Buscando…", sem resultados de outro texto).
 */
export function useGameSearch(text: string, enabled = true): SearchState {
  const [answer, setAnswer] = useState<{ text: string; state: SearchState } | null>(null);
  const latest = useRef(0);
  const active = enabled && text.length >= SEARCH_MIN;

  useEffect(() => {
    if (!active) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setAnswer({ text, state: { kind: 'loading' } });
      const response = await searchGamesAction(text);
      if (id !== latest.current) return;
      setAnswer({ text, state: response.ok ? { kind: 'done', results: response.results } : { kind: 'error', error: response.error } });
    }, 250);
    return () => clearTimeout(timer);
  }, [active, text]);

  return active && answer && answer.text === text ? answer.state : { kind: 'idle' };
}
