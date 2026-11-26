import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/connect';
import { posts, postGames, shelfActivities, shelfEntries } from '@/lib/db/schema';
import { ACTIVITY_NOTE_MAX } from './activity-limits';
import { isShelfStatus, type ShelfStatus } from './status';

/**
 * Atividades do Game Shelf (`01_produto/regras-de-negocio/atividade-compartilhada.md`). Aqui só o registro e o
 * compartilhamento; o texto de cada atividade fica nas mensagens da tela.
 */
export const ACTIVITY_KINDS = ['added', 'started', 'finished', 'stopped', 'rated', 'review', 'screenshot'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const isActivityKind = (value: unknown): value is ActivityKind => typeof value === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(value);

/**
 * Relevância para o aviso de compartilhar (decisão de 26/11/2026): quando um salvamento gera várias atividades, o aviso
 * oferece a mais relevante. Review, depois nota, depois screenshot e, por último, a mudança de coluna.
 */
const RELEVANCE: Record<ActivityKind, number> = { review: 0, rated: 1, screenshot: 2, finished: 3, started: 3, stopped: 3, added: 3 };

/** Ordena as atividades da mais relevante para a menos (a ordem entre iguais é mantida). */
export const byRelevance = <T extends { kind: ActivityKind }>(list: T[]): T[] => [...list].sort((a, b) => RELEVANCE[a.kind] - RELEVANCE[b.kind]);

/** Edições seguidas da mesma nota ou review dentro desta janela viram uma só atividade. */
export const MERGE_WINDOW_MS = 5 * 60 * 1000;
export { ACTIVITY_NOTE_MAX };

/** O que a mudança de coluna vira: entrar em Quero jogar é "adicionou"; as outras três têm frase própria. */
export const kindForStatus = (status: ShelfStatus): ActivityKind =>
  status === 'quero-jogar' ? 'added' : status === 'jogando' ? 'started' : status === 'zerado' ? 'finished' : 'stopped';

export interface NewActivity {
  userId: string;
  entryId: string;
  gameId: string;
  kind: ActivityKind;
  status: ShelfStatus;
  platform?: string | null;
  rating?: number | null;
  playMinutes?: number | null;
  review?: string | null;
  screenshotRef?: string | null;
  spoiler?: boolean;
}

/** Oferta de compartilhar que as ações devolvem para a tela. */
export interface ActivityOffer {
  id: string;
  kind: ActivityKind;
}

/**
 * Registra uma atividade. Nota e review seguidas dentro de `MERGE_WINDOW_MS` na mesma entrada atualizam a anterior (e
 * não criam outra); se a anterior já virou post, ela fica como está e é a mesma atividade.
 */
export async function recordActivity(db: Db, input: NewActivity, now = new Date()): Promise<ActivityOffer> {
  const values = {
    status: input.status,
    platform: input.platform ?? null,
    rating: input.rating ?? null,
    playMinutes: input.playMinutes ?? null,
    review: input.review ?? null,
    screenshotRef: input.screenshotRef ?? null,
    spoiler: input.spoiler === true,
  };
  if (input.kind === 'rated' || input.kind === 'review') {
    const since = new Date(now.getTime() - MERGE_WINDOW_MS);
    const [recent] = await db
      .select({ id: shelfActivities.id, postId: posts.id })
      .from(shelfActivities)
      .leftJoin(posts, eq(posts.activityId, shelfActivities.id))
      .where(and(eq(shelfActivities.entryId, input.entryId), eq(shelfActivities.kind, input.kind), gte(shelfActivities.createdAt, since)))
      .orderBy(desc(shelfActivities.createdAt))
      .limit(1);
    if (recent) {
      if (!recent.postId) await db.update(shelfActivities).set({ ...values, createdAt: now }).where(eq(shelfActivities.id, recent.id));
      return { id: recent.id, kind: input.kind };
    }
  }
  const [row] = await db
    .insert(shelfActivities)
    .values({ userId: input.userId, entryId: input.entryId, gameId: input.gameId, kind: input.kind, createdAt: now, ...values })
    .returning({ id: shelfActivities.id });
  return { id: row.id, kind: input.kind };
}

/**
 * A entrada entrou ou mudou de coluna: registra a atividade da coluna atual, com a nota e o tempo que ela tem agora
 * (no post de "Zerou" eles só aparecem se a pessoa informou).
 */
export async function recordStatusActivity(db: Db, userId: string, entryId: string, now = new Date()): Promise<ActivityOffer | null> {
  const [entry] = await db
    .select({ gameId: shelfEntries.gameId, status: shelfEntries.status, platform: shelfEntries.platform, rating: shelfEntries.rating, playMinutes: shelfEntries.playMinutes })
    .from(shelfEntries)
    .where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.userId, userId)))
    .limit(1);
  if (!entry || !isShelfStatus(entry.status)) return null;
  return recordActivity(db, { userId, entryId, gameId: entry.gameId, kind: kindForStatus(entry.status), status: entry.status, platform: entry.platform, rating: entry.rating, playMinutes: entry.playMinutes }, now);
}

/**
 * A pessoa zerou o jogo e, logo depois (pop-up do Zerado), informou nota ou tempo: completa o "Zerou" recente que ainda
 * não virou post, em vez de criar outra atividade. Sem "Zerou" recente (ou já compartilhado), devolve `null`.
 */
