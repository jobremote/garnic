'use client';

import { startTransition, useEffect, useOptimistic, useState, type DragEvent } from 'react';
import { BoardColumn, Icon, IconButton, ItemCard, Menu, MenuOption, Toast, type ToastProps } from 'nogasds';
import { shelfMessages as t } from '@/lib/shelf/messages';
import { SHELF_STATUSES, STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import { addGameAction, moveGameAction, type GameResult } from '../shelf-actions';
import styles from '../shelf.module.css';
import { AddGameModal } from './AddGameModal';

/** Um card do kanban, já com o que a tela precisa (nada de dados do banco que não deva ir ao navegador). */
export interface ShelfCardData {
  entryId: string;
  name: string;
  detail: string;
  coverUrl?: string;
}

export type ShelfData = Record<ShelfStatus, ShelfCardData[]>;

interface Notice {
  variant: NonNullable<ToastProps['variant']>;
  title: string;
  text?: string;
}

const NOTICE_MS = 6000;

/** Game Shelf do perfil: kanban de 4 colunas, mover por menu ou arrastando (só no próprio perfil) e adicionar jogo. */
export function GameShelf({ columns, own, title }: { columns: ShelfData; own: boolean; title: string }) {
  const [board, moveOptimistically] = useOptimistic(columns, (state: ShelfData, move: { entryId: string; status: ShelfStatus }) => {
    const next = { ...state };
    let card: ShelfCardData | undefined;
    for (const status of SHELF_STATUSES) {
      const found = state[status].find((item) => item.entryId === move.entryId);
      if (found) {
        card = found;
        next[status] = state[status].filter((item) => item.entryId !== move.entryId);
      }
    }
    if (card) next[move.status] = [card, ...next[move.status]];
    return next;
  });
  const [adding, setAdding] = useState(false);
  const [session, setSession] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dragging, setDragging] = useState<{ entryId: string; from: ShelfStatus } | null>(null);
  const [over, setOver] = useState<ShelfStatus | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const closeAdd = () => {
    setAdding(false);
    setSession((value) => value + 1); // recria o modal: a próxima busca começa do zero
  };

  const add = (game: GameResult, status: ShelfStatus) => {
    setSaving(true);
    startTransition(async () => {
      const result = await addGameAction(game.igdbId, status);
      setSaving(false);
      if (!result.ok) {
        setNotice({ variant: 'error', title: result.error === 'unavailable' || result.error === 'not-configured' ? t.unavailable : t.failed });
        return;
      }
      closeAdd();
      setNotice(
        result.alreadyOnShelf
          ? { variant: 'info', title: t.alreadyOnShelf, text: t.alreadyOnShelfText(result.gameName, result.status) }
          : { variant: 'success', title: t.added, text: t.addedText(result.gameName, result.status) },
      );
    });
  };

  const move = (entryId: string, from: ShelfStatus, status: ShelfStatus) => {
    if (from === status) return;
    startTransition(async () => {
      moveOptimistically({ entryId, status });
      const result = await moveGameAction(entryId, status);
      setNotice(
        result.ok
          ? { variant: 'success', title: t.moved, text: t.movedText(result.gameName, result.status) }
          : { variant: 'error', title: t.failed },
      );
    });
  };

  const onDrop = (event: DragEvent, status: ShelfStatus) => {
    event.preventDefault();
    const drag = dragging;
    setDragging(null);
    setOver(null);
    if (drag) move(drag.entryId, drag.from, status);
  };

  return (
    <>
      <div className={styles.sectionHeader}>
        <h2 id="game-shelf" className={styles.sectionTitle}>
          {title}
        </h2>
        {own ? <IconButton icon="add" label={t.addGame} variant="outline" size="sm" onClick={() => setAdding(true)} /> : null}
      </div>
      {/* Rolagem para o lado no celular: a região precisa receber foco para quem usa só o teclado. */}
      <div className={styles.kanban} role="region" aria-label={title} tabIndex={0}>
        {SHELF_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            className={over === status && dragging?.from !== status ? styles.dropTarget : undefined}
            title={STATUS_LABEL[status]}
            count={board[status].length}
            emptyMessage={over === status && dragging?.from !== status ? t.dropHere : t.empty}
            onDragOver={own && dragging ? (event) => { event.preventDefault(); setOver(status); } : undefined}
            onDragLeave={own ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); } : undefined}
            onDrop={own ? (event) => onDrop(event, status) : undefined}
          >
            {board[status].map((card) => (
              <div
                key={card.entryId}
                className={styles.card}
                data-dragging={dragging?.entryId === card.entryId || undefined}
                draggable={own}
                onDragStart={own ? (event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', card.entryId);
                  setDragging({ entryId: card.entryId, from: status });
                } : undefined}
                onDragEnd={own ? () => { setDragging(null); setOver(null); } : undefined}
              >
                <ItemCard title={card.name} detail={card.detail || undefined} thumbnail={card.coverUrl} />
                {own ? (
                  <Menu
                    className={styles.cardMenu}
                    label={t.actionsLabel(card.name)}
                    trigger={<Icon name="more-horiz" size={20} />}
                  >
                    {SHELF_STATUSES.filter((value) => value !== status).map((value) => (
                      <MenuOption key={value} onClick={() => move(card.entryId, status, value)}>
                        {t.moveTo(value)}
                      </MenuOption>
                    ))}
                  </Menu>
                ) : null}
              </div>
            ))}
          </BoardColumn>
        ))}
      </div>

      {own ? <AddGameModal key={session} open={adding} onClose={closeAdd} onAdd={add} pending={saving} /> : null}

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
