'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Modal, ResultItem, SearchField } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { searchGamesAction, type GameResult } from '@/app/perfil/shelf-actions';
import styles from '../feed.module.css';

/** Jogo escolhido para o post. Só o que a tela precisa; ao publicar o servidor busca o jogo no IGDB de novo. */
export interface MarkedGame {
  igdbId: number;
  name: string;
  coverUrl?: string;
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; results: GameResult[] }
  | { kind: 'error'; error: 'not-configured' | 'unavailable' };

/** Buscar um jogo no IGDB e marcá-lo no post (Figma: Marcar jogo). O jogo não precisa estar no Game Shelf. */
export function MarkGameModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (game: MarkedGame) => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const latest = useRef(0);
  const text = query.trim();

  // Mesma espera de 250 ms da busca do Game Shelf; respostas atrasadas de buscas antigas são ignoradas.
  useEffect(() => {
    if (text.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setSearch({ kind: 'loading' });
      const response = await searchGamesAction(text);
      if (id !== latest.current) return;
      setSearch(response.ok ? { kind: 'done', results: response.results } : { kind: 'error', error: response.error });
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <Modal open={open} onClose={onClose} title={t.markGameTitle}>
      <div className={styles.modalBody}>
        <SearchField
          label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          autoComplete="off"
          autoFocus
        />
        <Results
          text={text}
          search={search}
          onPick={(game) => {
            onPick({ igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl });
            setQuery('');
            setSearch({ kind: 'idle' });
          }}
        />
      </div>
    </Modal>
  );
}

function Results({ text, search, onPick }: { text: string; search: SearchState; onPick: (game: GameResult) => void }) {
  if (text.length < 2) return <p className={styles.hint}>{t.searchHint}</p>;
  if (search.kind === 'idle' || search.kind === 'loading') {
    return (
      <p className={styles.hint} role="status">
        {t.searching}
      </p>
    );
  }
  if (search.kind === 'error') return <Banner variant="error" title={search.error === 'not-configured' ? t.notConfigured : t.unavailable} />;
  if (search.results.length === 0) return <Banner title={t.noResultsTitle}>{t.noResultsText}</Banner>;
  return (
    <ul className={styles.resultList}>
      {search.results.map((game) => (
        <ResultItem
          key={game.igdbId}
          title={game.name}
          detail={game.detail}
          thumbnail={game.coverUrl}
          action={
            <Button variant="outline" onClick={() => onPick(game)} aria-label={`${t.pick} ${game.name}`}>
              {t.pick}
            </Button>
          }
        />
      ))}
    </ul>
  );
}
