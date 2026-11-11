/** Os 4 status fixos do kanban da Game Shelf (`01_produto/regras-de-negocio/gameshelf.md`), na ordem das colunas. */
export const SHELF_STATUSES = ['quero-jogar', 'parado', 'jogando', 'zerado'] as const;

export type ShelfStatus = (typeof SHELF_STATUSES)[number];

export const STATUS_LABEL: Record<ShelfStatus, string> = {
  'quero-jogar': 'Quero jogar',
  parado: 'Parado',
  jogando: 'Jogando',
  zerado: 'Zerado',
};

export const isShelfStatus = (value: unknown): value is ShelfStatus =>
  typeof value === 'string' && (SHELF_STATUSES as readonly string[]).includes(value);
