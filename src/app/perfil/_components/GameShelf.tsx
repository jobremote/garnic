'use client';

import { startTransition, useEffect, useOptimistic, useState, type DragEvent } from 'react';
import { BoardColumn, Button, Icon, IconButton, ItemCard, Menu, MenuOption, Select, Toast, type TagColor, type ToastProps } from 'nogasds';
import { shelfMessages as t, tagMessages as tm } from '@/lib/shelf/messages';
import { SHELF_STATUSES, STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import { addGameAction, moveGameAction, removeEntryAction, type GameResult, type TagData } from '../shelf-actions';
import styles from '../shelf.module.css';
import { AddGameModal } from './AddGameModal';
import { EntryModal, RemoveEntryModal } from './EntryModal';
import { ManageTagsModal } from './ManageTagsModal';

/** Um card do kanban, já com o que a tela precisa (nada de dados do banco que não deva ir ao navegador). */
export interface ShelfCardData {
  entryId: string;
  name: string;
  detail: string;
  coverUrl?: string;
  /** Tags do jogo (id, nome e cor). */
  tags: { id: string; name: string; color: TagColor }[];
}

export type ShelfData = Record<ShelfStatus, ShelfCardData[]>;

interface Notice {
  variant: NonNullable<ToastProps['variant']>;
  title: string;
  text?: string;
}

/** Janela aberta sobre o kanban: no máximo uma por vez. */
type Dialog =
  | { kind: 'edit'; entryId: string }
  | { kind: 'zeroed'; entryId: string }
  | { kind: 'remove'; entryId: string; name: string }
  | null;

const NOTICE_MS = 6000;

/** Game Shelf do perfil: kanban de 4 colunas, mover por menu ou arrastando (só no próprio perfil), adicionar, editar e remover. */
export function GameShelf({ columns, own, title, tags: tagsProp }: { columns: ShelfData; own: boolean; title: string; tags: TagData[] }) {
  // Lista de tags: vem do servidor e muda na hora quando a pessoa cria, edita ou exclui (o servidor reenvia depois).
  const [seenTags, setSeenTags] = useState(tagsProp);
  const [tagList, setTagList] = useState(tagsProp);
  if (seenTags !== tagsProp) {
    setSeenTags(tagsProp);
    setTagList(tagsProp);
  }
  const [filterTag, setFilterTag] = useState('');
  const [managing, setManaging] = useState(false);

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
  const [dialog, setDialog] = useState<Dialog>(null);
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

  /** Jogo que já está na Game Shelf: abre a entrada existente (sem duplicar). */
  const openExisting = (entryId: string) => {
    closeAdd();
    setDialog({ kind: 'edit', entryId });
  };

  const add = (game: GameResult, status: ShelfStatus, detail: boolean) => {
    setSaving(true);
    startTransition(async () => {
      const result = await addGameAction(game.igdbId, status);
      setSaving(false);
      if (!result.ok) {
        setNotice({ variant: 'error', title: result.error === 'unavailable' || result.error === 'not-configured' ? t.unavailable : t.failed });
        return;
      }
      closeAdd();
      if (result.alreadyOnShelf) {
        setNotice({ variant: 'info', title: t.alreadyOnShelf, text: t.alreadyOnShelfText(result.gameName, result.status) });
        if (detail) setDialog({ kind: 'edit', entryId: result.entryId });
        return;
      }
      setNotice({ variant: 'success', title: t.added, text: t.addedText(result.gameName, result.status) });
      // Escolheu "Adicionar e detalhar": abre a edição. Entrou direto em Zerado: convida a contar mais (tudo opcional).
      if (detail) setDialog({ kind: 'edit', entryId: result.entryId });
      else if (result.status === 'zerado') setDialog({ kind: 'zeroed', entryId: result.entryId });
    });
  };

  const move = (entryId: string, from: ShelfStatus, status: ShelfStatus) => {
    if (from === status) return;
    startTransition(async () => {
      moveOptimistically({ entryId, status });
      const result = await moveGameAction(entryId, status);
      if (!result.ok) {
        setNotice({ variant: 'error', title: t.failed });
        return;
      }
      setNotice({ variant: 'success', title: t.moved, text: t.movedText(result.gameName, result.status) });
      // Mover para Zerado conclui na hora; o pop-up que convida a contar mais é opcional.
      if (result.changed && result.status === 'zerado') setDialog({ kind: 'zeroed', entryId });
    });
  };

  const onSaved = (result: { gameName: string; statusChanged: boolean; status: ShelfStatus }) => {
    const wasZeroedPopup = dialog?.kind === 'zeroed';
    const entryId = dialog && dialog.kind !== 'remove' ? dialog.entryId : null;
    setNotice({ variant: 'success', title: t.saved, text: t.savedText(result.gameName) });
    setDialog(null);
    // Mudou para Zerado pela edição: o pop-up opcional também aparece (a não ser que ele mesmo acabou de salvar).
    if (!wasZeroedPopup && result.statusChanged && result.status === 'zerado' && entryId) setDialog({ kind: 'zeroed', entryId });
  };

  const confirmRemove = () => {
    if (dialog?.kind !== 'remove') return;
    const { entryId } = dialog;
    setSaving(true);
    startTransition(async () => {
      const result = await removeEntryAction(entryId);
      setSaving(false);
      setDialog(null);
      setNotice(
        result.ok
          ? { variant: 'success', title: t.removed, text: t.removedText(result.gameName) }
          : { variant: 'error', title: t.failed },
      );
    });
  };

  // Filtro por uma tag por vez. Tag excluída deixa de filtrar. Nome e cor dos cards vêm da lista viva de tags.
  const activeFilter = tagList.some((tag) => tag.id === filterTag) ? filterTag : '';
  const visible = (status: ShelfStatus) => board[status].filter((card) => !activeFilter || card.tags.some((tag) => tag.id === activeFilter));
  const cardTags = (card: ShelfCardData) =>
    card.tags.flatMap((tag) => {
      const live = tagList.find((item) => item.id === tag.id);
      return live ? [{ label: live.name, color: live.color }] : [];
    });

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
      {tagList.length > 0 || own ? (
        <div className={styles.toolbar}>
          {tagList.length > 0 ? (
            <Select label={tm.filterLabel} placeholder={null} value={activeFilter} onChange={(event) => setFilterTag(event.target.value)}>
              <option value="">{tm.filterAll}</option>
              {tagList.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          ) : null}
          {own ? (
            <Button variant="outline" onClick={() => setManaging(true)}>
              {tm.manageTags}
            </Button>
          ) : null}
        </div>
      ) : null}
      {/* Rolagem para o lado no celular: a região precisa receber foco para quem usa só o teclado. */}
      <div className={styles.kanban} role="region" aria-label={title} tabIndex={0}>
        {SHELF_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            className={over === status && dragging?.from !== status ? styles.dropTarget : undefined}
            title={STATUS_LABEL[status]}
            count={visible(status).length}
            emptyMessage={over === status && dragging?.from !== status ? t.dropHere : activeFilter ? tm.filterEmpty : t.empty}
            onDragOver={own && dragging ? (event) => { event.preventDefault(); setOver(status); } : undefined}
            onDragLeave={own ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); } : undefined}
            onDrop={own ? (event) => onDrop(event, status) : undefined}
          >
            {visible(status).map((card) => (
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
                <ItemCard title={card.name} detail={card.detail || undefined} thumbnail={card.coverUrl} tags={cardTags(card)} />
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
                    <MenuOption icon="edit" onClick={() => setDialog({ kind: 'edit', entryId: card.entryId })}>
                      {t.editEntry}
                    </MenuOption>
                    <MenuOption icon="close" danger onClick={() => setDialog({ kind: 'remove', entryId: card.entryId, name: card.name })}>
                      {t.removeEntry}
                    </MenuOption>
                  </Menu>
                ) : null}
              </div>
            ))}
          </BoardColumn>
        ))}
      </div>

      {own ? (
        <AddGameModal key={session} open={adding} onClose={closeAdd} onAdd={add} onOpenExisting={openExisting} pending={saving} />
      ) : null}

      {own && dialog && dialog.kind !== 'remove' ? (
        <EntryModal
          key={`${dialog.kind}-${dialog.entryId}`}
          mode={dialog.kind}
          entryId={dialog.entryId}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
          onRemove={(entryId, name) => setDialog({ kind: 'remove', entryId, name })}
          tags={tagList}
          onTagCreated={(tag) => setTagList((list) => (list.some((item) => item.id === tag.id) ? list : [...list, tag]))}
        />
      ) : null}
      {own && managing ? (
        <ManageTagsModal
          tags={tagList}
          onClose={() => setManaging(false)}
          onSaved={(tag, created) => {
            setTagList((list) => (created ? [...list, tag] : list.map((item) => (item.id === tag.id ? tag : item))));
            setNotice({ variant: 'success', title: created ? tm.tagCreated : tm.tagSaved, text: created ? tm.tagCreatedText(tag.name) : undefined });
          }}
          onDeleted={(tag) => {
            setTagList((list) => list.filter((item) => item.id !== tag.id));
            setNotice({ variant: 'success', title: tm.tagDeleted, text: tm.tagDeletedText(tag.name) });
          }}
        />
      ) : null}
      {own && dialog?.kind === 'remove' ? (
        <RemoveEntryModal name={dialog.name} pending={saving} onCancel={() => setDialog({ kind: 'edit', entryId: dialog.entryId })} onConfirm={confirmRemove} />
      ) : null}

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
