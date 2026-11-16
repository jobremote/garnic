import type { ShelfStatus } from '@/lib/shelf/status';

/**
 * Ordem das linhas das marcas de jogo no post (decidido em 16/11/2026): Zerado, Jogando, Quero jogar e Parado. Os jogos
 * que não estão no Game Shelf de quem postou (sem status) ficam por último, em linha própria.
 */
export const GROUP_ORDER: readonly ShelfStatus[] = ['zerado', 'jogando', 'quero-jogar', 'parado'];

export interface StatusGroup<T> {
  /** `null`: jogos fora do Game Shelf de quem postou (linha sem selo). */
  status: ShelfStatus | null;
  items: T[];
}

/** Agrupa por status na ordem acima; dentro de cada grupo, mantém a ordem em que os jogos foram escolhidos. Sem grupos vazios. */
export function groupByStatus<T extends { status?: ShelfStatus | null }>(list: readonly T[]): StatusGroup<T>[] {
  const groups: StatusGroup<T>[] = [];
  for (const status of [...GROUP_ORDER, null]) {
    const items = list.filter((item) => (item.status ?? null) === status);
    if (items.length > 0) groups.push({ status, items });
  }
  return groups;
}
