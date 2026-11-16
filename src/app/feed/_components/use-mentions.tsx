'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { getMentionOptionId, MentionList, type MentionItem } from 'nogasds';
import { feedMessages as t } from '@/lib/feed/messages';
import { findMentionTrigger, insertMention } from '@/lib/feed/mentions';
import { POST_GAMES_MAX, POST_MAX } from '@/lib/feed/posts';
import type { GameResult } from '@/app/perfil/shelf-actions';
import styles from '../feed.module.css';
import type { MarkedGame } from './MarkGameModal';
import { SEARCH_MIN, useGameSearch } from './use-game-search';
import type { PostDraftApi } from './use-post-draft';

/**
 * Marcar jogos digitando "@" (entrega B do Feed). Acompanha o cursor do campo de texto: com um "@" em edição, abre a
 * lista de sugestões do IGDB logo abaixo; ao escolher (clique ou Enter), o "@Nome" entra no texto e o jogo na lista
 * de marcados. O botão "Marcar jogo" usa `insertGame` e dá o mesmo resultado, no cursor. Teclado: setas, Enter e Esc.
 */
export function useMentions(api: PostDraftApi) {
  const { draft } = api;
  const listId = useId();
  // O campo de texto vem por uma ref de função (estado), para a tela poder ler o resto sem tocar em ref durante a renderização.
  const [field, setField] = useState<HTMLTextAreaElement | null>(null);
  const caretRef = useRef(draft.body.length);
  const [caret, setCaret] = useState(draft.body.length);
  const [activeState, setActiveState] = useState({ key: '', index: 0 });
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trigger = useMemo(() => findMentionTrigger(draft.body, Math.min(caret, draft.body.length), draft.games), [draft.body, draft.games, caret]);
  // Esc fecha a lista só para o "@" em que foi apertado; sem "@" em edição, o fechamento é esquecido.
  if (trigger === null && dismissed !== null) setDismissed(null);
  const open = trigger !== null && trigger.start !== dismissed;
  const text = open ? trigger.query.trim() : '';
  const full = draft.games.length >= POST_GAMES_MAX;
  const search = useGameSearch(text, open && !full);

  const results = useMemo<GameResult[]>(
    () => (search.kind === 'done' ? search.results.filter((result) => !draft.games.some((game) => game.igdbId === result.igdbId)) : []),
    [search, draft.games],
  );
  const items = useMemo<MentionItem[]>(
    () => results.map((result) => ({ id: String(result.igdbId), label: result.name, detail: result.detail, thumbnail: result.coverUrl })),
    [results],
  );

  // A sugestão ativa volta para a primeira quando muda o que foi digitado ou a lista de resultados.
  const activeKey = `${text}|${results.length}`;
  const active = activeState.key === activeKey ? activeState.index : 0;
  const setActive = (next: number | ((index: number) => number)) =>
    setActiveState((current) => {
      const base = current.key === activeKey ? current.index : 0;
      return { key: activeKey, index: typeof next === 'function' ? next(base) : next };
    });

  /** Guarda a posição do cursor do campo (lida do próprio campo, dentro de um evento). */
  function syncCaret() {
    const position = field?.selectionStart ?? draft.body.length;
    caretRef.current = position;
    setCaret(position);
  }

  /** Põe o "@Nome" no lugar de `range`, marca o jogo e devolve o cursor ao campo, depois do nome. */
  function place(game: MarkedGame, range: { start: number; end: number }) {
    if (full) return;
    const next = insertMention(draft.body, game.name, range);
    if (next.text.length > POST_MAX) {
      setNotice(t.mentionTooLong);
      return;
    }
    setNotice(null);
    api.addGame(game, next.text);
    setDismissed(null);
    caretRef.current = next.caret;
    setCaret(next.caret);
    requestAnimationFrame(() => {
      if (!field) return;
      field.focus();
      field.setSelectionRange(next.caret, next.caret);
      caretRef.current = next.caret;
      setCaret(next.caret);
    });
  }

  function choose(result: GameResult) {
    if (!trigger) return;
    const end = field?.selectionStart ?? caretRef.current;
    place({ igdbId: result.igdbId, name: result.name, coverUrl: result.coverUrl }, { start: trigger.start, end });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || !trigger) return;
    if (event.key === 'Escape') {
      // Fecha só a lista, e não a janela de edição em volta.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(trigger.start);
      return;
    }
    if (results.length === 0 || full) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[Math.min(active, results.length - 1)]);
    }
  }

  const showingList = open && !full && results.length > 0;

  let suggestions = null;
  if (open) {
    if (full) {
      suggestions = <p className={styles.hint}>{t.gamesLimit}</p>;
    } else if (text.length < SEARCH_MIN) {
      suggestions = <p className={styles.hint}>{t.mentionHint}</p>;
    } else if (search.kind === 'idle' || search.kind === 'loading') {
      suggestions = (
        <p className={styles.hint} role="status">
          {t.searching}
        </p>
      );
    } else if (search.kind === 'error') {
      suggestions = (
        <p className={styles.error} role="alert">
          {search.error === 'not-configured' ? t.notConfigured : t.unavailable}
        </p>
      );
    } else {
      suggestions = (
        <MentionList
          id={listId}
          label={t.mentionListLabel}
          items={items}
          activeIndex={active}
          onActiveChange={setActive}
          onSelect={(_, index) => choose(results[index])}
          hint={t.mentionKeys}
          emptyMessage={t.noResultsTitle}
        />
      );
    }
  }

  return {
    /** Ref de função do campo de texto: passe ao `inputRef` do `PostComposer` (ou ao `ref` do `TextArea`). */
    attachField: setField,
    /** Chame com o texto novo a cada mudança do campo: troca o texto do rascunho e acompanha o cursor. */
    change: (value: string) => {
      api.setBody(value);
      syncCaret();
    },
    /** Passe ao `inputProps` do `PostComposer` (ou espalhe no campo de texto). */
    inputProps: {
      // Continua sendo uma caixa de texto (sem role="combobox"); só aponta para a lista e para a opção ativa.
      'aria-autocomplete': 'list' as const,
      'aria-controls': showingList ? listId : undefined,
      'aria-activedescendant': showingList ? getMentionOptionId(listId, Math.min(active, results.length - 1)) : undefined,
      onKeyDown,
      onSelect: syncCaret,
      onClick: syncCaret,
    },
    /** A lista (ou a mensagem de espera) para mostrar logo abaixo do campo; `null` quando não há "@" em edição. */
    suggestions,
    /** Aviso de erro das menções (por exemplo, o texto passaria do limite); `null` quando não há. */
    notice,
    /** Botão "Marcar jogo": o mesmo resultado do "@", no cursor (ou no fim do texto, se o campo ainda não teve cursor). */
    insertGame: (game: MarkedGame) => {
      const position = Math.min(caretRef.current, draft.body.length);
      place(game, { start: position, end: position });
    },
  };
}
