'use client';

import { useState } from 'react';
import { Banner, Button, ColorPicker, Modal, Tag, TextField, type TagColor } from 'nogasds';
import { tagMessages as t } from '@/lib/shelf/messages';
import { MAX_TAGS_PER_USER, TAG_NAME_MAX } from '@/lib/shelf/tags';
import { createTagAction, deleteTagAction, updateTagAction, type TagData } from '../shelf-actions';
import styles from '../shelf.module.css';

type View = { kind: 'list' } | { kind: 'form'; tag: TagData | null } | { kind: 'delete'; tag: TagData };

export interface ManageTagsModalProps {
  tags: TagData[];
  onClose: () => void;
  onSaved: (tag: TagData, created: boolean) => void;
  onDeleted: (tag: TagData) => void;
}

/** Gerenciar tags: lista com a quantidade de jogos, criar, editar e excluir (Figma: Gerenciar tags, Nova tag, Excluir tag). */
export function ManageTagsModal({ tags, onClose, onSaved, onDeleted }: ManageTagsModalProps) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const back = () => setView({ kind: 'list' });

  if (view.kind === 'form') {
    return (
      <TagForm
        tag={view.tag}
        onCancel={back}
        onSaved={(saved, created) => {
          onSaved(saved, created);
          back();
        }}
        onDelete={view.tag ? () => setView({ kind: 'delete', tag: view.tag as TagData }) : undefined}
      />
    );
  }
  if (view.kind === 'delete') {
    return <DeleteTag tag={view.tag} onCancel={() => setView({ kind: 'form', tag: view.tag })} onDeleted={(tag) => { onDeleted(tag); back(); }} />;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.manageTags}
      closeLabel={t.closeManage}
      footer={
        <Button onClick={() => setView({ kind: 'form', tag: null })} disabled={tags.length >= MAX_TAGS_PER_USER}>
          {t.newTag}
        </Button>
      }
    >
      <div className={styles.modalBody}>
        <p className={styles.hint}>{t.tagsCounter(tags.length, MAX_TAGS_PER_USER)}</p>
        {tags.length === 0 ? (
          <Banner title={t.manageTagsEmpty} />
        ) : (
          <ul className={styles.tagList}>
            {tags.map((tag) => (
              <li key={tag.id} className={styles.tagRow}>
                <Tag color={tag.color} className={styles.tagChip}>
                  {tag.name}
                </Tag>
                <span className={styles.hint}>{t.tagGames(tag.gameCount)}</span>
                <Button variant="ghost" size="sm" onClick={() => setView({ kind: 'form', tag })} aria-label={`${t.editTag}: ${tag.name}`}>
                  {t.editTag}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** Nome, cor e pré-visualização. Serve para criar (`tag` nulo) e para editar. */
function TagForm({
  tag,
  onCancel,
  onSaved,
  onDelete,
}: {
  tag: TagData | null;
  onCancel: () => void;
  onSaved: (tag: TagData, created: boolean) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState<TagColor>(tag?.color ?? 'neutral');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'color' | 'form', string>>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result = tag ? await updateTagAction(tag.id, name, color) : await createTagAction(name, color);
    setSaving(false);
    if (result.ok) return onSaved({ ...result.tag, gameCount: tag?.gameCount ?? 0 }, tag === null);
    setErrors(result.error === 'invalid' ? result.errors : { form: 'Não foi possível salvar. Tente de novo.' });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={tag ? t.editTag : t.newTag}
      footer={
        <div className={styles.entryFooter}>
          {onDelete ? (
            <Button variant="danger-ghost" onClick={onDelete} disabled={saving}>
              {t.deleteTag}
            </Button>
          ) : (
            <span />
          )}
          <div className={styles.entryFooterEnd}>
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {tag ? t.saveTag : t.create}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.modalBody}>
        {errors.form ? <Banner variant="error" title={errors.form} /> : null}
        <TagFields name={name} color={color} onName={setName} onColor={setColor} errors={errors} />
      </div>
    </Modal>
  );
}

/** Campos de tag (nome, cor e pré-visualização), também usados pelo mini-criador da edição da entrada. */
export function TagFields({
  name,
  color,
  onName,
  onColor,
  errors,
}: {
  name: string;
  color: TagColor;
  onName: (value: string) => void;
  onColor: (value: TagColor) => void;
  errors: Partial<Record<'name' | 'color' | 'form', string>>;
}) {
  return (
    <>
      <TextField
        label={t.tagNameLabel}
        value={name}
        maxLength={TAG_NAME_MAX + 10}
        error={errors.name ?? (name.trim().length > TAG_NAME_MAX ? t.tagNameHint(name.trim().length, TAG_NAME_MAX) : undefined)}
        helpText={t.tagNameHint(name.trim().length, TAG_NAME_MAX)}
        onChange={(event) => onName(event.target.value)}
        autoComplete="off"
      />
      <ColorPicker label={t.tagColorLabel} value={color} onChange={onColor} />
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t.tagPreview}</span>
        <div>
          <Tag color={color}>{name.trim() === '' ? t.tagNameLabel : name.trim()}</Tag>
        </div>
      </div>
    </>
  );
}

/** Confirmação de excluir (Figma: Excluir tag): os jogos continuam na Game Shelf. */
function DeleteTag({ tag, onCancel, onDeleted }: { tag: TagData; onCancel: () => void; onDeleted: (tag: TagData) => void }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = async () => {
    setSaving(true);
    const result = await deleteTagAction(tag.id);
    setSaving(false);
    if (result.ok) onDeleted(tag);
    else setFailed(true);
  };
  return (
    <Modal
      open
      onClose={onCancel}
      title={t.deleteTitle}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={saving}>
            {t.deleteTag}
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        {failed ? <Banner variant="error" title="Não foi possível excluir. Tente de novo." /> : null}
        <Banner variant="error" title={t.deleteTitle}>
          {t.deleteText(tag.name, tag.gameCount)}
        </Banner>
      </div>
    </Modal>
  );
}