export async function completeRecentFinished(db: Db, entryId: string, values: { rating: number | null; playMinutes: number | null }, now = new Date()): Promise<ActivityOffer | null> {
  const since = new Date(now.getTime() - MERGE_WINDOW_MS);
  const [recent] = await db
    .select({ id: shelfActivities.id, postId: posts.id })
    .from(shelfActivities)
    .leftJoin(posts, eq(posts.activityId, shelfActivities.id))
    .where(and(eq(shelfActivities.entryId, entryId), eq(shelfActivities.kind, 'finished'), gte(shelfActivities.createdAt, since)))
    .orderBy(desc(shelfActivities.createdAt))
    .limit(1);
  if (!recent || recent.postId) return null;
  await db.update(shelfActivities).set({ rating: values.rating, playMinutes: values.playMinutes }).where(eq(shelfActivities.id, recent.id));
  return { id: recent.id, kind: 'finished' };
}

export interface EntryActivity {
  id: string;
  kind: ActivityKind;
  status: ShelfStatus;
  rating: number | null;
  playMinutes: number | null;
  createdAt: Date;
  /** Post que compartilha esta atividade, se existir. */
  postId: string | null;
}

export const ENTRY_ACTIVITIES_LIMIT = 10;

/** "Atividade recente" da entrada, da mais nova para a mais antiga. Só a dona da entrada lê. */
export async function listEntryActivities(db: Db, userId: string, entryId: string): Promise<EntryActivity[]> {
  const rows = await db
    .select({
      id: shelfActivities.id,
      kind: shelfActivities.kind,
      status: shelfActivities.status,
      rating: shelfActivities.rating,
      playMinutes: shelfActivities.playMinutes,
      createdAt: shelfActivities.createdAt,
      postId: posts.id,
    })
    .from(shelfActivities)
    .leftJoin(posts, eq(posts.activityId, shelfActivities.id))
    .where(and(eq(shelfActivities.userId, userId), eq(shelfActivities.entryId, entryId)))
    .orderBy(desc(shelfActivities.createdAt), desc(shelfActivities.id))
    .limit(ENTRY_ACTIVITIES_LIMIT);
  return rows.flatMap((row) =>
    isActivityKind(row.kind) ? [{ id: row.id, kind: row.kind, status: row.status as ShelfStatus, rating: row.rating, playMinutes: row.playMinutes, createdAt: new Date(row.createdAt), postId: row.postId }] : [],
  );
}

export type ShareResult =
  | { ok: true; postId: string; alreadyShared: boolean }
  | { ok: false; error: 'not-found' | 'too-long' };

/**
 * Compartilha a atividade: cria o post de atividade (com o texto opcional). Só a dona compartilha. Cada atividade vira
 * no máximo um post enquanto ele existir: pedir de novo devolve o post que já existe. Review ou screenshot com spoiler
 * geram post com spoiler ativo.
 */
export async function shareActivity(db: Db, userId: string, activityId: string, note: unknown, now = new Date()): Promise<ShareResult> {
  const [activity] = await db
    .select()
    .from(shelfActivities)
    .where(and(eq(shelfActivities.id, activityId), eq(shelfActivities.userId, userId)))
    .limit(1);
  if (!activity) return { ok: false, error: 'not-found' };
  const body = typeof note === 'string' ? note.replace(/\r\n?/g, '\n').trim() : '';
  if (body.length > ACTIVITY_NOTE_MAX) return { ok: false, error: 'too-long' };

  const [created] = await db
    .insert(posts)
    .values({ userId, body, spoiler: activity.spoiler, activityId: activity.id, createdAt: now })
    .onConflictDoNothing({ target: posts.activityId })
    .returning({ id: posts.id });
  if (!created) {
    const [existing] = await db.select({ id: posts.id }).from(posts).where(eq(posts.activityId, activity.id)).limit(1);
    return { ok: true, postId: existing.id, alreadyShared: true };
  }
  // O jogo da atividade entra como jogo marcado do post (assim "Meus jogos" e o status do selo funcionam como nos outros posts).
  await db.insert(postGames).values({ postId: created.id, gameId: activity.gameId, position: 0 });
  return { ok: true, postId: created.id, alreadyShared: false };
}

/**
 * A entrada saiu da Game Shelf (ou a screenshot foi trocada): apaga as atividades que ainda não viraram post. As que
 * viraram post ficam, porque o post conta o que aconteceu. Devolve `true` quando a imagem pode sair do armazenamento
 * (nenhum post de atividade a usa).
 */
export async function releaseActivities(db: Db, entryId: string, screenshotRef: string | null): Promise<boolean> {
  const shared = db.select({ id: posts.activityId }).from(posts).where(sql`${posts.activityId} is not null`);
  await db
    .delete(shelfActivities)
    .where(
      and(
        eq(shelfActivities.entryId, entryId),
        screenshotRef ? eq(shelfActivities.screenshotRef, screenshotRef) : sql`false`,
        sql`${shelfActivities.id} not in (${shared})`,
      ),
    );
  if (!screenshotRef) return true;
  const [used] = await db
    .select({ id: shelfActivities.id })
    .from(shelfActivities)
    .innerJoin(posts, eq(posts.activityId, shelfActivities.id))
    .where(eq(shelfActivities.screenshotRef, screenshotRef))
    .limit(1);
  return !used;
}

/** Ao tirar o jogo da Game Shelf: as atividades sem post somem e as com post perdem só o vínculo com a entrada. */
export async function dropEntryActivities(db: Db, entryId: string): Promise<void> {
  const shared = db.select({ id: posts.activityId }).from(posts).where(sql`${posts.activityId} is not null`);
  await db.delete(shelfActivities).where(and(eq(shelfActivities.entryId, entryId), sql`${shelfActivities.id} not in (${shared})`));
}
