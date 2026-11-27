'use client';

import { useId, useState } from 'react';
import { Badge, Button, ButtonLink, ChoiceCard, Icon, Modal, Toast } from 'nogasds';
import { STATUS_TONE } from '@/app/perfil/_components/AddGameModal';
import { addGameAction } from '@/app/perfil/shelf-actions';
import { gameMessages as t } from '@/lib/game/messages';
import { STATUS_QUESTION } from '@/lib/shelf/messages';
import { SHELF_STATUSES, STATUS_LABEL, type ShelfStatus } from '@/lib/shelf/status';
import styles from '../game.module.css';

/**
 * Ações do cabeçalho: no Game Shelf, o selo do status e "Editar" (abre a edição em 3 abas no perfil); fora, "Adicionar
 * ao Game Shelf", que pergunta a coluna (decisão de 27/11/2026).
 */
export function GameHeroActions({
  igdbId,
  gameName,
  username,
  entry: initialEntry,
}: {
  igdbId: number;
  gameName: string;
  /** @usuário de quem está vendo (o "Editar" leva ao perfil dela). */
  username: string;
  entry: { entryId: string; status: ShelfStatus } | null;
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [choosing, setChoosing] = useState(false);
  const [status, setStatus] = useState<ShelfStatus>('quero-jogar');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; title: string } | null>(null);
  const group = useId();

  async function add() {
    setPending(true);
    const result = await addGameAction(igdbId, status);
    setPending(false);
    if (!result.ok) return setNotice({ variant: 'error', title: t.addFailed });
    setChoosing(false);
    setEntry({ entryId: result.entryId, status: result.status });
    setNotice({ variant: 'success', title: t.added(gameName, STATUS_LABEL[result.status]) });
  }

  return (
    <>
      {entry ? (
        <>
          <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
          <ButtonLink href={`/perfil/${username}?editar=${entry.entryId}`} variant="outline" size="sm" leadingIcon={<Icon name="edit" />}>
            {t.edit}
          </ButtonLink>
        </>
      ) : (
        <Button leadingIcon={<Icon name="add" />} onClick={() => setChoosing(true)}>
          {t.add}
        </Button>
      )}
      {choosing ? (
        <Modal
          open
          onClose={() => setChoosing(false)}
          title={t.addTitle}
          footer={
            <>
              <Button variant="outline" onClick={() => setChoosing(false)} disabled={pending}>
                {t.cancel}
              </Button>
              <Button onClick={() => void add()} disabled={pending}>
                {t.confirmAdd}
              </Button>
            </>
          }
        >
          <fieldset className={styles.choices}>
            <legend className={styles.legend}>{gameName}</legend>
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
        </Modal>
      ) : null}
      {notice ? (
        <div className={styles.toast}>
          <Toast variant={notice.variant} title={notice.title} onClose={() => setNotice(null)} closeLabel={t.closeToast} />
        </div>
      ) : null}
    </>
  );
}
