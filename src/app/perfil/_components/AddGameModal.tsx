'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Banner, Button, ChoiceCard, Modal, ResultItem, SearchField, type BadgeTone } from 'nogasds';
import { shelfMessages as t, STATUS_QUESTION } from '@/lib/shelf/messages';
import { SHELF_STATUSES, STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import { searchGamesAction, type GameResult } from '../shelf-actions';
import styles from '../shelf.module.css';

/** Cor do selo de status (decisão de 10/11/2026): Quero jogar = Céu, Parado = Rosa, Jogando = Informação, Zerado = Sucesso. */
export const STATUS_TONE: Record<ShelfStatus, BadgeTone> = {
  'quero-jogar': 'sky',
  parado: 'rose',
  jogando: 'info',
  zerado: 'success',
};

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; results: GameResult[] }
  | { kind: 'error'; error: 'not-configured' | 'unavailable' };

export interface AddGameModalProps {
  open: boolean;
  onClose: () => void;
  /** Chamado ao confirmar: o pai grava e mostra o aviso. Com `detail`, abre a edição da entrada em seguida. */
  onAdd: (game: GameResult, status: ShelfStatus, detail: boolean) => void;
  /** Jogo que já está na Game Shelf: abre a entrada existente, sem duplicar. */
  onOpenExisting: (entryId: string) => void;
  pending: boolean;
}

/** Buscar um jogo no IGDB e escolher em que coluna ele entra (Figma: Buscar jogo e Escolher status). */
export function AddGameModal({ open, onClose, onAdd, onOpenExisting, pending }: AddGameModalProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [selected, setSelected] = useState<GameResult | null>(null);
  const [status, setStatus] = useState<ShelfStatus>('quero-jogar');
  const latest = useRef(0);
  const group = useId();
  const text = query.trim();

  // Busca com espera de 400 ms depois da última tecla; respostas atrasadas de buscas antigas são ignoradas.
  useEffect(() => {
    if (text.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setSearch({ kind: 'loading' });
      const response = await searchGamesAction(text);
      if (id !== latest.current) return;
      setSearch(response.ok ? { kind: 'done', results: response.results } : { kind: 'error', error: response.error });
    }, 400);
    return () => clearTimeout(timer);
  }, [text]);

  const choosing = selected !== null;
  const footer = choosing ? (
    <>
      <Button variant="outline" onClick={() => setSelected(null)} disabled={pending}>
        {t.back}
      </Button>
      <Button variant="secondary" onClick={() => onAdd(selected, status, true)} disabled={pending}>
        {t.addAndDetail}
      </Button>
      <Button onClick={() => onAdd(selected, status, false)} disabled={pending}>
        {t.add}
      </Button>
    </>
  ) : undefined;

  return (
    <Modal open={open} onClose={onClose} title={t.addGame} footer={footer}>
      {choosing ? (
        <div className={styles.modalBody}>
          <ul className={styles.resultList}>
            <ResultItem title={selected.name} detail={selected.detail} thumbnail={selected.coverUrl} />
          </ul>
          <fieldset className={styles.choices}>
            <legend className={styles.legend}>{t.chooseStatus}</legend>
            {SHELF_STATUSES.map((value) => (
              <ChoiceCard
                key={value}
                name={group}
                value={value}
                title={STATUS_LABEL[value]}
                description={STATUS_QUESTION[value]}
                checked={status === value}
                onChange={() => setStatus(value)}
              />
            ))}
          </fieldset>
          <p className={styles.hint}>{t.chooseStatusHint}</p>
        </div>
      ) : (
        <div className={styles.modalBody}>
          <SearchField
            label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            autoFocus
          />
          <SearchResults
            text={text}
            search={search}
            onPick={(game) => {
              setSelected(game);
              setStatus('quero-jogar');
            }}
            onOpenExisting={onOpenExisting}
          />
        </div>
      )}
    </Modal>
  );
}

function SearchResults({
  text,
  search,
  onPick,
  onOpenExisting,
}: {
  text: string;
  search: SearchState;
  onPick: (game: GameResult) => void;
  onOpenExisting: (entryId: string) => void;
}) {
  if (text.length < 2) return <p className={styles.hint}>{t.searchHint}</p>;
  if (search.kind === 'idle' || search.kind === 'loading') {
    return (
      <p className={styles.hint} role="status">
        {t.searching}
      </p>
    );
  }
  if (search.kind === 'error') {
    return <Banner variant="error" title={search.error === 'not-configured' ? t.notConfigured : t.unavailable} />;
  }
  if (search.results.length === 0) {
    return (
      <Banner title={t.noResultsTitle}>
        {t.noResultsText}
      </Banner>
    );
  }
  return (
    <ul className={styles.resultList}>
      {search.results.map((game) => (
        <ResultItem
          key={game.igdbId}
          title={game.name}
          detail={game.detail}
          thumbnail={game.coverUrl}
          action={
            game.status ? (
              <>
                <Badge tone={STATUS_TONE[game.status]}>{STATUS_LABEL[game.status]}</Badge>
                {game.entryId ? (
                  <Button variant="ghost" onClick={() => onOpenExisting(game.entryId as string)} aria-label={`${t.editEntry}: ${game.name}`}>
                    {t.editEntry}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button variant="outline" onClick={() => onPick(game)} aria-label={`${t.add} ${game.name}`}>
                {t.add}
              </Button>
            )
          }
        />
      ))}
    </ul>
  );
}
