'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Modal, ResultItem, SearchField, Tag } from 'nogasds';
import { shelfMessages as t } from '@/lib/shelf/messages';
import { QUICK_ADD_MAX } from '@/lib/shelf/shelf';
import { STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import { searchGamesAction, type GameResult } from '../shelf-actions';
import styles from '../shelf.module.css';
import { STATUS_TONE } from './AddGameModal';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; results: GameResult[] }
  | { kind: 'error'; error: 'not-configured' | 'unavailable' };

export interface QuickAddModalProps {
  /** A coluna em que todos os jogos escolhidos vão entrar. */
  status: ShelfStatus;
  onClose: () => void;
  /** Confirmar: o pai grava a lista de uma vez e mostra o aviso. */
  onConfirm: (games: GameResult[]) => void;
  pending: boolean;
}

/**
 * Cadastro rápido (botão + de cada coluna): busca, escolhe vários jogos como chips (como as tags) e adiciona todos de
 * uma vez na coluna. A busca continua aberta depois de cada escolha, e a lista escolhida não se perde ao buscar outro nome.
 */
export function QuickAddModal({ status, onClose, onConfirm, pending }: QuickAddModalProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [chosen, setChosen] = useState<GameResult[]>([]);
  const latest = useRef(0);
  const text = query.trim();
  const full = chosen.length >= QUICK_ADD_MAX;

  // Mesma busca da entrada de um jogo só: espera 400 ms depois da última tecla e ignora respostas de buscas antigas.
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

  const isChosen = (game: GameResult) => chosen.some((item) => item.igdbId === game.igdbId);
  const toggle = (game: GameResult) =>
    setChosen((list) => (list.some((item) => item.igdbId === game.igdbId) ? list.filter((item) => item.igdbId !== game.igdbId) : [...list, game]));

  return (
    <Modal
      open
      onClose={onClose}
      title={t.quickAddTitle(status)}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t.cancel}
          </Button>
          <Button onClick={() => onConfirm(chosen)} disabled={pending || chosen.length === 0}>
            {chosen.length === 0 ? t.add : t.quickConfirm(chosen.length)}
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        <p className={styles.hint}>{t.quickAddHint(QUICK_ADD_MAX)}</p>

        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>{t.quickChosen}</span>
          {chosen.length === 0 ? (
            <p className={styles.hint}>{t.quickNone}</p>
          ) : (
            <div className={styles.tagChips}>
              {chosen.map((game) => (
                <Tag key={game.igdbId} onRemove={() => toggle(game)} removeLabel={t.quickRemoveChip}>
                  {game.name}
                </Tag>
              ))}
            </div>
          )}
          {full ? <p className={styles.hint}>{t.quickFull(QUICK_ADD_MAX)}</p> : null}
        </div>

        <SearchField
          label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          autoComplete="off"
          autoFocus
        />
        <Results text={text} search={search} isChosen={isChosen} full={full} onToggle={toggle} />
      </div>
    </Modal>
  );
}

function Results({
  text,
  search,
  isChosen,
  full,
  onToggle,
}: {
  text: string;
  search: SearchState;
  isChosen: (game: GameResult) => boolean;
  full: boolean;
  onToggle: (game: GameResult) => void;
}) {
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
      {search.results.map((game) => {
        const chosen = isChosen(game);
        return (
          <ResultItem
            key={game.igdbId}
            title={game.name}
            detail={game.detail}
            thumbnail={game.coverUrl}
            action={
              game.status ? (
                // Já está na Game Shelf (em qualquer coluna): não entra de novo.
                <Badge tone={STATUS_TONE[game.status]}>{STATUS_LABEL[game.status]}</Badge>
              ) : (
                <Button
                  variant={chosen ? 'secondary' : 'outline'}
                  aria-pressed={chosen}
                  disabled={!chosen && full}
                  onClick={() => onToggle(game)}
                  aria-label={`${chosen ? t.quickIncluded : t.quickInclude}: ${game.name}`}
                >
                  {chosen ? t.quickIncluded : t.quickInclude}
                </Button>
              )
            }
          />
        );
      })}
    </ul>
  );
}
