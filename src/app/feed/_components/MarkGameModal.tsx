'use client';

import { useState } from 'react';
import { Banner, Button, Modal, ResultItem, SearchField } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import type { GameResult } from '@/app/perfil/shelf-actions';
import styles from '../feed.module.css';
import { useGameSearch, type SearchState } from './use-game-search';

/** Jogo escolhido para o post. Só o que a tela precisa; ao publicar o servidor busca o jogo no IGDB de novo. */
export interface MarkedGame {
  igdbId: number;
  name: string;
  coverUrl?: string;
}

/**
 * Buscar um jogo no IGDB e marcá-lo no post (Figma: Marcar jogo). O jogo não precisa estar no Game Shelf. Pelo botão
 * "Marcar jogo" o resultado é o mesmo do "@": o nome entra no texto e o jogo na lista (quem usa a janela cuida disso).
 */
export function MarkGameModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (game: MarkedGame) => void }) {
  const [query, setQuery] = useState('');
  const text = query.trim();
  const search = useGameSearch(text, open);

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
