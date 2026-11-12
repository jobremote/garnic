import { sql, type SQL } from 'drizzle-orm';

/**
 * Ordem manual dos cards dentro de cada coluna da Game Shelf (decisão do Leo, 12/11/2026).
 *
 * Cada entrada tem um `sort_order` (menor = mais acima). Os valores ficam separados por `SORT_STEP` para o topo ser
 * sempre "o menor da coluna menos um passo", numa instrução SQL só (o Neon HTTP não tem transações).
 */
export const SORT_STEP = 1024;

/** Valor para uma entrada entrar **no topo** da coluna `status` de quem é `userId` (subconsulta, sem corrida). */
export const topSortOrder = (userId: string, status: string): SQL<number> =>
  sql<number>`coalesce((select min(sort_order) from shelf_entries where user_id = ${userId}::uuid and status = ${status}::text), 0) - ${SORT_STEP}`;
