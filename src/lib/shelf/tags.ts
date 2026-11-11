import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { shelfEntries, shelfEntryTags, tags } from '@/lib/db/schema';

/** Tags da Game Shelf (`01_produto/regras-de-negocio/gameshelf.md`). */

export const TAG_COLORS = ['neutral', 'wine', 'petrol', 'olive', 'rose', 'sky'] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const isTagColor = (value: unknown): value is TagColor => typeof value === 'string' && (TAG_COLORS as readonly string[]).includes(value);

/** Limites decididos com o Leo em 11/11/2026. */
export const TAG_NAME_MAX = 24;
export const MAX_TAGS_PER_USER = 30;
export const MAX_TAGS_PER_ENTRY = 5;

export interface TagView {
  id: string;
  name: string;
  color: TagColor;
}

export interface TagWithCount extends TagView {
  /** Quantos jogos da pessoa têm a tag. */
  gameCount: number;
}

/** Nome da tag: espaços repetidos viram um só e as pontas são aparadas. */
export const normalizeTagName = (name: string) => name.replace(/\s+/g, ' ').trim();

export type TagErrorCode = 'name-required' | 'name-too-long' | 'name-taken' | 'invalid-color' | 'too-many-tags';
export type TagResult = { ok: true; tag: TagView } | { ok: false; error: 'not-found' } | { ok: false; error: 'invalid'; errors: Partial<Record<'name' | 'color' | 'form', TagErrorCode>> };

const asTag = (row: { id: string; name: string; color: string }): TagView => ({ id: row.id, name: row.name, color: isTagColor(row.color) ? row.color : 'neutral' });

/** Todas as tags da pessoa, em ordem alfabética, com a quantidade de jogos de cada uma. */
export async function listTags(db: Db, userId: string): Promise<TagWithCount[]> {
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color, gameCount: sql<number>`count(${shelfEntryTags.entryId})::int` })
    .from(tags)
    .leftJoin(shelfEntryTags, eq(shelfEntryTags.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id)
    .orderBy(asc(sql`lower(${tags.name})`));
  return rows.map((row) => ({ ...asTag(row), gameCount: row.gameCount }));
}

const isNameTaken = (error: unknown) => {
  const text = String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? '');
  return text.includes('tags_user_name_key');
};

function checkName(name: string): TagErrorCode | null {
  if (name === '') return 'name-required';
  if (name.length > TAG_NAME_MAX) return 'name-too-long';
  return null;
}

/** Cria uma tag. Até 30 por pessoa; nome de até 24 caracteres e único por pessoa (sem diferenciar maiúsculas). */
export async function createTag(db: Db, userId: string, input: { name: string; color: unknown }): Promise<TagResult> {
  const name = normalizeTagName(typeof input.name === 'string' ? input.name : '');
  const errors: Partial<Record<'name' | 'color' | 'form', TagErrorCode>> = {};
  const nameProblem = checkName(name);
  if (nameProblem) errors.name = nameProblem;
  if (!isTagColor(input.color)) errors.color = 'invalid-color';
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(tags).where(eq(tags.userId, userId));
  if (total >= MAX_TAGS_PER_USER) return { ok: false, error: 'invalid', errors: { form: 'too-many-tags' } };
  try {
    const [row] = await db.insert(tags).values({ userId, name, color: input.color as TagColor }).returning();
    return { ok: true, tag: asTag(row) };
  } catch (error) {
    // Duas criações do mesmo nome ao mesmo tempo: o índice único decide.
    if (isNameTaken(error)) return { ok: false, error: 'invalid', errors: { name: 'name-taken' } };
    throw error;
  }
}

/** Muda nome e/ou cor. Campo ausente mantém o valor. Só o dono. */
export async function updateTag(db: Db, userId: string, tagId: string, input: { name?: string; color?: unknown }): Promise<TagResult> {
  const [current] = await db.select().from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId))).limit(1);
  if (!current) return { ok: false, error: 'not-found' };

  const errors: Partial<Record<'name' | 'color', TagErrorCode>> = {};
  const set: Partial<typeof tags.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = normalizeTagName(typeof input.name === 'string' ? input.name : '');
    const problem = checkName(name);
    if (problem) errors.name = problem;
    else set.name = name;
  }
  if (input.color !== undefined) {
    if (isTagColor(input.color)) set.color = input.color;
    else errors.color = 'invalid-color';
  }
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };
  if (Object.keys(set).length > 0) {
    try {
      await db.update(tags).set(set).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
    } catch (error) {
      if (isNameTaken(error)) return { ok: false, error: 'invalid', errors: { name: 'name-taken' } };
      throw error;
    }
  }
  return { ok: true, tag: asTag({ id: current.id, name: set.name ?? current.name, color: set.color ?? current.color }) };
}

