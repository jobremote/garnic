'use client';

import { useState } from 'react';
import { Button, Tag, type TagColor } from 'nogasds';
import { tagMessages as t } from '@/lib/shelf/messages';
import { MAX_TAGS_PER_ENTRY } from '@/lib/shelf/tags';
import { createTagAction, type TagData } from '../shelf-actions';
import styles from '../shelf.module.css';
import { TagFields } from './ManageTagsModal';

export interface EntryTagsFieldProps {
  /** Todas as tags da pessoa. */
  tags: TagData[];
  /** Ids das tags do jogo. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Uma tag criada aqui: o pai a inclui na lista de tags. */
  onTagCreated: (tag: TagData) => void;
  error?: string;
}

/**
 * Tags do jogo na aba Essencial: as do jogo ficam coloridas e com "x" para tirar; as outras são "+ nome" para
 * adicionar (até 5 por jogo). "+ Nova tag" abre o mini-criador sem sair da edição.
 */
export function EntryTagsField({ tags, value, onChange, onTagCreated, error }: EntryTagsFieldProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>('neutral');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'color' | 'form', string>>>({});
  const [saving, setSaving] = useState(false);

  const selected = tags.filter((tag) => value.includes(tag.id));
  const available = tags.filter((tag) => !value.includes(tag.id));
  const full = value.length >= MAX_TAGS_PER_ENTRY;

  const create = async () => {
    setSaving(true);
    const result = await createTagAction(name, color);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.error === 'invalid' ? result.errors : { form: 'Não foi possível criar. Tente de novo.' });
      return;
    }
    onTagCreated(result.tag);
    if (!full) onChange([...value, result.tag.id]);
    setCreating(false);
    setName('');
    setColor('neutral');
    setErrors({});
  };

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{t.tagsLabel}</span>
      {selected.length === 0 ? (
        <p className={styles.hint}>{t.tagsNone}</p>
      ) : (
        <div className={styles.tagChips}>
          {selected.map((tag) => (
            <Tag key={tag.id} color={tag.color} onRemove={() => onChange(value.filter((id) => id !== tag.id))}>
              {tag.name}
            </Tag>
          ))}
        </div>
      )}
      {available.length > 0 ? (
        <div className={styles.tagChips}>
          {available.map((tag) => (
            <Tag key={tag.id} disabled={full} onClick={() => onChange([...value, tag.id])} aria-label={`Adicionar a tag ${tag.name}`}>
              {`+ ${tag.name}`}
            </Tag>
          ))}
        </div>
      ) : null}
      {full ? <p className={styles.hint}>{t.maxPerEntry(MAX_TAGS_PER_ENTRY)}</p> : null}
      {error ? <p className={styles.fieldError}>{error}</p> : null}

      {creating ? (
        <div className={styles.miniCreator}>
          <TagFields name={name} color={color} onName={setName} onColor={setColor} errors={errors} />
          {errors.form ? <p className={styles.fieldError}>{errors.form}</p> : null}
          <div className={styles.entryFooterEnd}>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={create} disabled={saving}>
              {t.create}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            {t.newTagPlus}
          </Button>
        </div>
      )}
    </div>
  );
}