export type DeleteTagResult = { ok: true; name: string; gameCount: number } | { ok: false; error: 'not-found' };

/** Exclui a tag. Remove só a associação: os jogos continuam na Game Shelf. Só o dono. */
export async function deleteTag(db: Db, userId: string, tagId: string): Promise<DeleteTagResult> {
  const found = (await listTags(db, userId)).find((tag) => tag.id === tagId);
  if (!found) return { ok: false, error: 'not-found' };
  await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
  return { ok: true, name: found.name, gameCount: found.gameCount };
}

export type TagIdsCheck = { ok: true; ids: string[] } | { ok: false; error: 'invalid-tags' | 'too-many-tags' };

/**
 * Confere uma lista de tags para uma entrada: sem repetidas, todas da própria pessoa e no máximo 5.
 * Devolve os ids limpos.
 */
export async function checkTagIds(db: Db, userId: string, tagIds: unknown): Promise<TagIdsCheck> {
  if (!Array.isArray(tagIds) || tagIds.some((id) => typeof id !== 'string')) return { ok: false, error: 'invalid-tags' };
  const ids = [...new Set(tagIds as string[])];
  if (ids.length > MAX_TAGS_PER_ENTRY) return { ok: false, error: 'too-many-tags' };
  if (ids.length === 0) return { ok: true, ids };
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return { ok: false, error: 'invalid-tags' };
  const owned = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.userId, userId), inArray(tags.id, ids)));
  return owned.length === ids.length ? { ok: true, ids } : { ok: false, error: 'invalid-tags' };
}

/**
 * Troca as tags de uma entrada pelas da lista (já conferida com `checkTagIds`). Uma instrução SQL só (apaga as que
 * saíram e insere as novas), porque o Neon HTTP não tem transações.
 */
export async function replaceEntryTags(db: Db, entryId: string, tagIds: string[]): Promise<void> {
  const keep = tagIds.length > 0 ? sql`AND tag_id NOT IN (${sql.join(tagIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  if (tagIds.length === 0) {
    await db.execute(sql`DELETE FROM shelf_entry_tags WHERE entry_id = ${entryId}::uuid`);
    return;
  }
  await db.execute(sql`
    WITH removed AS (
      DELETE FROM shelf_entry_tags WHERE entry_id = ${entryId}::uuid ${keep} RETURNING 1
    )
    INSERT INTO shelf_entry_tags (entry_id, tag_id)
    SELECT ${entryId}::uuid, t.id FROM tags t WHERE t.id IN (${sql.join(tagIds.map((id) => sql`${id}::uuid`), sql`, `)})
    ON CONFLICT DO NOTHING
  `);
}

/** Tags de várias entradas de uma vez (para os cards do kanban e para a edição). */
export async function tagsByEntry(db: Db, entryIds: string[]): Promise<Map<string, TagView[]>> {
  const result = new Map<string, TagView[]>();
  if (entryIds.length === 0) return result;
  const rows = await db
    .select({ entryId: shelfEntryTags.entryId, id: tags.id, name: tags.name, color: tags.color })
    .from(shelfEntryTags)
    .innerJoin(tags, eq(tags.id, shelfEntryTags.tagId))
    .where(inArray(shelfEntryTags.entryId, entryIds))
    .orderBy(asc(sql`lower(${tags.name})`));
  for (const row of rows) {
    const list = result.get(row.entryId) ?? [];
    list.push(asTag(row));
    result.set(row.entryId, list);
  }
  return result;
}

/** Garante que a entrada é da pessoa (usado antes de mexer nas tags dela). */
export async function ownsEntry(db: Db, userId: string, entryId: string): Promise<boolean> {
  const [row] = await db.select({ id: shelfEntries.id }).from(shelfEntries).where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId))).limit(1);
  return Boolean(row);
}
